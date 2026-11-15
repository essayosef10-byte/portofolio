-- CEO by Vortex, M3-B: booking for camps and diplomas, with Google Sheets sync. Idempotent.
-- Requires supabase/schema.sql (items, admins, is_admin, touch_updated_at) and the
-- profiles table from supabase/m2-profiles.sql.
-- Run as the postgres role (the default in the Supabase SQL editor).

-- 0. One-time setup for the Google Sheets sync (run by hand; re-running this file is fine)
--
-- The sync sends every booking to a Google Apps Script web app through pg_net, and
-- reads the webhook URL and the shared key from Supabase Vault. Nothing is hardcoded.
-- See google-apps-script/README.md for how to deploy the web app and choose the key.
--
--   create extension if not exists pg_net;
--   select vault.create_secret('https://script.google.com/macros/s/REPLACE_WITH_DEPLOYMENT_ID/exec?key=REPLACE_WITH_WEBHOOK_KEY', 'sheets_webhook_url');
--   select vault.create_secret('REPLACE_WITH_WEBHOOK_KEY', 'sheets_webhook_key');
--
-- The secrets are readable only by the postgres role. If sheets_webhook_url is
-- missing, the trigger in section 7 silently does nothing and bookings keep working.

-- 1. items: capacity and the booking flag ------------------------------------------------

alter table public.items
  add column if not exists capacity integer constraint items_capacity_check check (capacity is null or capacity > 0);

alter table public.items
  add column if not exists booking_open boolean not null default false;

-- 2. bookings -----------------------------------------------------------------------------

create table if not exists public.bookings (
  id           bigint generated always as identity primary key,
  item_id      bigint not null references public.items (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  status       text not null default 'booked'
    constraint bookings_status_check check (status in ('booked', 'confirmed', 'rejected', 'cancelled')),
  phone        text not null
    constraint bookings_phone_check check (
      char_length(phone) <= 20
      and (phone ~ '^01[0125][0-9]{8}$' or phone ~ '^\+[1-9][0-9]{7,18}$')
    ),
  student_code text not null default '',
  full_name    text not null default '',
  email        text not null default '',
  university   text not null default '',
  faculty      text not null default '',
  year         integer,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint bookings_item_user_unique unique (item_id, user_id)
);

create index if not exists bookings_user_idx on public.bookings (user_id, created_at desc);

drop trigger if exists bookings_touch on public.bookings;
create trigger bookings_touch before update on public.bookings
  for each row execute function public.touch_updated_at();

-- A booking can only belong to an item of type 'camps' or 'diplomas'.
create or replace function public.check_booking_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.items where id = new.item_id and type in ('camps', 'diplomas')) then
    raise exception 'bookings can only belong to items of type camps or diplomas';
  end if;
  return new;
end
$$;
revoke execute on function public.check_booking_item() from public, anon, authenticated;

drop trigger if exists bookings_item_check on public.bookings;
create trigger bookings_item_check before insert or update of item_id on public.bookings
  for each row execute function public.check_booking_item();

-- 3. Privileges and RLS on bookings -------------------------------------------------------
-- Reads: a user sees only their own rows, admins see all. Writes: nobody inserts or
-- deletes from the API (book_item and cancel_booking do it inside the database), and
-- admins may update only the status column.

alter table public.bookings enable row level security;

revoke all on public.bookings from public, anon, authenticated;
grant select on public.bookings to authenticated;
grant update (status) on public.bookings to authenticated;

drop policy if exists "users read own bookings" on public.bookings;
create policy "users read own bookings" on public.bookings
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "admins read all bookings" on public.bookings;
create policy "admins read all bookings" on public.bookings
  for select to authenticated
  using (public.is_admin());

drop policy if exists "admins update booking status" on public.bookings;
create policy "admins update booking status" on public.bookings
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 4. item_private: the group link lives ONLY here -----------------------------------------

create table if not exists public.item_private (
  item_id    bigint primary key references public.items (id) on delete cascade,
  group_link text not null default '' check (group_link = '' or group_link ~ '^https://'),
  updated_at timestamptz not null default now()
);

drop trigger if exists item_private_touch on public.item_private;
create trigger item_private_touch before update on public.item_private
  for each row execute function public.touch_updated_at();

alter table public.item_private enable row level security;

revoke all on public.item_private from public, anon, authenticated;
grant select, insert, update, delete on public.item_private to authenticated;

