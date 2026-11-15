-- =====================================================================
-- Vortex Academy: Phase 1 - year-scoped admin access
--
-- What changes:
--   * A department admin now sees and manages ONLY rows of their department AND
--     their academic year (plus extra years the super admin grants in admin_scopes).
--   * The super admin still sees everything.
--   * Department admins can no longer read the full profiles table (phone, GPA).
--     They use the limited view public.profile_directory instead.
--   * A student may enter a GPA (0 - 4) once, during /setup, only from year 2 up.
--   * Admins can no longer change their own academic year (it defines their scope).
--
-- Run the whole file once in the Supabase SQL Editor. It first takes a backup of the
-- current policies and functions in schema private_backup (used by phase1-rollback.sql).
-- Contains no secrets and no personal data.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Backup of the current policies and the functions this file replaces
-- ---------------------------------------------------------------------
create schema if not exists private_backup;
revoke all on schema private_backup from public, anon, authenticated;

create table if not exists private_backup.policies_20261013 as
select * from pg_policies
where schemaname = 'public'
   or (schemaname = 'storage' and tablename = 'objects');

create table if not exists private_backup.functions_20261013 as
select p.proname, pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('prevent_role_change', 'schedule_file_manageable');

revoke all on all tables in schema private_backup from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 1. Extra years an admin may manage (the department always comes from the admin's profile)
-- ---------------------------------------------------------------------
create table if not exists public.admin_scopes (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete cascade,
  academic_year smallint not null check (academic_year between 1 and 4),
  created_at timestamptz not null default now(),
  unique (admin_id, academic_year)
);

alter table public.admin_scopes enable row level security;
revoke all on public.admin_scopes from anon, public;
grant select, insert, update, delete on public.admin_scopes to authenticated;

-- GPA range for new and updated rows (existing rows are not re-checked)
alter table public.profiles drop constraint if exists profiles_gpa_range_check;
alter table public.profiles
  add constraint profiles_gpa_range_check
  check (gpa is null or (gpa >= 0 and gpa <= 4)) not valid;

-- ---------------------------------------------------------------------
-- 2. Scope helper functions (SECURITY DEFINER, fixed search_path, like the existing ones)
-- ---------------------------------------------------------------------

-- Can the signed-in admin act on rows of this department AND academic year?
create or replace function public.admin_can_access(dept text, yr smallint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.is_super_admin()
    or (
      public.is_admin()
      and dept is not null
      and yr is not null
      and dept = public.my_department()
      and (
        yr = public.my_academic_year()
        or exists (
          select 1 from public.admin_scopes s
          where s.admin_id = auth.uid() and s.academic_year = yr
        )
      )
    ),
    false)
$$;

-- Department-level capability (creating a course, for example): any year of the admin's department
create or replace function public.admin_has_dept(dept text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.is_super_admin()
    or (public.is_admin() and dept is not null and dept = public.my_department()),
    false)
$$;

-- A course is manageable when it belongs to the admin's department AND is offered to a
-- (department, year) inside the admin's scope, or is not offered to anyone yet (draft).
create or replace function public.admin_can_access_course(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.is_super_admin()
    or (
      public.is_admin()
      and exists (
        select 1 from public.courses c
        where c.id = cid and public.admin_has_dept(c.department)
      )
      and (
        exists (
          select 1 from public.course_offerings o
          where o.course_id = cid and public.admin_can_access(o.department, o.academic_year)
        )
        or not exists (select 1 from public.course_offerings o2 where o2.course_id = cid)
      )
    ),
    false)
$$;

create or replace function public.quiz_in_scope(qid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select public.admin_can_access(q.department, q.academic_year)
     from public.quizzes q where q.id = qid),
    false)
$$;

create or replace function public.profile_in_scope(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select public.admin_can_access(p.department, p.academic_year)
     from public.profiles p where p.id = pid),
    false)
$$;

-- Storage object path is "<course_id>/<file>"
create or replace function public.course_manageable_from_path(object_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    case
      when (storage.foldername(object_path))[1]
           ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.admin_can_access_course(((storage.foldername(object_path))[1])::uuid)
    end,
    false)
$$;

grant execute on function public.admin_can_access(text, smallint) to authenticated, service_role;
grant execute on function public.admin_has_dept(text) to authenticated, service_role;
grant execute on function public.admin_can_access_course(uuid) to authenticated, service_role;
grant execute on function public.quiz_in_scope(uuid) to authenticated, service_role;
grant execute on function public.profile_in_scope(uuid) to authenticated, service_role;
grant execute on function public.course_manageable_from_path(text) to authenticated, service_role;

revoke execute on function public.admin_can_access(text, smallint) from public, anon;
revoke execute on function public.admin_has_dept(text) from public, anon;
revoke execute on function public.admin_can_access_course(uuid) from public, anon;
revoke execute on function public.quiz_in_scope(uuid) from public, anon;
revoke execute on function public.profile_in_scope(uuid) from public, anon;
revoke execute on function public.course_manageable_from_path(text) from public, anon;

