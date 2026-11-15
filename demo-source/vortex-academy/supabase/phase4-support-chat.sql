-- =====================================================================
-- Vortex Academy: Phase 4 - Support Chat (Student <-> Scoped Admin / Super Admin)
--
-- Implements an anonymous-alias support messaging system enforced strictly
-- via Row-Level Security (RLS) and SECURITY DEFINER RPC functions:
--   * Students see only an anonymous symbol + random contact_ref for
--     eligible admins in their (department, academic_year) scope, plus a
--     fixed Super Admin contact. Students never see admin_id or admin_name.
--   * Regular admins see only their own threads (provided student is still in scope)
--     and only the student's full_name, department, and academic_year.
--   * Super Admin sees all threads, marks student messages as read in to_super threads,
--     and sees null admin symbols/names for deleted/unassigned admins.
--   * Role checks happen dynamically on every RPC call so demoting an admin
--     revokes access to their threads immediately.
--
-- Safe to re-run (idempotent). Does not modify or drop any existing
-- policy or function from Phases 1-3.
-- Contains no secrets and no personal data.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tables & Indexes
-- ---------------------------------------------------------------------

create table if not exists public.admin_aliases (
  admin_id uuid primary key references public.profiles(id) on delete cascade,
  contact_ref uuid unique not null default gen_random_uuid(),
  symbol text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists public.support_threads (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  admin_id uuid null references public.profiles(id) on delete set null,
  to_super boolean not null default false,
  subject text not null check (char_length(btrim(subject)) between 1 and 120),
  course_id uuid null references public.courses(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

-- تحديث الـ constraint الخاص بـ support_threads للسماح بمحادثة بدون admin_id في حالة الأدمن المحذوف
alter table public.support_threads drop constraint if exists support_threads_target_check;
alter table public.support_threads add constraint support_threads_target_check check (not to_super or admin_id is null);

-- محادثة واحدة لكل (طالب، أدمن) وواحدة لكل (طالب، سوبر)
create unique index if not exists support_threads_student_admin_uidx
  on public.support_threads (student_id, admin_id)
  where not to_super and admin_id is not null;

create unique index if not exists support_threads_student_super_uidx
  on public.support_threads (student_id)
  where to_super;

create index if not exists support_threads_student_last_msg_idx
  on public.support_threads (student_id, last_message_at desc);

create index if not exists support_threads_admin_last_msg_idx
  on public.support_threads (admin_id, last_message_at desc);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_threads(id) on delete cascade,
  sender_id uuid null references public.profiles(id) on delete set null,
  sender_kind text not null check (sender_kind in ('student', 'admin', 'super')),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz null
);

create index if not exists support_messages_thread_created_idx
  on public.support_messages (thread_id, created_at);

create index if not exists support_messages_sender_created_idx
  on public.support_messages (sender_id, created_at desc);

-- ---------------------------------------------------------------------
-- 2. Enable RLS, Revoke Direct Table Access, and Add Super Admin Policies
-- ---------------------------------------------------------------------

alter table public.admin_aliases enable row level security;
alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;

revoke all on public.admin_aliases from public, anon, authenticated;
revoke all on public.support_threads from public, anon, authenticated;
revoke all on public.support_messages from public, anon, authenticated;

grant all on public.admin_aliases to service_role;
grant all on public.support_threads to service_role;
grant all on public.support_messages to service_role;

drop policy if exists "Super admin views admin_aliases" on public.admin_aliases;
drop policy if exists "Super admin views support_threads" on public.support_threads;
drop policy if exists "Super admin views support_messages" on public.support_messages;

-- تمنع الطلاب والأدمن العاديين من قراءة جدول رموز الأدمن مباشرة، وتقصر القراءة المباشرة على السوبر أدمن فقط.
create policy "Super admin views admin_aliases" on public.admin_aliases
  for select to authenticated
  using (public.is_super_admin());

-- تمنع الطلاب والأدمن العاديين من قراءة جدول المحادثات مباشرة، وتقصر القراءة المباشرة على السوبر أدمن فقط.
create policy "Super admin views support_threads" on public.support_threads
  for select to authenticated
  using (public.is_super_admin());

-- تمنع الطلاب والأدمن العاديين من قراءة جدول الرسائل مباشرة، وتقصر القراءة المباشرة على السوبر أدمن فقط.
create policy "Super admin views support_messages" on public.support_messages
  for select to authenticated
  using (public.is_super_admin());

-- ---------------------------------------------------------------------
-- 3. Internal Helper Functions (SECURITY DEFINER, not callable by clients)
-- ---------------------------------------------------------------------

-- Checks if p_admin_id is an eligible regular admin for a student in (p_dept, p_year).
create or replace function public.support_is_eligible_admin(
  p_dept text,
  p_year smallint,
  p_admin_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    p_dept is not null
    and p_year is not null
    and p_admin_id is not null
    and exists (
      select 1
      from public.profiles a
      where a.id = p_admin_id
        and a.role = 'admin'::user_role
        and coalesce(a.is_super_admin, false) = false
        and a.department = p_dept
        and (
          a.academic_year = p_year
          or exists (
            select 1
            from public.admin_scopes s
            where s.admin_id = a.id
              and s.academic_year = p_year
          )
        )
    ),
    false
  )
$$;

-- Lazily assigns a unique symbol to p_admin_id from a fixed 30-emoji pool,
-- falling back to '#31', '#32', ... using INSERT ... ON CONFLICT DO NOTHING.
create or replace function public.support_ensure_admin_alias(p_admin_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_emojis constant text[] := array[
    '🦁','🦅','🦉','🐬','🦋','🦊','🐢','🐝','🦌','🦢',
    '🦚','🦜','🐳','🦭','🦦','🐿️','🦔','🦩','🕊️','🦫',
    '🌵','🌴','🌻','🍁','🌙','⭐','⚡','🔥','💎','🧭'
  ];
  v_symbol text;
  v_next_num integer;
  v_attempt integer;
begin
  if p_admin_id is null then
    return;
  end if;

  for v_attempt in 1..35 loop
    if exists (select 1 from public.admin_aliases aa where aa.admin_id = p_admin_id) then
      return;
    end if;

    select e.sym
      into v_symbol
      from unnest(v_emojis) with ordinality as e(sym, ord)
     where not exists (
       select 1 from public.admin_aliases aa where aa.symbol = e.sym
     )
     order by e.ord
     limit 1;

    if v_symbol is null then
      select s.n
        into v_next_num
        from generate_series(31, 10000) as s(n)
       where not exists (
         select 1 from public.admin_aliases aa where aa.symbol = ('#' || s.n::text)
       )
       order by s.n
       limit 1;

      v_symbol := '#' || coalesce(v_next_num, 31)::text;
    end if;

    insert into public.admin_aliases (admin_id, symbol)
    values (p_admin_id, v_symbol)
    on conflict do nothing;

    if exists (select 1 from public.admin_aliases aa where aa.admin_id = p_admin_id) then
      return;
    end if;
  end loop;
end;
$$;

revoke execute on function public.support_is_eligible_admin(text, smallint, uuid) from public, anon, authenticated;
revoke execute on function public.support_ensure_admin_alias(uuid) from public, anon, authenticated;
grant execute on function public.support_is_eligible_admin(text, smallint, uuid) to service_role;
grant execute on function public.support_ensure_admin_alias(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 4. RPC Functions for Students, Admins, and Super Admin
-- ---------------------------------------------------------------------

-- 4.1) Student: list eligible contacts (anonymous symbol + contact_ref) + fixed Super Admin row
create or replace function public.support_list_contacts()
returns table (
  contact_ref uuid,
  symbol text,
  is_super boolean
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role user_role;
  v_is_super boolean;
  v_dept text;
  v_year smallint;
  v_admin_record record;
begin
  if v_uid is null then
    raise exception 'يجب تسجيل الدخول أولاً' using errcode = '42501';
  end if;

  select p.role, coalesce(p.is_super_admin, false), p.department, p.academic_year
    into v_role, v_is_super, v_dept, v_year
    from public.profiles p
   where p.id = v_uid;

  if v_role is distinct from 'student'::user_role or v_is_super then
    raise exception 'هذه الخدمة متاحة لحسابات الطلاب فقط' using errcode = '42501';
  end if;

  if v_dept is not null and v_year is not null then
    for v_admin_record in
      select a.id
        from public.profiles a
       where a.role = 'admin'::user_role
         and coalesce(a.is_super_admin, false) = false
         and a.department = v_dept
         and (
           a.academic_year = v_year
           or exists (
             select 1
               from public.admin_scopes s
              where s.admin_id = a.id
                and s.academic_year = v_year
           )
         )
    loop
      perform public.support_ensure_admin_alias(v_admin_record.id);
    end loop;
  end if;

  return query
  select sub.contact_ref, sub.symbol, sub.is_super
  from (
    select null::uuid as contact_ref, null::text as symbol, true as is_super
    union all
    select aa.contact_ref, aa.symbol, false as is_super
      from public.admin_aliases aa
      join public.profiles a on a.id = aa.admin_id
     where v_dept is not null
       and v_year is not null
       and a.role = 'admin'::user_role
       and coalesce(a.is_super_admin, false) = false
       and a.department = v_dept
       and (
         a.academic_year = v_year
         or exists (
           select 1
             from public.admin_scopes s
            where s.admin_id = a.id
              and s.academic_year = v_year
         )
       )
  ) sub
  order by sub.is_super desc, sub.symbol asc nulls first;
end;
$$;

-- 4.2) Shared: send a message in an open thread (enforces role, open status, 500 msg cap, and rate limits)
create or replace function public.support_send_message(
  p_thread_id uuid,
  p_body text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role user_role;
  v_is_super boolean;
  v_sender_kind text;
  v_thread public.support_threads%rowtype;
  v_clean_body text;
  v_thread_msg_count integer;
  v_last_min_count integer;
  v_last_day_count integer;
  v_message_id uuid;
  v_student_profile public.profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'يجب تسجيل الدخول أولاً' using errcode = '42501';
  end if;

  if p_thread_id is null then
    raise exception 'معرف المحادثة مطلوب' using errcode = '22023';
  end if;

  v_clean_body := btrim(coalesce(p_body, ''));
  if char_length(v_clean_body) < 1 or char_length(v_clean_body) > 2000 then
    raise exception 'نص الرسالة يجب أن يكون بين حرف واحد و2000 حرف' using errcode = '22023';
  end if;

  select p.role, coalesce(p.is_super_admin, false)
    into v_role, v_is_super
    from public.profiles p
   where p.id = v_uid;

  if v_role is null then
    raise exception 'الحساب غير موجود' using errcode = '42501';
  end if;

  select t.*
    into v_thread
    from public.support_threads t
   where t.id = p_thread_id
   for update;

  if not found then
    raise exception 'المحادثة غير موجودة أو ليس لديك صلاحية للوصول إليها' using errcode = '42501';
  end if;

  -- فحص الأدمن المحذوف أولاً قبل فرز الصلاحيات حتى لا يتغطى برفض الأدمن
  if not v_thread.to_super and v_thread.admin_id is null and not (v_role = 'admin'::user_role and v_is_super) then
    raise exception 'الأدمن المسؤول عن هذه المحادثة لم يعد متاحاً' using errcode = 'P0001';
  end if;

  if v_role = 'admin'::user_role and v_is_super then
    v_sender_kind := 'super';
  elsif v_role = 'admin'::user_role and not v_is_super then
    if v_thread.to_super or v_thread.admin_id is distinct from v_uid then
      raise exception 'ليس لديك صلاحية لإرسال رسائل في هذه المحادثة' using errcode = '42501';
    end if;
    select sp.* into v_student_profile from public.profiles sp where sp.id = v_thread.student_id;
    if not public.support_is_eligible_admin(v_student_profile.department, v_student_profile.academic_year, v_uid) then
      raise exception 'ليس لديك صلاحية لإرسال رسائل في هذه المحادثة' using errcode = '42501';
    end if;
    v_sender_kind := 'admin';
  elsif v_role = 'student'::user_role and not v_is_super and v_thread.student_id = v_uid then
    v_sender_kind := 'student';
  else
    raise exception 'ليس لديك صلاحية لإرسال رسائل في هذه المحادثة' using errcode = '42501';
  end if;

  if v_thread.status <> 'open' then
    raise exception 'هذه المحادثة مغلقة ولا يمكن إرسال رسائل جديدة فيها' using errcode = 'P0001';
  end if;

  select count(*)::integer
    into v_thread_msg_count
    from public.support_messages m
   where m.thread_id = p_thread_id;

  if v_thread_msg_count >= 500 then
    raise exception 'تم الوصول للحد الأقصى لعدد الرسائل في هذه المحادثة (500 رسالة)' using errcode = 'P0001';
  end if;

  select count(*)::integer
    into v_last_min_count
    from public.support_messages m
   where m.sender_id = v_uid
     and m.created_at > now() - interval '1 minute';

  if v_last_min_count >= 10 then
    raise exception 'لقد تجاوزت الحد المسموح للإرسال (10 رسائل في الدقيقة). يرجى الانتظار قليلاً.' using errcode = 'P0001';
  end if;

  if v_sender_kind = 'student' then
    select count(*)::integer
      into v_last_day_count
      from public.support_messages m
     where m.sender_id = v_uid
       and m.created_at > now() - interval '1 day';

    if v_last_day_count >= 200 then
      raise exception 'لقد تجاوزت الحد اليومي المسموح لإرسال الرسائل (200 رسالة في اليوم).' using errcode = 'P0001';
    end if;
  end if;

  insert into public.support_messages (
    thread_id,
    sender_id,
    sender_kind,
    body,
    created_at
  )
  values (
    p_thread_id,
    v_uid,
    v_sender_kind,
    v_clean_body,
    now()
  )
  returning id into v_message_id;

  update public.support_threads t
     set last_message_at = now()
   where t.id = p_thread_id;

  return v_message_id;
end;
$$;

-- 4.3) Student: start a thread (or reuse existing one) and send the first message
create or replace function public.support_start_thread(
  p_contact_ref uuid,
  p_to_super boolean,
  p_subject text,
  p_course_id uuid,
  p_first_message text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role user_role;
  v_is_super boolean;
  v_dept text;
  v_year smallint;
  v_target_super boolean := coalesce(p_to_super, false);
  v_target_admin_id uuid := null;
  v_clean_subject text;
  v_clean_first_msg text;
  v_thread_id uuid;
  v_open_count integer;
begin
  if v_uid is null then
    raise exception 'يجب تسجيل الدخول أولاً' using errcode = '42501';
  end if;

  select p.role, coalesce(p.is_super_admin, false), p.department, p.academic_year
    into v_role, v_is_super, v_dept, v_year
    from public.profiles p
   where p.id = v_uid;

  if v_role is distinct from 'student'::user_role or v_is_super then
    raise exception 'هذه الخدمة متاحة لحسابات الطلاب فقط' using errcode = '42501';
  end if;

  if v_dept is null or v_year is null then
    raise exception 'يرجى استكمال بيانات القسم والفرقة الدراسية أولاً' using errcode = 'P0001';
  end if;

  v_clean_first_msg := btrim(coalesce(p_first_message, ''));
  if char_length(v_clean_first_msg) < 1 or char_length(v_clean_first_msg) > 2000 then
    raise exception 'نص الرسالة الأولى يجب أن يكون بين حرف واحد و2000 حرف' using errcode = '22023';
  end if;

  if p_course_id is not null then
    if not exists (
      select 1
        from public.courses c
        join public.course_offerings co on co.course_id = c.id
       where c.id = p_course_id
         and c.status = 'active'::course_status
         and co.department = v_dept
         and co.academic_year = v_year
    ) then
      raise exception 'المقرر المحدد غير متاح لقسمك وفرقتك الدراسية' using errcode = '42501';
    end if;
  end if;

  if v_target_super then
    if p_contact_ref is not null then
      raise exception 'لا يمكن تحديد رمز أدمن عند مراسلة المسؤول الأعلى' using errcode = '22023';
    end if;

    select t.id
      into v_thread_id
      from public.support_threads t
     where t.student_id = v_uid
       and t.to_super = true
     limit 1;
  else
    if p_contact_ref is null then
      raise exception 'يرجى اختيار مستلم صالح للمحادثة' using errcode = '22023';
    end if;

    select aa.admin_id
      into v_target_admin_id
      from public.admin_aliases aa
     where aa.contact_ref = p_contact_ref;

    if v_target_admin_id is null or not public.support_is_eligible_admin(v_dept, v_year, v_target_admin_id) then
      raise exception 'هذا المستلم غير متاح لنطاق قسمك وفرقتك الدراسية' using errcode = '42501';
    end if;

    select t.id
      into v_thread_id
      from public.support_threads t
     where t.student_id = v_uid
       and not t.to_super
       and t.admin_id = v_target_admin_id
     limit 1;
  end if;

  if v_thread_id is null then
    v_clean_subject := btrim(coalesce(p_subject, ''));
    if char_length(v_clean_subject) < 1 or char_length(v_clean_subject) > 120 then
      raise exception 'عنوان المحادثة يجب أن يكون بين حرف واحد و120 حرفاً' using errcode = '22023';
    end if;

    select count(*)::integer
      into v_open_count
      from public.support_threads t
     where t.student_id = v_uid
       and t.status = 'open';

    if v_open_count >= 5 then
      raise exception 'لقد وصلت للحد الأقصى للمحادثات المفتوحة (5 محادثات)' using errcode = 'P0001';
    end if;

    insert into public.support_threads (
      student_id,
      admin_id,
      to_super,
      subject,
      course_id,
      status,
      created_at,
      last_message_at
    )
    values (
      v_uid,
      v_target_admin_id,
      v_target_super,
      v_clean_subject,
      p_course_id,
      'open',
      now(),
      now()
    )
    on conflict do nothing
    returning id into v_thread_id;

    if v_thread_id is null then
      if v_target_super then
        select t.id
          into v_thread_id
          from public.support_threads t
         where t.student_id = v_uid
           and t.to_super = true
         limit 1;
      else
        select t.id
          into v_thread_id
          from public.support_threads t
         where t.student_id = v_uid
           and not t.to_super
           and t.admin_id = v_target_admin_id
         limit 1;
      end if;
    end if;
  end if;

  perform public.support_send_message(v_thread_id, v_clean_first_msg);

  return v_thread_id;
end;
$$;

-- 4.4) Student: list own threads (never exposes admin_id or admin_name)
create or replace function public.support_my_threads()
returns table (
  id uuid,
  symbol text,
  is_super boolean,
  subject text,
  status text,
  last_message_at timestamptz,
  unread_count integer,
  preview text,
  course_code text,
  course_title text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role user_role;
  v_is_super boolean;
begin
  if v_uid is null then
    raise exception 'يجب تسجيل الدخول أولاً' using errcode = '42501';
  end if;

  select p.role, coalesce(p.is_super_admin, false)
    into v_role, v_is_super
    from public.profiles p
   where p.id = v_uid;

  if v_role is distinct from 'student'::user_role or v_is_super then
    raise exception 'هذه الخدمة متاحة لحسابات الطلاب فقط' using errcode = '42501';
  end if;

  return query
  select
    t.id,
    case
      when t.to_super then null::text
      when t.admin_id is null then '—'::text
      else aa.symbol
    end as symbol,
    t.to_super as is_super,
    t.subject,
    t.status,
    t.last_message_at,
    (
      select count(*)::integer
        from public.support_messages m
       where m.thread_id = t.id
         and m.sender_kind in ('admin', 'super')
         and m.read_at is null
    ) as unread_count,
    (
      select left(btrim(m2.body), 80)
        from public.support_messages m2
       where m2.thread_id = t.id
       order by m2.created_at desc, m2.id desc
       limit 1
    ) as preview,
    crs.code as course_code,
    crs.title as course_title
  from public.support_threads t
  left join public.admin_aliases aa
    on not t.to_super and aa.admin_id = t.admin_id
  left join public.courses crs
    on crs.id = t.course_id
  where t.student_id = v_uid
  order by t.last_message_at desc, t.id desc;
end;
$$;

-- 4.5) Admin / Super Admin: list threads
-- Regular admin sees only their own threads (where student is still in scope) and receives NULL for admin_symbol & admin_name.
-- Super admin sees all threads and receives admin_symbol & admin_name (or null if admin_id is null).
create or replace function public.support_admin_threads()
returns table (
  id uuid,
  student_name text,
  student_department text,
  student_academic_year smallint,
  subject text,
  status text,
  last_message_at timestamptz,
  unread_count integer,
  preview text,
  admin_symbol text,
  admin_name text,
  course_code text,
  course_title text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role user_role;
  v_is_super boolean;
begin
  if v_uid is null then
    raise exception 'يجب تسجيل الدخول أولاً' using errcode = '42501';
  end if;

  select p.role, coalesce(p.is_super_admin, false)
    into v_role, v_is_super
    from public.profiles p
   where p.id = v_uid;

  if v_role is distinct from 'admin'::user_role then
    raise exception 'هذه الصفحة متاحة لمسؤولي النظام فقط' using errcode = '42501';
  end if;

  return query
  select
    t.id,
    stu.full_name as student_name,
    stu.department as student_department,
    stu.academic_year::smallint as student_academic_year,
    t.subject,
    t.status,
    t.last_message_at,
    (
      select count(*)::integer
        from public.support_messages m
       where m.thread_id = t.id
         and m.sender_kind = 'student'
         and m.read_at is null
    ) as unread_count,
    (
      select left(btrim(m2.body), 80)
        from public.support_messages m2
       where m2.thread_id = t.id
       order by m2.created_at desc, m2.id desc
       limit 1
    ) as preview,
    case when v_is_super and not t.to_super and t.admin_id is not null then aa.symbol else null::text end as admin_symbol,
    case when v_is_super and not t.to_super and t.admin_id is not null then adm.full_name else null::text end as admin_name,
    crs.code as course_code,
    crs.title as course_title
  from public.support_threads t
  join public.profiles stu on stu.id = t.student_id
  left join public.profiles adm on not t.to_super and adm.id = t.admin_id
  left join public.admin_aliases aa on not t.to_super and aa.admin_id = t.admin_id
  left join public.courses crs on crs.id = t.course_id
  where (
    v_is_super
    or (
      not t.to_super
      and t.admin_id = v_uid
      and public.support_is_eligible_admin(stu.department, stu.academic_year, v_uid)
    )
  )
  order by t.last_message_at desc, t.id desc;
end;
$$;

-- 4.6) Shared: fetch thread messages (never returns sender_id; marks unread messages read.
-- Super Admin marks student messages as read in to_super threads; regular admin marks student messages as read;
-- student marks admin/super messages as read)
create or replace function public.support_thread_messages(
  p_thread_id uuid,
  p_after timestamptz default null
)
returns table (
  id uuid,
  sender_kind text,
  is_mine boolean,
  body text,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role user_role;
  v_is_super boolean;
  v_thread public.support_threads%rowtype;
  v_student_profile public.profiles%rowtype;
  v_caller_mode text;
begin
  if v_uid is null then
    raise exception 'يجب تسجيل الدخول أولاً' using errcode = '42501';
  end if;

  if p_thread_id is null then
    raise exception 'معرف المحادثة مطلوب' using errcode = '22023';
  end if;

  select p.role, coalesce(p.is_super_admin, false)
    into v_role, v_is_super
    from public.profiles p
   where p.id = v_uid;

  if v_role is null then
    raise exception 'الحساب غير موجود' using errcode = '42501';
  end if;

  select t.*
    into v_thread
    from public.support_threads t
   where t.id = p_thread_id;

  if not found then
    raise exception 'المحادثة غير موجودة أو ليس لديك صلاحية للوصول إليها' using errcode = '42501';
  end if;

  select sp.* into v_student_profile from public.profiles sp where sp.id = v_thread.student_id;

  if v_role = 'admin'::user_role and v_is_super then
    v_caller_mode := 'super';
  elsif v_role = 'admin'::user_role and not v_is_super then
    if v_thread.to_super or v_thread.admin_id is distinct from v_uid then
      raise exception 'ليس لديك صلاحية للوصول إلى هذه المحادثة' using errcode = '42501';
    end if;
    if not public.support_is_eligible_admin(v_student_profile.department, v_student_profile.academic_year, v_uid) then
      raise exception 'ليس لديك صلاحية للوصول إلى هذه المحادثة' using errcode = '42501';
    end if;
    v_caller_mode := 'admin';
  elsif v_role = 'student'::user_role and not v_is_super and v_thread.student_id = v_uid then
    v_caller_mode := 'student';
  else
    raise exception 'ليس لديك صلاحية للوصول إلى هذه المحادثة' using errcode = '42501';
  end if;

  -- Mark unread messages from the other party as read.
  -- Super Admin marks student messages as read only when to_super = true.
  if v_caller_mode = 'student' then
    update public.support_messages m
       set read_at = now()
     where m.thread_id = p_thread_id
       and m.sender_kind in ('admin', 'super')
       and m.read_at is null;
  elsif v_caller_mode = 'admin' then
    update public.support_messages m
       set read_at = now()
     where m.thread_id = p_thread_id
       and m.sender_kind = 'student'
       and m.read_at is null;
  elsif v_caller_mode = 'super' and v_thread.to_super then
    update public.support_messages m
       set read_at = now()
     where m.thread_id = p_thread_id
       and m.sender_kind = 'student'
       and m.read_at is null;
  end if;

  return query
  select
    m.id,
    m.sender_kind,
    coalesce(m.sender_id = v_uid, false) as is_mine,
    m.body,
    m.created_at
  from public.support_messages m
  where m.thread_id = p_thread_id
    and (p_after is null or m.created_at > p_after)
  order by m.created_at asc, m.id asc;
end;
$$;

-- 4.7) Shared: close or reopen a thread (allowed for either party of the thread or Super Admin)
create or replace function public.support_close_thread(
  p_thread_id uuid,
  p_closed boolean
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role user_role;
  v_is_super boolean;
  v_thread public.support_threads%rowtype;
  v_student_profile public.profiles%rowtype;
  v_target_status text := case when coalesce(p_closed, true) then 'closed' else 'open' end;
  v_open_count integer;
  v_is_authorized boolean := false;
begin
  if v_uid is null then
    raise exception 'يجب تسجيل الدخول أولاً' using errcode = '42501';
  end if;

  select p.role, coalesce(p.is_super_admin, false)
    into v_role, v_is_super
    from public.profiles p
   where p.id = v_uid;

  if v_role is null then
    raise exception 'الحساب غير موجود' using errcode = '42501';
  end if;

  select t.*
    into v_thread
    from public.support_threads t
   where t.id = p_thread_id
   for update;

  if not found then
    raise exception 'المحادثة غير موجودة أو ليس لديك صلاحية للوصول إليها' using errcode = '42501';
  end if;

  select sp.* into v_student_profile from public.profiles sp where sp.id = v_thread.student_id;

  if v_role = 'admin'::user_role and v_is_super then
    v_is_authorized := true;
  elsif v_role = 'admin'::user_role and not v_is_super and not v_thread.to_super and v_thread.admin_id = v_uid then
    if public.support_is_eligible_admin(v_student_profile.department, v_student_profile.academic_year, v_uid) then
      v_is_authorized := true;
    end if;
  elsif v_role = 'student'::user_role and not v_is_super and v_thread.student_id = v_uid then
    v_is_authorized := true;
  end if;

  if not v_is_authorized then
    raise exception 'ليس لديك صلاحية لتعديل حالة هذه المحادثة' using errcode = '42501';
  end if;

  if v_role = 'student'::user_role
     and not v_is_super
     and v_target_status = 'open'
     and v_thread.status = 'closed' then
    select count(*)::integer
      into v_open_count
      from public.support_threads t
     where t.student_id = v_uid
       and t.status = 'open';

    if v_open_count >= 5 then
      raise exception 'لقد وصلت للحد الأقصى للمحادثات المفتوحة (5 محادثات)' using errcode = 'P0001';
    end if;
  end if;

  update public.support_threads t
     set status = v_target_status
   where t.id = p_thread_id;

  return true;
end;
$$;

-- 4.8) Shared: total unread messages count for notification badge
create or replace function public.support_unread_total()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role user_role;
  v_is_super boolean;
  v_total integer := 0;
begin
  if v_uid is null then
    return 0;
  end if;

  select p.role, coalesce(p.is_super_admin, false)
    into v_role, v_is_super
    from public.profiles p
   where p.id = v_uid;

  if v_role = 'student'::user_role and not v_is_super then
    select count(*)::integer
      into v_total
      from public.support_messages m
      join public.support_threads t on t.id = m.thread_id
     where t.student_id = v_uid
       and m.sender_kind in ('admin', 'super')
       and m.read_at is null;
  elsif v_role = 'admin'::user_role and not v_is_super then
    select count(*)::integer
      into v_total
      from public.support_messages m
      join public.support_threads t on t.id = m.thread_id
      join public.profiles stu on stu.id = t.student_id
     where not t.to_super
       and t.admin_id = v_uid
       and public.support_is_eligible_admin(stu.department, stu.academic_year, v_uid)
       and m.sender_kind = 'student'
       and m.read_at is null;
  elsif v_role = 'admin'::user_role and v_is_super then
    select count(*)::integer
      into v_total
      from public.support_messages m
      join public.support_threads t on t.id = m.thread_id
     where t.to_super = true
       and m.sender_kind = 'student'
       and m.read_at is null;
  end if;

  return coalesce(v_total, 0);
end;
$$;

-- 4.9) Super Admin only: permanently delete a thread and its messages
create or replace function public.support_delete_thread(p_thread_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_deleted integer := 0;
begin
  if v_uid is null or not public.is_super_admin() then
    raise exception 'فقط المسؤول الأعلى يمكنه حذف المحادثات' using errcode = '42501';
  end if;

  delete from public.support_threads t
   where t.id = p_thread_id;

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Function Grants & Revokes
-- ---------------------------------------------------------------------

revoke execute on function public.support_list_contacts() from public, anon;
revoke execute on function public.support_start_thread(uuid, boolean, text, uuid, text) from public, anon;
revoke execute on function public.support_my_threads() from public, anon;
revoke execute on function public.support_admin_threads() from public, anon;
revoke execute on function public.support_thread_messages(uuid, timestamptz) from public, anon;
revoke execute on function public.support_send_message(uuid, text) from public, anon;
revoke execute on function public.support_close_thread(uuid, boolean) from public, anon;
revoke execute on function public.support_unread_total() from public, anon;
revoke execute on function public.support_delete_thread(uuid) from public, anon;

grant execute on function public.support_list_contacts() to authenticated, service_role;
grant execute on function public.support_start_thread(uuid, boolean, text, uuid, text) to authenticated, service_role;
grant execute on function public.support_my_threads() to authenticated, service_role;
grant execute on function public.support_admin_threads() to authenticated, service_role;
grant execute on function public.support_thread_messages(uuid, timestamptz) to authenticated, service_role;
grant execute on function public.support_send_message(uuid, text) to authenticated, service_role;
grant execute on function public.support_close_thread(uuid, boolean) to authenticated, service_role;
grant execute on function public.support_unread_total() to authenticated, service_role;
grant execute on function public.support_delete_thread(uuid) to authenticated, service_role;

-- =====================================================================
-- 6. Read-only Verification Queries & Transactional Test Scripts
--    (All commented out; safe to run individually in Supabase SQL Editor)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 6.1) استعلامات تعرض الجداول والسياسات والدوال الجديدة:
-- ---------------------------------------------------------------------
-- select table_name
-- from information_schema.tables
-- where table_schema = 'public'
--   and table_name in ('admin_aliases', 'support_threads', 'support_messages');
--
-- select tablename, policyname, cmd, qual
-- from pg_policies
-- where schemaname = 'public'
--   and tablename in ('admin_aliases', 'support_threads', 'support_messages');
--
-- select proname, proargnames, prosecdef, provolatile
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and proname like 'support_%'
-- order by proname;

-- ---------------------------------------------------------------------
-- 6.2) سكربتات اختبار تحاكي المستخدمين (كل واحد داخل begin; ... rollback;):
-- ---------------------------------------------------------------------

-- 1) الطالب لا يقرأ الجداول الثلاثة مباشرة (المتوقع: خطأ صلاحية permission denied for table):
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
--   select * from public.admin_aliases;
--   select * from public.support_threads;
--   select * from public.support_messages;
-- rollback;

