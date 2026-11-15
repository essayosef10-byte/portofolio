-- =====================================================================
-- Vortex Academy: Phase 5 - Course Access Requests (cross-year courses)
--
-- A student who carries a course from another academic year (same
-- department) asks the admin for access. The admin who manages that
-- course (or the super admin) approves / rejects / revokes.
-- An approved student can read the course and its APPROVED materials only.
--
-- Safe to re-run (idempotent). Additive only: no existing policy or
-- function is modified or dropped. No secrets, no personal data.
-- All client access goes through SECURITY DEFINER RPCs; the table itself
-- is closed (RLS on, no policies, no grants).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Table & indexes
-- ---------------------------------------------------------------------
create table if not exists public.course_access_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'revoked')),
  note text null check (note is null or char_length(note) <= 300),
  decided_by uuid null references public.profiles(id) on delete set null,
  decided_at timestamptz null,
  created_at timestamptz not null default now()
);

create unique index if not exists course_access_requests_active_uidx
  on public.course_access_requests (student_id, course_id)
  where status in ('pending', 'approved');

create index if not exists course_access_requests_course_status_idx
  on public.course_access_requests (course_id, status);

create index if not exists course_access_requests_student_idx
  on public.course_access_requests (student_id);

alter table public.course_access_requests enable row level security;
-- Intentionally NO policies: the client can never touch the table directly.
revoke all on public.course_access_requests from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Helper used by RLS: does the current student hold approved access?
-- ---------------------------------------------------------------------
create or replace function public.student_has_course_access(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    auth.uid() is not null
    and exists (
      select 1
      from public.course_access_requests r
      where r.student_id = auth.uid()
        and r.course_id = p_course_id
        and r.status = 'approved'
    ),
    false
  )
$$;

