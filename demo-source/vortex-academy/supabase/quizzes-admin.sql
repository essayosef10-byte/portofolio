-- =====================================================================
-- Vortex Academy: quizzes admin + grading migration
--
-- Run the blocks in order in the Supabase SQL Editor.
-- Blocks 1-6 are additive and safe to re-run.
-- Block 7 only verifies. Block 8 (DROP COLUMN) is destructive:
-- run it LAST, after the new admin page is deployed and verified.
--
-- Contains no secrets and no personal data.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. (read-only) Check nullability / defaults before anything else.
--    Expected: quiz_attempts.score is_nullable = YES.
-- ---------------------------------------------------------------------
-- select table_name, column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name in ('quizzes', 'quiz_attempts')
-- order by table_name, ordinal_position;

-- ---------------------------------------------------------------------
-- 1. Maximum score per quiz (used to validate grades and to show "x / max")
-- ---------------------------------------------------------------------
alter table public.quizzes
  add column if not exists max_score numeric not null default 100;

-- A past exam has a file and no HTML; an interactive quiz has HTML and no file.
-- A new attempt is ungraded (score NULL). These are no-ops if already nullable.
alter table public.quizzes alter column exam_file_url drop not null;
alter table public.quizzes alter column html_content drop not null;
alter table public.quiz_attempts alter column score drop not null;

alter table public.quizzes drop constraint if exists quizzes_max_score_check;
alter table public.quizzes
  add constraint quizzes_max_score_check check (max_score > 0 and max_score <= 1000);

-- Size limits for new rows only (NOT VALID = existing rows are not re-checked)
alter table public.quizzes drop constraint if exists quizzes_html_size_check;
alter table public.quizzes
  add constraint quizzes_html_size_check
  check (html_content is null or octet_length(html_content) <= 524288) not valid;

alter table public.quiz_attempts drop constraint if exists quiz_attempts_answers_size;
alter table public.quiz_attempts
  add constraint quiz_attempts_answers_size
  check (answers is null or octet_length(answers::text) <= 100000) not valid;

-- ---------------------------------------------------------------------
-- 2. Answer keys move to an admin-only table.
--    Students can read a key only after they have submitted an attempt.
-- ---------------------------------------------------------------------
create table if not exists public.quiz_answer_keys (
  quiz_id uuid primary key references public.quizzes(id) on delete cascade,
  answer_key_file_url text not null,
  created_at timestamptz not null default now()
);

alter table public.quiz_answer_keys enable row level security;

drop policy if exists "Dept admins manage answer keys" on public.quiz_answer_keys;
drop policy if exists "Students view released answer keys" on public.quiz_answer_keys;

create policy "Dept admins manage answer keys" on public.quiz_answer_keys
  for all to authenticated
  using (public.admin_can_access(public.quiz_department(quiz_id)))
  with check (public.admin_can_access(public.quiz_department(quiz_id)));

create policy "Students view released answer keys" on public.quiz_answer_keys
  for select to authenticated
  using (
    exists (
      select 1 from public.quiz_attempts a
      where a.quiz_id = quiz_answer_keys.quiz_id
        and a.student_id = auth.uid()
    )
  );

revoke all on public.quiz_answer_keys from anon, public;
grant select, insert, update, delete on public.quiz_answer_keys to authenticated;

-- ---------------------------------------------------------------------
-- 3. Copy existing answer keys (nothing is deleted here)
-- ---------------------------------------------------------------------
insert into public.quiz_answer_keys (quiz_id, answer_key_file_url)
select id, answer_key_file_url
from public.quizzes
where answer_key_file_url is not null and btrim(answer_key_file_url) <> ''
on conflict (quiz_id) do nothing;

-- ---------------------------------------------------------------------
-- 4. Attempt counters for the admin list (security_invoker: RLS still applies,
--    so a department admin only counts attempts of their own department).
-- ---------------------------------------------------------------------
create or replace view public.quiz_attempt_stats
with (security_invoker = true) as
select
  quiz_id,
  count(*)::int as total_attempts,
  (count(*) filter (where score is null))::int as pending_attempts
from public.quiz_attempts
group by quiz_id;

revoke all on public.quiz_attempt_stats from anon, public;
grant select on public.quiz_attempt_stats to authenticated;

-- ---------------------------------------------------------------------
-- 5. Admins may change ONLY the score of an attempt, and only within 0..max_score.
--    No JWT (SQL Editor / Table Editor) is unrestricted, same as prevent_role_change().
-- ---------------------------------------------------------------------
create or replace function public.guard_quiz_attempt_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  max_allowed numeric;
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.quiz_id is distinct from old.quiz_id
     or new.student_id is distinct from old.student_id
     or new.answers is distinct from old.answers
     or new.submitted_at is distinct from old.submitted_at then
    raise exception 'only the score of an attempt can be changed';
  end if;

  if new.score is not null then
    select max_score into max_allowed from public.quizzes where id = new.quiz_id;
    if new.score < 0 or new.score > coalesce(max_allowed, 100) then
      raise exception 'score is out of range';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists quiz_attempts_guard_update on public.quiz_attempts;
create trigger quiz_attempts_guard_update
  before update on public.quiz_attempts
  for each row execute function public.guard_quiz_attempt_update();

revoke execute on function public.guard_quiz_attempt_update() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Make sure the helper used by the new policies is callable by signed-in users
--    (already granted in setup.sql; repeated here so this file is self-contained)
-- ---------------------------------------------------------------------
grant execute on function public.quiz_department(uuid) to authenticated, service_role;
grant execute on function public.admin_can_access(text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 7. Verify (read-only). Both numbers must match before running block 8.
-- ---------------------------------------------------------------------
-- select
--   (select count(*) from public.quizzes
--     where answer_key_file_url is not null and btrim(answer_key_file_url) <> '') as keys_in_old_column,
--   (select count(*) from public.quiz_answer_keys) as keys_in_new_table;

-- ---------------------------------------------------------------------
-- 8. DESTRUCTIVE: drop the old column so students can no longer read keys
--    through the quizzes API. Run only after block 7 matches.
-- ---------------------------------------------------------------------
-- alter table public.quizzes drop column if exists answer_key_file_url;
