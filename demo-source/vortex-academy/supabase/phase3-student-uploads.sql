-- =====================================================================
-- Vortex Academy: Phase 3 - Student Contributions (Materials Uploads)
--
-- Adds strict RLS policies, helper functions, and a limit trigger so
-- students (non-admins) can upload materials (status = 'pending') to
-- active courses offered to their department and academic year, view
-- their own uploads, and delete their own pending uploads.
--
-- Safe to re-run (idempotent). Does not modify any existing policy.
-- Contains no secrets and no personal data.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Helper Functions (SECURITY DEFINER, fixed search_path)
-- ---------------------------------------------------------------------

-- Checks that the current user is a non-admin student and that the course
-- is active and offered to the student's department and academic year.
create or replace function public.student_can_access_course(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    auth.uid() is not null
    and not public.is_admin()
    and exists (
      select 1
      from public.courses c
      join public.course_offerings co on co.course_id = c.id
      where c.id = cid
        and c.status = 'active'::course_status
        and co.department = public.my_department()
        and co.academic_year = public.my_academic_year()
    ),
    false
  )
$$;

-- Counts how many 'pending' materials the signed-in user currently has.
create or replace function public.student_pending_materials_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.materials m
  where m.uploader_id = auth.uid()
    and m.status = 'pending'::material_status
$$;

-- Counts how many files the signed-in student currently has in storage.objects
-- under <any course_id>/student-uploads/<auth.uid()>/ in bucket 'course-materials'.
create or replace function public.student_storage_files_count()
returns integer
language sql
stable
security definer
set search_path = public, storage
as $$
  select count(*)::integer
  from storage.objects o
  where o.bucket_id = 'course-materials'
    and (storage.foldername(o.name))[2] = 'student-uploads'
    and (storage.foldername(o.name))[3] = auth.uid()::text
$$;

-- Returns true if any row in public.materials (in any status) owned by the
-- current user points to the given storage object path.
create or replace function public.student_file_has_material_row(object_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    auth.uid() is not null
    and object_path is not null
    and length(object_path) > 0
    and exists (
      select 1
      from public.materials m
      where m.uploader_id = auth.uid()
        and right(m.file_url, length(object_path)) = object_path
    ),
    false
  )
$$;

-- Validates storage object paths for student uploads in bucket 'course-materials':
-- Must match: <course_id>/student-uploads/<auth.uid()>/<filename>
-- Uses CASE to ensure the UUID regex matches before casting to uuid.
create or replace function public.student_upload_path_valid(
  object_path text,
  require_offered_course boolean default true
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    case
      when auth.uid() is not null
        and not public.is_admin()
        and object_path is not null
        and position('..' in object_path) = 0
        and array_length(storage.foldername(object_path), 1) = 3
        and (storage.foldername(object_path))[1]
            ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and (storage.foldername(object_path))[2] = 'student-uploads'
        and (storage.foldername(object_path))[3] = auth.uid()::text
        and coalesce(btrim(storage.filename(object_path)), '') <> ''
      then
        case
          when require_offered_course
          then public.student_can_access_course(((storage.foldername(object_path))[1])::uuid)
          else true
        end
      else false
    end,
    false
  )
$$;

grant execute on function public.student_can_access_course(uuid) to authenticated, service_role;
grant execute on function public.student_pending_materials_count() to authenticated, service_role;
grant execute on function public.student_storage_files_count() to authenticated, service_role;
grant execute on function public.student_file_has_material_row(text) to authenticated, service_role;
grant execute on function public.student_upload_path_valid(text, boolean) to authenticated, service_role;

revoke execute on function public.student_can_access_course(uuid) from public, anon;
revoke execute on function public.student_pending_materials_count() from public, anon;
revoke execute on function public.student_storage_files_count() from public, anon;
revoke execute on function public.student_file_has_material_row(text) from public, anon;
revoke execute on function public.student_upload_path_valid(text, boolean) from public, anon;

-- ---------------------------------------------------------------------
-- 2. Database Trigger: Enforce max 10 pending materials per student
-- ---------------------------------------------------------------------
create or replace function public.enforce_student_pending_materials_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_total integer;
begin
  if auth.uid() is not null and not public.is_admin() then
    select count(*)::integer
      into pending_total
      from public.materials m
     where m.uploader_id = new.uploader_id
       and m.status = 'pending'::material_status;

    if pending_total >= 10 then
      raise exception 'student pending materials limit (10) reached'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists materials_student_pending_limit on public.materials;
create trigger materials_student_pending_limit
  before insert on public.materials
  for each row execute function public.enforce_student_pending_materials_limit();

revoke execute on function public.enforce_student_pending_materials_limit() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. RLS Policies on public.materials (Additive only)
-- ---------------------------------------------------------------------
drop policy if exists "Students view own uploaded materials" on public.materials;
drop policy if exists "Students insert pending materials for offered courses" on public.materials;
drop policy if exists "Students delete own pending materials" on public.materials;

-- تمنع الطالب من رؤية المواد غير المعتمدة التي رفعها طلاب آخرون، وتسمح له فقط بمتابعة حالة المواد التي رفعها بنفسه (pending / approved / rejected).
create policy "Students view own uploaded materials" on public.materials
  for select to authenticated
  using (uploader_id = auth.uid());

