-- CEO by Vortex: run this once in Supabase > SQL Editor.

-- 1. Who is an admin ------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

drop policy if exists "admins can read their own row" on public.admins;
create policy "admins can read their own row" on public.admins
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()))
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- 2. Sessions, courses, diplomas and camps -------------------------------------
create table if not exists public.items (
  id             bigint generated always as identity primary key,
  type           text not null check (type in ('sessions', 'courses', 'diplomas', 'camps')),
  title_en       text not null default '' check (char_length(title_en) <= 160),
  title_ar       text not null default '' check (char_length(title_ar) <= 160),
  description_en text not null default '' check (char_length(description_en) <= 4000),
  description_ar text not null default '' check (char_length(description_ar) <= 4000),
  price          numeric check (price is null or (price >= 0 and price <= 10000000)),
  image_url      text not null default '' check (image_url = '' or image_url ~ '^https?://'),
  link_url       text not null default '' check (link_url = '' or link_url ~ '^https?://'),
  start_date     date,
  is_published   boolean not null default false,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint items_has_title check (title_en <> '' or title_ar <> '')
);

create index if not exists items_type_idx on public.items (type, is_published, sort_order);

create or replace function public.touch_updated_at()
returns trigger language plpgsql
set search_path = ''
as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists items_touch on public.items;
create trigger items_touch before update on public.items
  for each row execute function public.touch_updated_at();

alter table public.items enable row level security;

drop policy if exists "anyone reads published items" on public.items;
create policy "anyone reads published items" on public.items
  for select to anon, authenticated using (is_published);

drop policy if exists "admins read all items" on public.items;
create policy "admins read all items" on public.items
  for select to authenticated using (public.is_admin());

drop policy if exists "admins add items" on public.items;
create policy "admins add items" on public.items
  for insert to authenticated with check (public.is_admin());

drop policy if exists "admins edit items" on public.items;
create policy "admins edit items" on public.items
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins delete items" on public.items;
create policy "admins delete items" on public.items
  for delete to authenticated using (public.is_admin());

-- 3. Image storage ----------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('item-images', 'item-images', true, 4194304, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 4194304,
      allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

drop policy if exists "admins upload item images" on storage.objects;
create policy "admins upload item images" on storage.objects
  for insert to authenticated with check (bucket_id = 'item-images' and public.is_admin());

drop policy if exists "admins replace item images" on storage.objects;
create policy "admins replace item images" on storage.objects
  for update to authenticated using (bucket_id = 'item-images' and public.is_admin());

drop policy if exists "admins delete item images" on storage.objects;
create policy "admins delete item images" on storage.objects
  for delete to authenticated using (bucket_id = 'item-images' and public.is_admin());

-- 4. Make yourself the first admin ---------------------------------------------
-- Create the user first: Supabase > Authentication > Users > Add user (tick "Auto confirm").
-- Then run this with your email:
--
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'you@example.com';