revoke execute on function public.student_has_course_access(uuid) from public, anon;
grant execute on function public.student_has_course_access(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Student RPCs
-- ---------------------------------------------------------------------

-- Courses of my department, offered ONLY to other years, not offered to my
-- own year, and with no pending/approved request from me.
create or replace function public.course_access_requestable()
returns table (
  id uuid,
  code text,
  title text,
  offered_years smallint[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول';
  end if;
  if public.is_admin() then
    raise exception 'هذه الخدمة للطلاب فقط';
  end if;
  if public.my_department() is null or public.my_academic_year() is null then
    raise exception 'أكمل بيانات القسم والفرقة أولاً';
  end if;

  return query
  select
    c.id,
    c.code::text,
    c.title::text,
    array_agg(distinct co.academic_year order by co.academic_year)::smallint[]
  from public.courses c
  join public.course_offerings co on co.course_id = c.id
  where c.status = 'active'::course_status
    and co.department = public.my_department()
    and co.academic_year <> public.my_academic_year()
    and not exists (
      select 1 from public.course_offerings mine
      where mine.course_id = c.id
        and mine.department = public.my_department()
        and mine.academic_year = public.my_academic_year()
    )
    and not exists (
      select 1 from public.course_access_requests r
      where r.course_id = c.id
        and r.student_id = auth.uid()
        and r.status in ('pending', 'approved')
    )
  group by c.id, c.code, c.title
  order by c.code;
end;
$$;

create or replace function public.course_access_request(
  p_course_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول';
  end if;
  if public.is_admin() then
    raise exception 'هذه الخدمة للطلاب فقط';
  end if;
  if p_course_id is null then
    raise exception 'المقرر غير محدد';
  end if;

  if not exists (
    select 1 from public.course_access_requestable() q where q.id = p_course_id
  ) then
    raise exception 'هذا المقرر غير متاح للطلب (أو لديك طلب نشط عليه بالفعل)';
  end if;

  if (
    select count(*) from public.course_access_requests r
    where r.student_id = auth.uid() and r.status = 'pending'
  ) >= 5 then
    raise exception 'وصلت للحد الأقصى: 5 طلبات قيد المراجعة';
  end if;

  v_note := nullif(left(btrim(coalesce(p_note, '')), 300), '');

  insert into public.course_access_requests (student_id, course_id, note)
  values (auth.uid(), p_course_id, v_note)
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'لديك طلب نشط على هذا المقرر بالفعل';
end;
$$;

create or replace function public.course_access_my_requests()
returns table (
  id uuid,
  course_id uuid,
  course_code text,
  course_title text,
  status text,
  note text,
  created_at timestamptz,
  decided_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول';
  end if;

  return query
  select
    r.id,
    r.course_id,
    c.code::text,
    c.title::text,
    r.status,
    r.note,
    r.created_at,
    r.decided_at
  from public.course_access_requests r
  join public.courses c on c.id = r.course_id
  where r.student_id = auth.uid()
  order by r.created_at desc;
end;
$$;

create or replace function public.course_access_cancel(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول';
  end if;

  delete from public.course_access_requests r
  where r.id = p_request_id
    and r.student_id = auth.uid()
    and r.status = 'pending';

  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'لا يمكن إلغاء هذا الطلب (غير موجود أو تم البت فيه)';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Admin RPCs (scoped by admin_can_access_course; super admin sees all)
-- ---------------------------------------------------------------------
create or replace function public.course_access_admin_list(p_status text default 'pending')
returns table (
  id uuid,
  course_id uuid,
  course_code text,
  course_title text,
  student_id uuid,
  student_name text,
  student_department text,
  student_academic_year smallint,
  status text,
  note text,
  created_at timestamptz,
  decided_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول';
  end if;
  if not public.is_admin() then
    raise exception 'غير مصرح';
  end if;
  if p_status is null or p_status not in ('pending', 'approved', 'rejected', 'revoked') then
    raise exception 'حالة غير صحيحة';
  end if;

  -- Only name / department / year of the student: never phone or GPA.
  return query
  select
    r.id,
    r.course_id,
    c.code::text,
    c.title::text,
    r.student_id,
    p.full_name::text,
    p.department::text,
    p.academic_year::smallint,
    r.status,
    r.note,
    r.created_at,
    r.decided_at
  from public.course_access_requests r
  join public.courses c on c.id = r.course_id
  join public.profiles p on p.id = r.student_id
  where r.status = p_status
    and public.admin_can_access_course(r.course_id)
  order by r.created_at desc
  limit 200;
end;
$$;

create or replace function public.course_access_decide(
  p_request_id uuid,
  p_decision text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.course_access_requests%rowtype;
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول';
  end if;
  if not public.is_admin() then
    raise exception 'غير مصرح';
  end if;
  if p_decision is null or p_decision not in ('approved', 'rejected', 'revoked') then
    raise exception 'قرار غير صحيح';
  end if;

  select * into v_req
  from public.course_access_requests r
  where r.id = p_request_id
  for update;

  if not found then
    raise exception 'الطلب غير موجود';
  end if;

  if not public.admin_can_access_course(v_req.course_id) then
    raise exception 'هذا المقرر خارج نطاق صلاحيتك';
  end if;

  if not (
    (v_req.status = 'pending' and p_decision in ('approved', 'rejected'))
    or (v_req.status = 'approved' and p_decision = 'revoked')
  ) then
    raise exception 'لا يمكن تنفيذ هذا القرار على طلب حالته: %', v_req.status;
  end if;

  update public.course_access_requests
  set status = p_decision,
      decided_by = auth.uid(),
      decided_at = now()
  where id = p_request_id;
end;
$$;

create or replace function public.course_access_pending_count()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null or not public.is_admin() then
    return 0;
  end if;

  select count(*)::integer into v_count
  from public.course_access_requests r
  where r.status = 'pending'
    and public.admin_can_access_course(r.course_id);

  return coalesce(v_count, 0);
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Execute grants: authenticated only
-- ---------------------------------------------------------------------
revoke execute on function public.course_access_requestable() from public, anon;
revoke execute on function public.course_access_request(uuid, text) from public, anon;
revoke execute on function public.course_access_my_requests() from public, anon;
revoke execute on function public.course_access_cancel(uuid) from public, anon;
revoke execute on function public.course_access_admin_list(text) from public, anon;
revoke execute on function public.course_access_decide(uuid, text, text) from public, anon;
revoke execute on function public.course_access_pending_count() from public, anon;

grant execute on function public.course_access_requestable() to authenticated;
grant execute on function public.course_access_request(uuid, text) to authenticated;
grant execute on function public.course_access_my_requests() to authenticated;
grant execute on function public.course_access_cancel(uuid) to authenticated;
grant execute on function public.course_access_admin_list(text) to authenticated;
grant execute on function public.course_access_decide(uuid, text, text) to authenticated;
grant execute on function public.course_access_pending_count() to authenticated;

-- ---------------------------------------------------------------------
-- 6. Additive SELECT policies (existing policies are untouched)
-- ---------------------------------------------------------------------
drop policy if exists "Students view courses with approved access" on public.courses;
create policy "Students view courses with approved access" on public.courses
  for select to authenticated
  using (
    status = 'active'::course_status
    and public.student_has_course_access(id)
  );

drop policy if exists "Students view approved materials with course access" on public.materials;
create policy "Students view approved materials with course access" on public.materials
  for select to authenticated
  using (
    status = 'approved'::material_status
    and public.student_has_course_access(course_id)
  );

-- ---------------------------------------------------------------------
-- 7. Companion files (separate):
--    supabase/phase5-rollback.sql  (drops policies, functions, table)
-- ---------------------------------------------------------------------