-- 2) طالب لا يقرأ ولا يرسل في محادثة طالب آخر (المتوقع: خطأ 42501 ليس لديك صلاحية للوصول/لإرسال رسائل):
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<STUDENT_2_UUID>","role":"authenticated"}', true);
--   select * from public.support_thread_messages('<STUDENT_1_THREAD_UUID>');
--   select public.support_send_message('<STUDENT_1_THREAD_UUID>', 'محاولة اختراق محادثة طالب آخر');
-- rollback;

-- 3) أدمن لا يقرأ ولا يرسل في محادثة أدمن آخر (المتوقع: support_admin_threads لا ترجع المحادثة، و support_thread_messages / support_send_message ترفع خطأ 42501):
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<ADMIN_2_UUID>","role":"authenticated"}', true);
--   select * from public.support_admin_threads() where id = '<ADMIN_1_THREAD_UUID>';
--   select * from public.support_thread_messages('<ADMIN_1_THREAD_UUID>');
--   select public.support_send_message('<ADMIN_1_THREAD_UUID>', 'محاولة رد من أدمن غير مخصص للمحادثة');
-- rollback;

-- 4) استجابات الطالب لا تحتوي أي admin_id ولا اسم أدمن (المتوقع: الأعمدة المرجعة هي فقط contact_ref, symbol, is_super في جهات الاتصال، و id, symbol, is_super, subject, status, last_message_at, unread_count, preview, course_code, course_title في المحادثات):
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<STUDENT_UUID>","role":"authenticated"}', true);
--   select * from public.support_list_contacts();
--   select * from public.support_my_threads();
--   select * from public.support_thread_messages('<STUDENT_THREAD_UUID>');
-- rollback;

