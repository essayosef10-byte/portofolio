-- =====================================================================
-- Vortex Academy: Rollback of Phase 3 (Student Contributions)
--
-- Removes ONLY the policies, trigger, and helper functions added by
-- supabase/phase3-student-uploads.sql. Leaves all Phase 1 & Phase 2
-- policies and data intact.
-- WARNING: running this stops students from uploading materials.
-- =====================================================================

-- 1. Drop Phase 3 storage policies
drop policy if exists "Students upload own course materials" on storage.objects;
drop policy if exists "Students read own course material files" on storage.objects;
drop policy if exists "Students delete own course material files" on storage.objects;

-- 2. Drop Phase 3 materials policies
drop policy if exists "Students view own uploaded materials" on public.materials;
drop policy if exists "Students insert pending materials for offered courses" on public.materials;
drop policy if exists "Students delete own pending materials" on public.materials;

-- 3. Drop Phase 3 pending limit trigger and trigger function
drop trigger if exists materials_student_pending_limit on public.materials;
drop function if exists public.enforce_student_pending_materials_limit();

-- 4. Drop Phase 3 helper functions
drop function if exists public.student_upload_path_valid(text, boolean);
drop function if exists public.student_file_has_material_row(text);
drop function if exists public.student_storage_files_count();
drop function if exists public.student_pending_materials_count();
drop function if exists public.student_can_access_course(uuid);

-- 5. Verify (read-only): expect 0 rows
-- select policyname, tablename
-- from pg_policies
-- where (schemaname = 'public' and tablename = 'materials' and policyname like 'Students %')
--    or (schemaname = 'storage' and tablename = 'objects' and policyname like 'Students %');