-- Admins manage the private rows.
drop policy if exists "admins manage item private" on public.item_private;
create policy "admins manage item private" on public.item_private
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- A signed-in student can read the row only with a confirmed booking for that item.
drop policy if exists "confirmed students read the group link" on public.item_private;
create policy "confirmed students read the group link" on public.item_private
  for select to authenticated
  using (
    exists (
      select 1
      from public.bookings b
      where b.item_id = item_private.item_id
        and b.user_id = (select auth.uid())
        and b.status = 'confirmed'
    )
  );

-- 5. book_item ------------------------------------------------------------------------------

create or replace function public.book_item(p_item_id bigint, p_phone text)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := (select auth.uid());
  v_item    public.items;
  v_profile public.profiles;
  v_booking public.bookings;
  v_had     boolean;
  v_phone   text := btrim(coalesce(p_phone, ''));
  v_active  bigint;
begin
  if v_user is null then
    raise exception 'not_signed_in';
  end if;

  -- The item must be published, be a camp or a diploma, and be open for booking.
  -- "for update" locks the item row so two students cannot take the last place.
  select * into v_item
  from public.items
  where id = p_item_id
    and is_published
    and type in ('camps', 'diplomas')
    and booking_open
  for update;

  if not found then
    raise exception 'not_open';
  end if;

  -- The profile must be complete.
  select * into v_profile from public.profiles where user_id = v_user;
  if not found
    or v_profile.full_name is null or btrim(v_profile.full_name) = ''
    or v_profile.university is null or btrim(v_profile.university) = ''
    or v_profile.faculty is null or btrim(v_profile.faculty) = ''
    or v_profile.year is null then
    raise exception 'profile_incomplete';
  end if;

  -- The phone must be an Egyptian mobile (01xxxxxxxxx / +201xxxxxxxxx) or an
  -- international number starting with +.
  if not (v_phone ~ '^01[0125][0-9]{8}$' or v_phone ~ '^\+[1-9][0-9]{7,18}$') then
    raise exception 'invalid_phone';
  end if;

  -- An existing booking for this item decides what happens next.
  select * into v_booking from public.bookings
  where item_id = p_item_id and user_id = v_user;
  v_had := found;

  if v_had then
    if v_booking.status = 'rejected' then
      raise exception 'rejected';
    end if;
    if v_booking.status in ('booked', 'confirmed') then
      raise exception 'already_booked';
    end if;
  end if;

  -- Capacity (null means no limit); the item row is locked, so this count is safe.
  if v_item.capacity is not null then
    select count(*) into v_active
    from public.bookings
    where item_id = p_item_id
      and status not in ('cancelled', 'rejected');
    if v_active >= v_item.capacity then
      raise exception 'full';
    end if;
  end if;

  if v_had then
    -- A cancelled booking comes back to life on the same row.
    update public.bookings set
      status       = 'booked',
      phone        = v_phone,
      student_code = coalesce(v_profile.student_code, ''),
      full_name    = coalesce(v_profile.full_name, ''),
      email        = coalesce(v_profile.email, ''),
      university   = coalesce(v_profile.university, ''),
      faculty      = coalesce(v_profile.faculty, ''),
      year         = v_profile.year
    where id = v_booking.id
    returning * into v_booking;
    return v_booking;
  end if;

  insert into public.bookings (item_id, user_id, phone, student_code, full_name, email, university, faculty, year)
  values (
    p_item_id,
    v_user,
    v_phone,
    coalesce(v_profile.student_code, ''),
    coalesce(v_profile.full_name, ''),
    coalesce(v_profile.email, ''),
    coalesce(v_profile.university, ''),
    coalesce(v_profile.faculty, ''),
    v_profile.year
  )
  returning * into v_booking;

  return v_booking;
end;
$$;

revoke execute on function public.book_item(bigint, text) from public, anon, authenticated;
grant execute on function public.book_item(bigint, text) to authenticated;

-- 6. cancel_booking ---------------------------------------------------------------------------

create or replace function public.cancel_booking(p_item_id bigint)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := (select auth.uid());
  v_booking public.bookings;
begin
  if v_user is null then
    raise exception 'not_signed_in';
  end if;

  select * into v_booking from public.bookings
  where item_id = p_item_id
    and user_id = v_user
    and status in ('booked', 'confirmed');

  if not found then
    raise exception 'not_found';
  end if;

  if not exists (select 1 from public.items where id = p_item_id and booking_open) then
    raise exception 'not_open';
  end if;

  update public.bookings set status = 'cancelled'
  where id = v_booking.id
  returning * into v_booking;

  return v_booking;
end;
$$;

revoke execute on function public.cancel_booking(bigint) from public, anon, authenticated;
grant execute on function public.cancel_booking(bigint) to authenticated;

