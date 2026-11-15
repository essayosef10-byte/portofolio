-- CEO by Vortex, M3-A: course lectures. Idempotent.
-- Requires schema.sql (items, is_admin, touch_updated_at).

-- 1. Lectures (public outline: titles and descriptions only) -----------------
create table if not exists public.lectures (
  id               bigint generated always as identity primary key,
  item_id          bigint not null references public.items (id) on delete cascade,
  position         integer not null default 0,
  title_en         text not null default '' check (char_length(title_en) <= 160),
  title_ar         text not null default '' check (char_length(title_ar) <= 160),
  description_en   text not null default '' check (char_length(description_en) <= 2000),
  description_ar   text not null default '' check (char_length(description_ar) <= 2000),
  duration_minutes integer check (duration_minutes is null or duration_minutes >= 0),
  is_free_preview  boolean not null default false,
  is_published     boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint lectures_has_title check (title_en <> '' or title_ar <> '')
);

create index if not exists lectures_item_position_idx on public.lectures (item_id, position);

drop trigger if exists lectures_touch on public.lectures;
create trigger lectures_touch before update on public.lectures
  for each row execute function public.touch_updated_at();

-- A lecture can only belong to an item of type 'courses'.
create or replace function public.check_lecture_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.items where id = new.item_id and type = 'courses') then
    raise exception 'lectures can only belong to items of type courses';
  end if;
  return new;
end
$$;
revoke execute on function public.check_lecture_item() from public, anon, authenticated;

drop trigger if exists lectures_item_check on public.lectures;
create trigger lectures_item_check before insert or update of item_id on public.lectures
  for each row execute function public.check_lecture_item();

-- 2. Lecture media (the video link lives ONLY here) ----------------------------
create table if not exists public.lecture_media (
  lecture_id bigint primary key references public.lectures (id) on delete cascade,
  video_url  text not null check (video_url ~ '^https://'),
  created_at timestamptz not null default now()
);

-- 3. Privileges ---------------------------------------------------------------
revoke all on public.lectures from public, anon, authenticated;
grant select on public.lectures to anon, authenticated;
grant insert, update, delete on public.lectures to authenticated;

revoke all on public.lecture_media from public, anon, authenticated;
grant select, insert, update, delete on public.lecture_media to authenticated;

-- 4. Row Level Security: lectures --------------------------------------------------
alter table public.lectures enable row level security;

drop policy if exists "anyone reads published lectures" on public.lectures;
create policy "anyone reads published lectures" on public.lectures
  for select to anon, authenticated
  using (
    is_published
    and exists (select 1 from public.items i where i.id = lectures.item_id and i.is_published)
  );

drop policy if exists "admins manage lectures" on public.lectures;
create policy "admins manage lectures" on public.lectures
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 5. Row Level Security: lecture_media -----------------------------------------------
alter table public.lecture_media enable row level security;

drop policy if exists "admins manage lecture media" on public.lecture_media;
create policy "admins manage lecture media" on public.lecture_media
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Signed-in users: only published lectures of published courses that are free
-- (price empty or 0) or that are marked as a free preview. Anon: nothing.
-- Paid courses stay admin-only until payments exist.
drop policy if exists "signed-in read open media" on public.lecture_media;
create policy "signed-in read open media" on public.lecture_media
  for select to authenticated
  using (
    exists (
      select 1
      from public.lectures l
      join public.items i on i.id = l.item_id
      where l.id = lecture_media.lecture_id
        and l.is_published
        and i.is_published
        and (coalesce(i.price, 0) = 0 or l.is_free_preview)
    )
  );

-- 6. Verification (run by hand; each block rolls back) -------------------------------
-- Replace <user-uuid> with a NON-admin user id, <admin-uuid> with an admin id,
-- <paid-lecture-id> with a lecture of a paid course (not free preview).
--
-- a) anon cannot read media (permission denied):
--    begin; set local role anon; select * from public.lecture_media; rollback;
--
-- b) anon can read only published lectures (titles, no video):
--    begin; set local role anon; select id, title_en from public.lectures; rollback;
--
-- c) a normal signed-in user cannot read a paid course's media (0 rows):
--    begin; set local role authenticated;
--    select set_config('request.jwt.claims',
--      json_build_object('sub','<user-uuid>','role','authenticated')::text, true);
--    select count(*) from public.lecture_media where lecture_id = <paid-lecture-id>;  -- 0
--    insert into public.lectures (item_id, title_en) values (1, 'x');                  -- ERROR (RLS)
--    rollback;
--
-- d) an admin can read everything:
--    begin; set local role authenticated;
--    select set_config('request.jwt.claims',
--      json_build_object('sub','<admin-uuid>','role','authenticated')::text, true);
--    select count(*) from public.lecture_media;                                        -- all rows
--    rollback;
--
-- e) a lecture cannot belong to a non-course item (ERROR):
--    insert into public.lectures (item_id, title_en)
--    select id, 'x' from public.items where type = 'sessions' limit 1;