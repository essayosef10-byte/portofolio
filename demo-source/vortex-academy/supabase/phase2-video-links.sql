-- =====================================================================
-- Vortex Academy: Phase 2 - videos are links only
-- Safe to re-run. Contains no secrets and no personal data.
-- =====================================================================

-- 1. materials.kind may now also be 'video' (the old CHECK allowed only document / audio)
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.materials'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.materials drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.materials
  add constraint materials_kind_check
  check (kind in ('document', 'audio', 'video'));

-- 2. Links must be https (existing rows are not re-checked)
alter table public.materials drop constraint if exists materials_file_url_https_check;
alter table public.materials
  add constraint materials_file_url_https_check
  check (file_url ~* '^https://') not valid;

-- 3. No more video files in Storage (files and audio are still allowed)
update storage.buckets
set allowed_mime_types = array_remove(allowed_mime_types, 'video/mp4')
where id = 'course-materials';

-- 4. Verify (read-only): expect kind check with 3 values, and no video/mp4 in the list
-- select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.materials'::regclass and contype = 'c';
-- select allowed_mime_types from storage.buckets where id = 'course-materials';