-- 5) استجابات الأدمن العادي لا تحتوي أي رمز (المتوقع: العمودان admin_symbol و admin_name يرجعان دائماً NULL للأدمن العادي):
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<REGULAR_ADMIN_UUID>","role":"authenticated"}', true);
--   select id, student_name, admin_symbol, admin_name
--   from public.support_admin_threads();
-- rollback;

-- 6) الأدمن العادي لا يقرأ admin_aliases (المتوقع: خطأ صلاحية permission denied for table admin_aliases):
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<REGULAR_ADMIN_UUID>","role":"authenticated"}', true);
--   select * from public.admin_aliases;
-- rollback;

-- 7) طالب لا يستطيع بدء محادثة مع أدمن من قسم أو سنة غير نطاقه (المتوقع: خطأ 42501 هذا المستلم غير متاح لنطاق قسمك وفرقتك الدراسية):
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<STUDENT_UUID>","role":"authenticated"}', true);
--   select public.support_start_thread(
--     '<OUT_OF_SCOPE_ADMIN_CONTACT_REF>'::uuid,
--     false,
--     'استفسار خارج النطاق',
--     null,
--     'رسالة تجريبية'
--   );
-- rollback;

-- 8) تجاوز rate limit (أكثر من 10 رسائل في الدقيقة) يرفع خطأ (المتوقع: الرسالة رقم 11 ترفع خطأ P0001 لقد تجاوزت الحد المسموح للإرسال):
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<STUDENT_UUID>","role":"authenticated"}', true);
--   do $$
--   declare
--     v_tid uuid;
--     i int;
--   begin
--     v_tid := public.support_start_thread(null, true, 'اختبار حد الإرسال', null, 'رسالة 1');
--     for i in 2..11 loop
--       perform public.support_send_message(v_tid, 'رسالة رقم ' || i);
--     end loop;
--   end $$;
-- rollback;