-- 7. Google Sheets sync ------------------------------------------------------------------------
-- After every insert or update the row is posted to the webhook whose URL and key are
-- stored in the Vault. A missing URL, a missing extension or a failing webhook must
-- never block or roll back a booking, so every step runs inside a guarded block.

create or replace function public.bookings_to_sheets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url   text;
  v_key   text;
  v_title text;
  v_type  text;
  v_body  jsonb;
begin
  begin
    select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'sheets_webhook_url' limit 1;

    if v_url is null or v_url = '' then
      return coalesce(new, old);
    end if;

    select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'sheets_webhook_key' limit 1;

    -- The Apps Script web app reads the key from the URL (it cannot read headers).
    if v_key is not null and v_key <> ''
      and position('?key=' in v_url) = 0 and position('&key=' in v_url) = 0 then
      v_url := v_url || case when position('?' in v_url) > 0 then '&' else '?' end || 'key=' || v_key;
    end if;

    select title_en, type into v_title, v_type
    from public.items where id = new.item_id;

    v_body := jsonb_build_object(
      'event',        lower(tg_op),
      'booking_id',   new.id,
      'status',       new.status,
      'phone',        new.phone,
      'student_code', new.student_code,
      'full_name',    new.full_name,
      'email',        new.email,
      'university',   new.university,
      'faculty',      new.faculty,
      'year',         new.year,
      'item_id',      new.item_id,
      'item_title',   coalesce(v_title, ''),
      'item_type',    coalesce(v_type, ''),
      'created_at',   new.created_at
    );

    perform net.http_post(v_url, v_body);
  exception when others then
    null;
  end;

  return coalesce(new, old);
end;
$$;

revoke execute on function public.bookings_to_sheets() from public, anon, authenticated;

drop trigger if exists bookings_sheets_sync on public.bookings;
create trigger bookings_sheets_sync
  after insert or update on public.bookings
  for each row execute function public.bookings_to_sheets();

-- 8. Verification (run by hand; each block rolls back) -------------------------------------------
-- Replace <admin-uuid> with an admin id, <user-a-uuid> and <user-b-uuid> with two
-- NON-admin student ids, <camp-id> with a published camp or diploma that has
-- booking_open = true, and <full-item-id> with one whose capacity is already reached.
--
-- a) anon cannot read bookings nor the private group links (permission denied):
--      begin; set local role anon;
--      select * from public.bookings;       -- ERROR
--      select * from public.item_private;   -- ERROR
--      rollback;
--
-- b) user A cannot read user B's booking (0 rows, only A's own rows are visible):
--      begin; set local role authenticated;
--      select set_config('request.jwt.claims',
--        json_build_object('sub','<user-a-uuid>','role','authenticated')::text, true);
--      select count(*) from public.bookings where user_id = '<user-b-uuid>';   -- 0
--      rollback;
--
-- c) a direct insert into bookings is denied (no insert policy and no grant):
--      begin; set local role authenticated;
--      select set_config('request.jwt.claims',
--        json_build_object('sub','<user-a-uuid>','role','authenticated')::text, true);
--      insert into public.bookings (item_id, user_id, phone)
--        values (<camp-id>, '<user-a-uuid>', '01012345678');                    -- ERROR
--      rollback;
--    (The same holds for delete, and for update of any column other than status.)
--
-- d) book_item respects booking_open (with the item's booking_open = false):
--      begin; set local role authenticated;
--      select set_config('request.jwt.claims',
--        json_build_object('sub','<user-a-uuid>','role','authenticated')::text, true);
--      select public.book_item(<camp-id>, '01012345678');                       -- ERROR: not_open
--      rollback;
--
-- e) book_item respects capacity (capacity = 2 and already 2 active bookings):
--      begin; set local role authenticated;
--      select set_config('request.jwt.claims',
--        json_build_object('sub','<user-b-uuid>','role','authenticated')::text, true);
--      select public.book_item(<full-item-id>, '01012345678');                  -- ERROR: full
--      rollback;
--
-- f) group_link is hidden until the booking is confirmed:
--      begin; set local role authenticated;
--      select set_config('request.jwt.claims',
--        json_build_object('sub','<user-a-uuid>','role','authenticated')::text, true);
--      select public.book_item(<camp-id>, '01012345678');                       -- status: booked
--      select * from public.item_private where item_id = <camp-id>;             -- 0 rows
--      rollback;
--      -- then, as the admin, confirm that booking:
--      --   update public.bookings set status = 'confirmed'
--      --   where item_id = <camp-id> and user_id = '<user-a-uuid>';
--      -- and repeat the two selects above as user A: the booking shows 'confirmed'
--      -- and the item_private row with group_link is now visible to A only.