-- تمنع الأدمن من الإدراج عبر مسار الطالب، وتمنع الطالب من رفع مواد باسم غيره، أو بحالة غير pending، أو لمقرر غير نشط أو غير مخصص لقسمه وفرقته، أو تجاوز 10 مواد معلقة، أو تمرير رابط خارجي أو رابط من مشروع Supabase آخر خارج مساره الشخصي في بكت المشروع.
create policy "Students insert pending materials for offered courses" on public.materials
  for insert to authenticated
  with check (
    not public.is_admin()
    and uploader_id = auth.uid()
    and status = 'pending'::material_status
    and char_length(btrim(title)) between 1 and 120
    and public.student_can_access_course(course_id)
    and public.student_pending_materials_count() < 10
    and (
      (
        kind in ('document', 'audio')
        and position('..' in file_url) = 0
        and file_url ~* (
          '^https://tyzuoyerygitwfxsnsas\.supabase\.co/storage/v1/object/public/course-materials/'
          || course_id::text
          || '/student-uploads/'
          || auth.uid()::text
          || '/[^/?#]+$'
        )
      )
      or (
        kind = 'video'
        and file_url ~* '^https://'
      )
    )
  );

-- تمنع الطالب من حذف مواد غيره أو حذف مواده بعد اعتمادها (approved) أو رفضها (rejected)، وتسمح له فقط بحذف مواده المعلقة (pending).
create policy "Students delete own pending materials" on public.materials
  for delete to authenticated
  using (
    not public.is_admin()
    and uploader_id = auth.uid()
    and status = 'pending'::material_status
  );

-- ---------------------------------------------------------------------
-- 4. RLS Policies on storage.objects for bucket 'course-materials' (Additive only)
-- ---------------------------------------------------------------------
drop policy if exists "Students upload own course materials" on storage.objects;
drop policy if exists "Students read own course material files" on storage.objects;
drop policy if exists "Students delete own course material files" on storage.objects;

-- تمنع الطالب من رفع ملفات في مسار الأدمن أو مسار طالب آخر أو لمقرر غير مخصص لقسمه وفرقته، أو تجاوز الحد الأقصى (30 ملفاً في البكت)، ولا تمنح صلاحية UPDATE لمنع الكتابة فوق ملف موجود (upsert).
create policy "Students upload own course materials" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'course-materials'
    and public.student_upload_path_valid(name, true)
    and public.student_storage_files_count() < 30
  );

-- تمنع الطالب من استعراض ملفات غيره عبر واجهة التخزين وتسمح له فقط بقراءة ملفاته داخل مساره الشخصي.
create policy "Students read own course material files" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'course-materials'
    and public.student_upload_path_valid(name, false)
  );

-- تمنع الطالب من حذف أي ملف خارج مساره الشخصي، وتمنعه من حذف ملف لا يزال مرتبطاً بأي صف في جدول materials (بما في ذلك المواد المعتمدة approved لمنع استبدال الملف بعد الموافقة).
create policy "Students delete own course material files" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'course-materials'
    and public.student_upload_path_valid(name, false)
    and not public.student_file_has_material_row(name)
  );

-- ---------------------------------------------------------------------
-- 5. Read-only Verification Queries (Uncomment to run manually)
-- ---------------------------------------------------------------------
-- 1) التحقق من وجود السياسات والـ trigger الجديدة (المتوقع: 6 سياسات + trigger واحد):
-- select policyname, tablename, cmd
-- from pg_policies
-- where (schemaname = 'public' and tablename = 'materials' and policyname like 'Students %')
--    or (schemaname = 'storage' and tablename = 'objects' and policyname like 'Students %');
--
-- select tgname
-- from pg_trigger
-- where tgname = 'materials_student_pending_limit' and not tgisinternal;
--
-- 2) إثبات أن الرابط الصحيح فقط يُقبل، وأن رابط أي مشروع Supabase آخر أو رابط خارجي مموّه مرفوض
--    (المتوقع: valid_project_url = true، وكل الباقي = false):
-- with sample_ids as (
--   select
--     '11111111-1111-1111-1111-111111111111'::uuid as course_id,
--     '22222222-2222-2222-2222-222222222222'::uuid as user_id,
--     '^https://tyzuoyerygitwfxsnsas\.supabase\.co/storage/v1/object/public/course-materials/'
--       || '11111111-1111-1111-1111-111111111111'
--       || '/student-uploads/'
--       || '22222222-2222-2222-2222-222222222222'
--       || '/[^/?#]+$' as pattern
-- )
-- select
--   ('https://tyzuoyerygitwfxsnsas.supabase.co/storage/v1/object/public/course-materials/'
--     || course_id || '/student-uploads/' || user_id || '/lecture1.pdf') ~* pattern
--     as valid_project_url,
--   ('https://otherproject.supabase.co/storage/v1/object/public/course-materials/'
--     || course_id || '/student-uploads/' || user_id || '/lecture1.pdf') ~* pattern
--     as other_project_rejected,
--   ('https://evil.example.com/redirect?url=/storage/v1/object/public/course-materials/'
--     || course_id || '/student-uploads/' || user_id || '/lecture1.pdf') ~* pattern
--     as spoofed_domain_rejected,
--   ('https://tyzuoyerygitwfxsnsas.supabase.co/storage/v1/object/public/course-materials/'
--     || course_id || '/student-uploads/' || user_id || '/sub/lecture1.pdf') ~* pattern
--     as nested_subpath_rejected,
--   ('https://tyzuoyerygitwfxsnsas.supabase.co/storage/v1/object/public/course-materials/'
--     || course_id || '/student-uploads/' || user_id || '/lecture1.pdf?token=fake') ~* pattern
--     as query_injection_rejected
-- from sample_ids;
