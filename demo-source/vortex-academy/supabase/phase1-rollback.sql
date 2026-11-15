-- =====================================================================
-- Vortex Academy: rollback of Phase 1 (year-scoped admin access)
--
-- Restores the policies and functions saved by phase1-scopes.sql in
-- private_backup.policies_20261013 / private_backup.functions_20261013.
-- Run it only if Phase 1 broke something. After it, the database behaves as
-- before Phase 1 (department-level admins), so the Phase 1 frontend pages
-- must be reverted too (git revert).
-- Contains no secrets and no personal data.
-- =====================================================================

-- 1. Drop the current policies on the affected tables and the course-materials storage policies
do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where (schemaname = 'public' and tablename in (
            'profiles', 'courses', 'course_offerings', 'materials', 'enrollments',
            'quizzes', 'quiz_attempts', 'quiz_answer_keys', 'notifications',
            'notification_reads', 'schedules', 'admin_scopes'))
       or (schemaname = 'storage' and tablename = 'objects' and policyname in (
            'Dept admins upload course materials',
            'Dept admins read course materials',
            'Dept admins delete course materials'))
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- 2. Recreate the saved policies (admin_scopes did not exist before: nothing to restore for it)
do $$
declare
  r record;
  stmt text;
begin
  for r in
    select * from private_backup.policies_20261013
    where (schemaname = 'public' and tablename in (
            'profiles', 'courses', 'course_offerings', 'materials', 'enrollments',
            'quizzes', 'quiz_attempts', 'quiz_answer_keys', 'notifications',
            'notification_reads', 'schedules'))
       or (schemaname = 'storage' and tablename = 'objects' and policyname in (
            'Dept admins upload course materials',
            'Dept admins read course materials',
            'Dept admins delete course materials'))
  loop
    stmt := format(
      'create policy %I on %I.%I as %s for %s to %s',
      r.policyname, r.schemaname, r.tablename,
      r.permissive, r.cmd, array_to_string(r.roles, ', ')
    );
    if r.qual is not null then
      stmt := stmt || ' using (' || r.qual || ')';
    end if;
    if r.with_check is not null then
      stmt := stmt || ' with check (' || r.with_check || ')';
    end if;
    execute stmt;
  end loop;
end $$;

-- 3. Restore the replaced functions
do $$
declare
  f record;
begin
  for f in select definition from private_backup.functions_20261013 loop
    execute f.definition;
  end loop;
end $$;

-- 4. Remove what Phase 1 added (policies that used these functions are already gone)
drop view if exists public.profile_directory;
drop function if exists public.course_manageable_from_path(text);
drop function if exists public.profile_in_scope(uuid);
drop function if exists public.quiz_in_scope(uuid);
drop function if exists public.admin_can_access_course(uuid);
drop function if exists public.admin_has_dept(text);
drop function if exists public.admin_can_access(text, smallint);
drop table if exists public.admin_scopes;
alter table public.profiles drop constraint if exists profiles_gpa_range_check;

-- 5. Verify: expect both numbers > 0 and 0 rows from the last query
-- select (select count(*) from pg_policies where schemaname = 'public' and tablename = 'courses') as courses_policies,
--        (select count(*) from pg_policies where schemaname = 'public' and tablename = 'quizzes') as quizzes_policies;