-- 9) أدمن اتحوّل لـ student يفقد الوصول لمحادثاته فوراً (المتوقع: بعد تحديث role إلى student، استدعاء support_admin_threads أو support_thread_messages يرفع خطأ 42501 فوراً في نفس الجلسة):
-- begin;
--   update public.profiles set role = 'student'::user_role where id = '<DEMOTED_ADMIN_UUID>';
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<DEMOTED_ADMIN_UUID>","role":"authenticated"}', true);
--   select * from public.support_admin_threads();
--   select * from public.support_thread_messages('<PREVIOUS_ADMIN_THREAD_UUID>');
-- rollback;

-- 10) (أ) السوبر أدمن يقرأ محادثة to_super فينزل unread_total لصفر:
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<SUPER_ADMIN_UUID>","role":"authenticated"}', true);
--   select public.support_unread_total();
--   select * from public.support_thread_messages('<TO_SUPER_THREAD_UUID>');
--   select public.support_unread_total(); -- المتوقع 0
-- rollback;

-- 11) (ب) حذف أدمن عنده محادثات ينجح:
-- begin;
--   delete from public.profiles where id = '<ADMIN_UUID_WITH_THREADS>';
--   select count(*) from public.support_threads where admin_id is null;
-- rollback;

-- 12) (ج) أدمن اتسحب منه admin_scope لا يرى محادثة طالب من تلك السنة ويرفع خطأ لو حاول يرد:
-- begin;
--   delete from public.admin_scopes where admin_id = '<REGULAR_ADMIN_UUID>';
--   update public.profiles set academic_year = 1 where id = '<REGULAR_ADMIN_UUID>';
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<REGULAR_ADMIN_UUID>","role":"authenticated"}', true);
--   select * from public.support_admin_threads() where id = '<STUDENT_THREAD_UUID>';
--   select public.support_send_message('<STUDENT_THREAD_UUID>', 'محاولة رد خارج النطاق'); -- يرفع خطأ 42501
-- rollback;
