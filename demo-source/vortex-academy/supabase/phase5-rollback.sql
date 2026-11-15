-- Vortex Academy: Phase 5 rollback (emergency only: deletes all access requests).
drop policy if exists "Students view approved materials with course access" on public.materials;
drop policy if exists "Students view courses with approved access" on public.courses;

drop function if exists public.course_access_pending_count();
drop function if exists public.course_access_decide(uuid, text, text);
drop function if exists public.course_access_admin_list(text);
drop function if exists public.course_access_cancel(uuid);
drop function if exists public.course_access_my_requests();
drop function if exists public.course_access_request(uuid, text);
drop function if exists public.course_access_requestable();
drop function if exists public.student_has_course_access(uuid);

drop table if exists public.course_access_requests;