-- ---------------------------------------------------------------------
-- 3. Replace every policy on the affected tables (names of the old ones do not matter).
--    The previous policies are saved in private_backup.policies_20261013.
--    NOTE: the old instructor policies on courses are not recreated (no instructor accounts exist).
-- ---------------------------------------------------------------------
do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'profiles', 'courses', 'course_offerings', 'materials', 'enrollments',
        'quizzes', 'quiz_attempts', 'quiz_answer_keys', 'notifications',
        'notification_reads', 'schedules', 'admin_scopes'
      )
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- profiles: own row, or everything for the super admin. Department admins have NO policy here.
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (auth.uid() = id and role = 'student');
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "Super admin full access to profiles" on public.profiles
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

-- admin_scopes: only the super admin writes; an admin can read their own rows
create policy "Super admin manages scopes" on public.admin_scopes
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Admins view own scopes" on public.admin_scopes
  for select to authenticated using (admin_id = auth.uid());

-- courses
create policy "Students view courses offered to them" on public.courses
  for select to authenticated using (
    status = 'active'::course_status
    and exists (
      select 1 from public.course_offerings co
      where co.course_id = courses.id
        and co.department = public.my_department()
        and co.academic_year = public.my_academic_year()
    )
  );
create policy "Admins manage courses in scope" on public.courses
  for all to authenticated
  using (public.admin_can_access_course(id))
  with check (public.admin_has_dept(department));

-- course_offerings: everyone signed in can read; an admin writes only inside their (department, year) scope
create policy "Authenticated can view course_offerings" on public.course_offerings
  for select to authenticated using (true);
create policy "Admins manage offerings in scope" on public.course_offerings
  for all to authenticated
  using (public.admin_can_access(department, academic_year))
  with check (public.admin_can_access(department, academic_year));

-- materials
create policy "Students view approved materials for offered courses" on public.materials
  for select to authenticated using (
    status = 'approved'::material_status
    and exists (
      select 1 from public.course_offerings co
      where co.course_id = materials.course_id
        and co.department = public.my_department()
        and co.academic_year = public.my_academic_year()
    )
  );
create policy "Admins manage materials in scope" on public.materials
  for all to authenticated
  using (public.admin_can_access_course(course_id))
  with check (public.admin_can_access_course(course_id));

-- enrollments (kept, not used for visibility)
create policy "Admins manage enrollments in scope" on public.enrollments
  for all to authenticated
  using (public.admin_can_access_course(course_id))
  with check (public.admin_can_access_course(course_id));

-- quizzes
create policy "Students view their quizzes" on public.quizzes
  for select to authenticated using (
    department = public.my_department()
    and academic_year = public.my_academic_year()
  );
create policy "Admins manage quizzes in scope" on public.quizzes
  for all to authenticated
  using (public.admin_can_access(department, academic_year))
  with check (public.admin_can_access(department, academic_year));

-- quiz_attempts
create policy "Students view own attempts" on public.quiz_attempts
  for select to authenticated using (student_id = auth.uid());
create policy "Students insert own attempts" on public.quiz_attempts
  for insert to authenticated with check (
    student_id = auth.uid()
    and score is null
    and exists (select 1 from public.quizzes q where q.id = quiz_id)
  );
create policy "Admins view attempts in scope" on public.quiz_attempts
  for select to authenticated using (public.quiz_in_scope(quiz_id));
create policy "Admins grade attempts in scope" on public.quiz_attempts
  for update to authenticated
  using (public.quiz_in_scope(quiz_id))
  with check (public.quiz_in_scope(quiz_id));

-- quiz_answer_keys
create policy "Admins manage answer keys in scope" on public.quiz_answer_keys
  for all to authenticated
  using (public.quiz_in_scope(quiz_id))
  with check (public.quiz_in_scope(quiz_id));
create policy "Students view released answer keys" on public.quiz_answer_keys
  for select to authenticated using (
    exists (
      select 1 from public.quiz_attempts a
      where a.quiz_id = quiz_answer_keys.quiz_id and a.student_id = auth.uid()
    )
  );

-- notifications (department / year NULL = for everyone: only the super admin can create those)
create policy "Students view their notifications" on public.notifications
  for select to authenticated using (
    (department is null or department = public.my_department())
    and (academic_year is null or academic_year = public.my_academic_year())
  );
create policy "Admins manage notifications in scope" on public.notifications
  for all to authenticated
  using (public.admin_can_access(department, academic_year))
  with check (public.admin_can_access(department, academic_year));

-- notification_reads
create policy "Students manage own notification_reads" on public.notification_reads
  for all to authenticated
  using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy "Admins view notification_reads in scope" on public.notification_reads
  for select to authenticated using (public.profile_in_scope(student_id));

