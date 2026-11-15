-- =====================================================================
-- Vortex Academy: schedules + notifications admin migration
--
-- Run blocks 1-5 in order in the Supabase SQL Editor (all are safe to re-run).
-- Block 6 only verifies (read-only).
--
-- Contains no secrets and no personal data.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. File links must be http(s) URLs (blocks javascript: / data: links).
--    NOT VALID = existing rows are not re-checked, new and updated rows are.
-- ---------------------------------------------------------------------
alter table public.schedules drop constraint if exists schedules_file_url_http_check;
alter table public.schedules
  add constraint schedules_file_url_http_check
  check (file_url ~* '^https?://') not valid;

alter table public.quizzes drop constraint if exists quizzes_exam_url_http_check;
alter table public.quizzes
  add constraint quizzes_exam_url_http_check
  check (exam_file_url is null or exam_file_url ~* '^https?://') not valid;

alter table public.quiz_answer_keys drop constraint if exists quiz_answer_keys_url_http_check;
alter table public.quiz_answer_keys
  add constraint quiz_answer_keys_url_http_check
  check (answer_key_file_url ~* '^https?://') not valid;

-- Text size limits for new rows
alter table public.schedules drop constraint if exists schedules_term_length_check;
alter table public.schedules
  add constraint schedules_term_length_check
  check (term is null or char_length(term) <= 100) not valid;

alter table public.notifications drop constraint if exists notifications_text_length_check;
alter table public.notifications
  add constraint notifications_text_length_check
  check (char_length(title) between 1 and 200
         and (body is null or char_length(body) <= 5000)) not valid;

-- ---------------------------------------------------------------------
-- 2. Deleting a notification must also delete its read receipts.
--    Recreates the foreign key with ON DELETE CASCADE only if it is not already cascading.
-- ---------------------------------------------------------------------
do $$
declare
  fk record;
begin
  for fk in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.notification_reads'::regclass
      and c.confrelid = 'public.notifications'::regclass
      and c.contype = 'f'
      and c.confdeltype <> 'c'
  loop
    execute format('alter table public.notification_reads drop constraint %I', fk.conname);
  end loop;

  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.notification_reads'::regclass
      and c.confrelid = 'public.notifications'::regclass
      and c.contype = 'f'
  ) then
    alter table public.notification_reads
      add constraint notification_reads_notification_id_fkey
      foreign key (notification_id) references public.notifications(id) on delete cascade;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Storage bucket for schedule files (PDF / PNG / JPG, 10 MB).
--    Path convention: <uploader_user_id>/<random-uuid>.<ext>
--    Files are readable by anyone with the link (same level as the course-materials bucket).
--    Upload: any admin, into their own folder.
--    Read / delete: super admin, the uploader, or an admin who can access the department
--    of a schedule row that points to the file.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'schedules', 'schedules', true, 10485760,
  array['application/pdf', 'image/png', 'image/jpeg']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

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
        and public.admin_can_access(s.department)
    ),
    false)
$$;

grant execute on function public.schedule_file_manageable(text) to authenticated, service_role;
revoke execute on function public.schedule_file_manageable(text) from public, anon;

drop policy if exists "Admins upload schedule files" on storage.objects;
drop policy if exists "Admins read schedule files" on storage.objects;
drop policy if exists "Admins delete schedule files" on storage.objects;

create policy "Admins upload schedule files" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'schedules'
    and public.is_admin()
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "Admins read schedule files" on storage.objects
  for select to authenticated
  using (bucket_id = 'schedules' and public.schedule_file_manageable(name));
create policy "Admins delete schedule files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'schedules' and public.schedule_file_manageable(name));

-- ---------------------------------------------------------------------
-- 4. A new schedule automatically notifies the students of that department + year
--    (same idea as notify_on_new_material). Errors are swallowed on purpose so a
--    notification problem never blocks publishing a schedule.
-- ---------------------------------------------------------------------
create or replace function public.notify_on_new_schedule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.notifications (department, academic_year, type, title, body, created_by)
    values (
      new.department,
      new.academic_year,
      'announcement',
      'تم نشر جدول جديد',
      'تم نشر جدول ' || coalesce(nullif(btrim(new.term), ''), 'الفصل الدراسي الحالي')
        || '. يمكنك تحميله من صفحة الجداول.',
      null
    );
  exception when others then
    raise warning 'notify_on_new_schedule failed: %', sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists schedules_notify_students on public.schedules;
create trigger schedules_notify_students
  after insert on public.schedules
  for each row execute function public.notify_on_new_schedule();

revoke execute on function public.notify_on_new_schedule() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Make sure the helpers used by the policies are callable by signed-in users
-- ---------------------------------------------------------------------
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.is_super_admin() to authenticated, service_role;
grant execute on function public.admin_can_access(text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6. Verify (read-only). Expected: every number is 1 except cascade_fk = 1 as well.
-- ---------------------------------------------------------------------
-- select
--   (select count(*) from storage.buckets where id = 'schedules') as bucket,
--   (select count(*) from pg_policies
--     where schemaname = 'storage' and tablename = 'objects' and policyname like '%schedule files') / 3 as storage_policies_x3,
--   (select count(*) from pg_trigger
--     where tgname = 'schedules_notify_students' and not tgisinternal) as notify_trigger,
--   (select count(*) from pg_constraint
--     where conrelid = 'public.notification_reads'::regclass
--       and confrelid = 'public.notifications'::regclass
--       and contype = 'f' and confdeltype = 'c') as cascade_fk;