-- schedules
create policy "Students view their schedule" on public.schedules
  for select to authenticated using (
    department = public.my_department()
    and academic_year = public.my_academic_year()
  );
create policy "Admins manage schedules in scope" on public.schedules
  for all to authenticated
  using (public.admin_can_access(department, academic_year))
  with check (public.admin_can_access(department, academic_year));

-- ---------------------------------------------------------------------
-- 4. Storage: course-materials follows the course scope; schedules follows (department, year)
-- ---------------------------------------------------------------------
drop policy if exists "Dept admins upload course materials" on storage.objects;
drop policy if exists "Dept admins read course materials" on storage.objects;
drop policy if exists "Dept admins delete course materials" on storage.objects;

create policy "Dept admins upload course materials" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'course-materials'
    and public.course_manageable_from_path(name)
  );
create policy "Dept admins read course materials" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'course-materials'
    and public.course_manageable_from_path(name)
  );
create policy "Dept admins delete course materials" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'course-materials'
    and public.course_manageable_from_path(name)
  );

create or replace function public.schedule_file_manageable(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.is_super_admin()
    or (public.is_admin() and (storage.foldername(object_name))[1] = auth.uid()::text)
    or exists (
      select 1 from public.schedules s
      where right(s.file_url, length(object_name)) = object_name
        and public.admin_can_access(s.department, s.academic_year)
    ),
    false)
$$;

-- ---------------------------------------------------------------------
-- 5. Profile protection trigger
--    * super admin / no JWT (SQL Editor): unrestricted
--    * nobody else changes role, is_super_admin or student_id
--    * student: department, year, badge and GPA are free only while setting up
--      (student_badge_id still NULL); the GPA must be NULL in year 1 and 0..4 otherwise
--    * admins cannot change their own department, year, badge or GPA (the year defines their scope)
-- ---------------------------------------------------------------------
create or replace function public.prevent_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_super_admin() then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.is_super_admin is distinct from old.is_super_admin
     or new.student_id is distinct from old.student_id then
    raise exception 'protected profile fields cannot be changed';
  end if;

  if not public.is_admin() then
    if old.student_badge_id is null then
      -- first-time setup
      if new.academic_year = 1 and new.gpa is not null then
        raise exception 'first-year students have no GPA yet';
      end if;
      if new.gpa is not null and (new.gpa < 0 or new.gpa > 4) then
        raise exception 'gpa must be between 0 and 4';
      end if;
    else
      if new.gpa is distinct from old.gpa then
        raise exception 'protected profile fields cannot be changed';
      end if;
      if new.student_badge_id is distinct from old.student_badge_id
         or new.department is distinct from old.department
         or new.academic_year is distinct from old.academic_year then
        raise exception 'academic identity is locked after setup';
      end if;
    end if;
  else
    if new.department is distinct from old.department
       or new.academic_year is distinct from old.academic_year
       or new.student_badge_id is distinct from old.student_badge_id
       or new.gpa is distinct from old.gpa then
      raise exception 'department and academic year of an admin are set by the super admin';
    end if;
  end if;

  return new;
end $$;

-- ---------------------------------------------------------------------
-- 6. Limited directory for admins (no phone, no GPA).
--    The view runs with the owner's rights on purpose: the WHERE clause is the access check.
--    Students get no rows. The Security Advisor will list it as "security definer view": expected.
-- ---------------------------------------------------------------------
create or replace view public.profile_directory as
select
  p.id,
  p.full_name,
  p.role,
  p.department,
  p.academic_year,
  p.student_id,
  p.student_badge_id,
  p.created_at
from public.profiles p
where public.is_admin()
  and (
    public.is_super_admin()
    or p.role = 'admin'
    or (p.role = 'student' and public.admin_can_access(p.department, p.academic_year))
  );

revoke all on public.profile_directory from anon, public;
grant select on public.profile_directory to authenticated;

-- ---------------------------------------------------------------------
-- 7. Verify (read-only). Run these after the migration.
-- ---------------------------------------------------------------------
-- a) Expect 0 rows: policies still calling the old one-argument admin_can_access(dept)
-- select tablename, policyname, cmd from pg_policies
-- where coalesce(qual, '') || coalesce(with_check, '') ~ 'admin_can_access\([^,)]*\)';
--
-- b) Expect: admin_scopes 1, profile_directory 1
-- select
--   (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'admin_scopes') as scopes_table,
--   (select count(*) from information_schema.views  where table_schema = 'public' and table_name = 'profile_directory') as directory_view;
--
-- c) Backups exist (expect both > 0)
-- select (select count(*) from private_backup.policies_20261013) as policies_saved,
--        (select count(*) from private_backup.functions_20261013) as functions_saved;
