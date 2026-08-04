-- =====================================================================
-- HEARTFULNESS APPOINTMENT MANAGEMENT SYSTEM — DATABASE SCHEMA
-- Run this ONCE in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
-- It is safe to re-run: it drops and recreates everything cleanly.
-- =====================================================================

-- ---- Clean slate (so you can re-run during setup) -------------------
drop table if exists bookings cascade;
drop table if exists home_places cascade;
drop table if exists availability_slots cascade;
drop table if exists profiles cascade;
drop table if exists areas cascade;
drop table if exists heartspots cascade;
drop table if exists centers cascade;
drop table if exists zones cascade;
drop type if exists user_role cascade;
drop type if exists booking_status cascade;
drop type if exists sitting_place cascade;

create extension if not exists "uuid-ossp";

-- ---- Enums ----------------------------------------------------------
create type user_role as enum ('abhyasi', 'preceptor', 'coordinator', 'admin');
-- The full sitting lifecycle (see the state machine in the spec):
--   requested -> confirmed | declined | alternate_proposed | expired
--   alternate_proposed -> confirmed (abhyasi accepts) | cancelled
--   confirmed -> reminded -> completed | no_show ; confirmed/reminded -> cancelled
create type booking_status as enum (
  'requested',
  'confirmed',
  'alternate_proposed',
  'declined',
  'cancelled',
  'reminded',
  'completed',
  'no_show',
  'expired'
);
-- Where a sitting happens: a center's heartspot, or the preceptor's home.
create type sitting_place as enum ('heartspot', 'home');

-- =====================================================================
-- MASTER DATA: Zone -> Center (grouped by city)
-- =====================================================================
create table zones (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null unique,            -- e.g. 'Zone 6B - Gujarat South'
  description text,
  sort_order  int default 0,
  created_at  timestamptz default now()
);

create table centers (
  id          uuid primary key default uuid_generate_v4(),
  zone_id     uuid not null references zones(id) on delete cascade,
  name        text not null,                   -- e.g. 'Surat-West-Adajan'
  -- The app shows one searchable "City / Center" list, grouped by city.
  -- Nullable, because some centers in the master list have no city yet —
  -- those are still listed, under "Other centers".
  city        text,
  address     text,
  latitude    double precision,                -- for "near me" search
  longitude   double precision,
  map_url     text,                            -- a Google Maps link
  created_at  timestamptz default now()
);

-- =====================================================================
-- HEARTSPOTS — the meditation places that belong to a center.
-- A center can have several; a preceptor picks one when they say where a
-- sitting happens. Admins maintain this list.
-- =====================================================================
create table heartspots (
  id          uuid primary key default uuid_generate_v4(),
  center_id   uuid not null references centers(id) on delete cascade,
  name        text not null,                   -- e.g. 'Adajan Heartspot'
  address     text,
  latitude    double precision,
  longitude   double precision,
  map_url     text,
  is_active   boolean not null default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index idx_heartspots_center on heartspots(center_id);

-- Two heartspots in one center cannot share a name (case-insensitively).
create unique index uniq_heartspot_name_per_center
  on heartspots (center_id, lower(name));

-- Areas are not used by the app (it asks only for a zone and a city/center).
-- The table is kept so existing data and the profiles.area_id column stay valid.
create table areas (
  id          uuid primary key default uuid_generate_v4(),
  center_id   uuid not null references centers(id) on delete cascade,
  name        text not null,                   -- e.g. 'Adajan'
  pincode     text,
  latitude    double precision,
  longitude   double precision,
  created_at  timestamptz default now()
);

create index idx_centers_zone on centers(zone_id);
create index idx_areas_center on areas(center_id);

-- =====================================================================
-- PROFILES — one row per signed-in user (extends auth.users)
-- =====================================================================
create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  full_name       text not null,
  email           text,
  phone           text,
  role            user_role not null default 'abhyasi',
  -- where this person belongs (and, for preceptors, where they give sittings)
  zone_id         uuid references zones(id) on delete set null,
  center_id       uuid references centers(id) on delete set null,
  area_id         uuid references areas(id) on delete set null,  -- unused by the app
  city            text,                        -- copied from the chosen center
  -- Preceptor option: confirm incoming requests automatically (low-friction booking).
  auto_confirm    boolean not null default false,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
  -- Where this person lives is NOT here: see `home_places` below.
);

create index idx_profiles_center on profiles(center_id);
create index idx_profiles_role on profiles(role);

-- =====================================================================
-- HOME PLACES — where a person lives. One row per profile.
--
-- This is deliberately not a column on `profiles`: that table is
-- readable by every signed-in user (the app needs names on booking
-- cards), and security rules work row by row, so an address kept there
-- would be readable by all of them.
--
-- It serves two purposes at once: the origin for this person's own
-- "near me" search, and — for a preceptor who gives sittings at home —
-- the address an abhyasi is given once their sitting is confirmed.
-- =====================================================================
create table home_places (
  profile_id uuid primary key references profiles(id) on delete cascade,
  address    text,
  latitude   double precision,
  longitude  double precision,
  map_url    text,
  updated_at timestamptz default now()
);

-- =====================================================================
-- AVAILABILITY SLOTS — a preceptor's recurring weekly openings
-- day_of_week follows JavaScript: 0=Sunday, 1=Monday ... 6=Saturday
-- =====================================================================
create table availability_slots (
  id            uuid primary key default uuid_generate_v4(),
  preceptor_id  uuid not null references profiles(id) on delete cascade,
  center_id     uuid references centers(id) on delete set null,  -- which center this is filed under
  day_of_week   int not null check (day_of_week between 0 and 6),
  start_time    time not null,
  end_time      time not null,
  -- How many abhyasis can join this sitting.
  capacity      int not null default 1 check (capacity > 0),
  is_active     boolean not null default true,
  note          text,
  -- ---- where the sitting happens ----
  -- A heartspot sitting inherits its address from the heartspot (and that
  -- one from its center). A home sitting takes it from the preceptor's
  -- own `home_places` row — they have one home, not one per slot.
  place_type    sitting_place not null default 'heartspot',
  heartspot_id  uuid references heartspots(id) on delete set null,
  created_at    timestamptz default now(),
  constraint chk_time_order check (end_time > start_time)
);

create index idx_slots_preceptor on availability_slots(preceptor_id);
create index idx_slots_day on availability_slots(day_of_week);
create index idx_slots_center on availability_slots(center_id);
create index idx_slots_heartspot on availability_slots(heartspot_id);

-- Keep the two halves of "where" consistent: a home sitting has no
-- heartspot, and a heartspot must belong to the center the slot is filed
-- under (the center fills itself in when only the heartspot was chosen).
create or replace function normalize_slot_place()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  hs_center uuid;
begin
  if new.place_type = 'home' then
    -- The address lives on the preceptor's profile, so a home slot
    -- carries nothing of its own beyond saying that it is one.
    new.heartspot_id := null;
  else
    if new.heartspot_id is not null then
      select center_id into hs_center from heartspots where id = new.heartspot_id;
      if hs_center is null then
        raise exception 'That heartspot no longer exists.';
      end if;
      if new.center_id is null then
        new.center_id := hs_center;
      elsif new.center_id <> hs_center then
        raise exception 'The chosen heartspot does not belong to the chosen center.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_normalize_slot_place
  before insert or update on availability_slots
  for each row execute function normalize_slot_place();

-- =====================================================================
-- BOOKINGS — an abhyasi reserves a place in a slot for one real date
-- =====================================================================
create table bookings (
  id                 uuid primary key default uuid_generate_v4(),
  slot_id            uuid not null references availability_slots(id) on delete cascade,
  abhyasi_id         uuid not null references profiles(id) on delete cascade,
  preceptor_id       uuid references profiles(id) on delete cascade,  -- filled from the slot
  booking_date       date not null,
  status             booking_status not null default 'requested',
  note               text,
  -- confirmation workflow bookkeeping
  requested_at       timestamptz default now(),
  confirmed_at       timestamptz,
  decided_at         timestamptz,                 -- when the last status change happened
  decided_by         uuid references profiles(id) on delete set null,
  cancel_reason      text,
  decline_reason     text,
  -- a preceptor-proposed alternate time (abhyasi accepts -> becomes the sitting)
  alternate_date       date,
  alternate_start_time time,
  alternate_end_time   time,
  channel_used       text,                        -- 'whatsapp' | 'email' (Phase 3/4)
  created_at         timestamptz default now()
);

create index idx_bookings_slot_date on bookings(slot_id, booking_date);
create index idx_bookings_abhyasi on bookings(abhyasi_id);
create index idx_bookings_preceptor on bookings(preceptor_id);

-- One person cannot hold two LIVE places in the same slot on the same date.
-- Dead states (cancelled/declined/expired/no_show) release the seat.
create unique index uniq_live_booking
  on bookings (slot_id, booking_date, abhyasi_id)
  where status not in ('cancelled', 'declined', 'expired', 'no_show');

-- =====================================================================
-- CAPACITY GUARD — refuse a booking that would overfill a slot.
-- This runs inside the database, so even simultaneous requests are safe.
-- =====================================================================
-- SECURITY DEFINER matters here: as the calling user, the count below would
-- be filtered by the "bookings readable to involved" policy, so the second
-- person to book would count zero existing bookings and overfill the slot.
create or replace function check_slot_capacity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  slot_capacity int;
  live_count int;
begin
  if new.status in ('cancelled', 'declined', 'expired', 'no_show') then
    return new;
  end if;

  select capacity into slot_capacity
  from availability_slots where id = new.slot_id;

  select count(*) into live_count
  from bookings
  where slot_id = new.slot_id
    and booking_date = new.booking_date
    and status not in ('cancelled', 'declined', 'expired', 'no_show')
    and id <> new.id;

  if live_count >= slot_capacity then
    raise exception 'This slot is already full for the selected date.';
  end if;

  return new;
end;
$$;

create trigger trg_check_capacity
  before insert or update on bookings
  for each row execute function check_slot_capacity();

-- =====================================================================
-- BOOKING DEFAULTS — on insert, stamp the preceptor and honour
-- a preceptor's "auto_confirm" preference.
-- =====================================================================
create or replace function set_booking_defaults()
returns trigger as $$
declare
  slot_preceptor uuid;
  precep_auto    boolean;
begin
  select preceptor_id into slot_preceptor from availability_slots where id = new.slot_id;
  new.preceptor_id := slot_preceptor;
  if new.requested_at is null then new.requested_at := now(); end if;

  if new.status = 'requested' then
    select auto_confirm into precep_auto from profiles where id = slot_preceptor;
    if coalesce(precep_auto, false) then
      new.status := 'confirmed';
      new.confirmed_at := now();
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

-- Name sorts before trg_check_capacity, so defaults are applied first.
create trigger trg_booking_defaults
  before insert on bookings
  for each row execute function set_booking_defaults();

-- =====================================================================
-- STATE MACHINE GUARD — enforce who may make which status transition,
-- and stamp confirmed_at / decided_at / decided_by automatically.
-- A null auth.uid() (pg_cron / service role) or an admin = "system".
-- =====================================================================
create or replace function on_booking_status_change()
returns trigger as $$
declare
  actor      uuid    := auth.uid();
  is_precep  boolean := (actor is not null and actor = old.preceptor_id);
  is_abhy    boolean := (actor is not null and actor = old.abhyasi_id);
  is_sys     boolean := (actor is null or is_admin());
  ok         boolean := false;
begin
  if new.status is distinct from old.status then
    if old.status in ('completed', 'no_show', 'declined', 'expired', 'cancelled') then
      raise exception 'This sitting is already %; its status cannot change.', old.status;
    end if;

    if new.status = 'cancelled'
       and (is_precep or is_abhy or is_sys)
       and old.status in ('requested', 'confirmed', 'reminded', 'alternate_proposed') then
      ok := true;
    end if;

    if (is_precep or is_sys) and old.status = 'requested'
       and new.status in ('confirmed', 'declined', 'alternate_proposed') then
      ok := true;
    end if;

    if (is_precep or is_sys) and old.status in ('confirmed', 'reminded')
       and new.status in ('completed', 'no_show') then
      ok := true;
    end if;

    if (is_abhy or is_sys) and old.status = 'alternate_proposed'
       and new.status = 'confirmed' then
      ok := true;
    end if;

    if is_sys and (
         (old.status = 'confirmed' and new.status = 'reminded')
      or (old.status = 'requested' and new.status = 'expired')
    ) then
      ok := true;
    end if;

    if not ok then
      raise exception 'You are not allowed to move this sitting from % to %.', old.status, new.status;
    end if;

    if new.status = 'confirmed' and new.confirmed_at is null then
      new.confirmed_at := now();
    end if;
    new.decided_at := now();
    if actor is not null then new.decided_by := actor; end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_booking_status_change
  before update on bookings
  for each row execute function on_booking_status_change();

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table zones               enable row level security;
alter table centers             enable row level security;
alter table heartspots          enable row level security;
alter table areas               enable row level security;
alter table profiles            enable row level security;
alter table availability_slots  enable row level security;
alter table home_places         enable row level security;
alter table bookings            enable row level security;

-- Helper: is the current user an admin? (security definer bypasses RLS,
-- which avoids infinite recursion when checking the profiles table.)
create or replace function is_admin()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ---- Roles are an administrator's decision -------------------------
-- "update own profile" below lets you edit your own row, and `role` is a
-- column on that row — so without this guard any signed-in person could
-- call the API directly and make themselves an admin. Attempts are
-- ignored rather than rejected, because the sign-up screen sends `role`
-- as part of its upsert and a hard error there would block a real save.
create or replace function guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- auth.uid() is null for the service role and scheduled jobs — trusted.
  if auth.uid() is null or is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Signing up, you may only ever be an abhyasi or a preceptor.
    if new.role not in ('abhyasi', 'preceptor') then
      new.role := 'abhyasi';
    end if;
  else
    new.role := old.role;
  end if;

  return new;
end;
$$;

create trigger trg_guard_profile_role
  before insert or update on profiles
  for each row execute function guard_profile_role();

-- ---- Master data: everyone signed in can read; only admins edit -----
create policy "master read zones"   on zones   for select to authenticated using (true);
create policy "master read centers" on centers for select to authenticated using (true);
create policy "master read areas"   on areas   for select to authenticated using (true);
create policy "master read heartspots" on heartspots for select to authenticated using (true);

create policy "admin write zones"   on zones   for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin write centers" on centers for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin write areas"   on areas   for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin write heartspots" on heartspots for all to authenticated using (is_admin()) with check (is_admin());

-- ---- Profiles -------------------------------------------------------
-- Signed-in users can see profiles (needed to show preceptor & abhyasi names).
create policy "profiles readable" on profiles
  for select to authenticated using (true);

-- A user may create only their own profile row.
create policy "insert own profile" on profiles
  for insert to authenticated with check (id = auth.uid());

-- A user may edit their own profile; admins may edit anyone.
create policy "update own profile" on profiles
  for update to authenticated using (id = auth.uid() or is_admin()) with check (id = auth.uid() or is_admin());

-- ---- Availability slots --------------------------------------------
-- Everyone signed in can read slots (so abhyasis can find preceptors).
create policy "slots readable" on availability_slots
  for select to authenticated using (true);

-- A preceptor manages only their own slots; admins can manage any.
create policy "preceptor manage own slots" on availability_slots
  for all to authenticated
  using (preceptor_id = auth.uid() or is_admin())
  with check (preceptor_id = auth.uid() or is_admin());

-- ---- Home places (where a person lives) -----------------------------
-- Yours to edit, nobody else's (bar an admin).
create policy "own home place manageable" on home_places
  for all to authenticated
  using (profile_id = auth.uid() or is_admin())
  with check (profile_id = auth.uid() or is_admin());

-- An abhyasi sees a preceptor's home only once a sitting there is on.
-- 'requested' is deliberately absent: asking is not the same as being
-- invited. The finished states stay readable so a past sitting still
-- reads sensibly.
create policy "home place readable once confirmed" on home_places
  for select to authenticated
  using (
    exists (
      select 1
      from bookings b
      join availability_slots s on s.id = b.slot_id
      where s.preceptor_id = home_places.profile_id
        and s.place_type = 'home'
        and b.abhyasi_id = auth.uid()
        and b.status in ('confirmed', 'reminded', 'completed', 'no_show')
    )
  );

-- ---- Bookings -------------------------------------------------------
-- Visible to: the booker, the preceptor who owns the slot, or an admin.
create policy "bookings readable to involved" on bookings
  for select to authenticated using (
    abhyasi_id = auth.uid()
    or is_admin()
    or exists (
      select 1 from availability_slots s
      where s.id = bookings.slot_id and s.preceptor_id = auth.uid()
    )
  );

-- A user creates bookings only for themselves.
create policy "insert own booking" on bookings
  for insert to authenticated with check (abhyasi_id = auth.uid());

-- The booker or the slot's preceptor (or admin) may update status (e.g. cancel / complete).
create policy "update involved booking" on bookings
  for update to authenticated using (
    abhyasi_id = auth.uid()
    or is_admin()
    or exists (
      select 1 from availability_slots s
      where s.id = bookings.slot_id and s.preceptor_id = auth.uid()
    )
  );

-- The booker or an admin may delete a booking.
create policy "delete own booking" on bookings
  for delete to authenticated using (abhyasi_id = auth.uid() or is_admin());

-- =====================================================================
-- DONE. Next: run seed.sql to load sample master data, then sign up,
-- then promote yourself to admin (see README, "Become an admin").
-- =====================================================================

-- =====================================================================
-- RPC: find_available_slots(target_date)
-- Returns every active slot for that weekday, with how many places are
-- already taken on that date. It runs as SECURITY DEFINER so an abhyasi
-- can see the *count* of taken places without being able to read other
-- people's private bookings (which RLS still protects).
-- The app applies the zone / center / time filters on top.
-- =====================================================================
create or replace function find_available_slots(target_date date)
returns table (
  slot_id            uuid,
  preceptor_id       uuid,
  preceptor_name     text,
  preceptor_phone    text,
  preceptor_area_id  uuid,
  center_id          uuid,
  center_name        text,
  center_city        text,
  center_zone_id     uuid,
  center_lat         double precision,
  center_lng         double precision,
  day_of_week        int,
  start_time         time,
  end_time           time,
  capacity           int,
  note               text,
  booked_count       bigint,
  -- Where the sitting happens. For a home sitting this is deliberately
  -- vague: no address, no link, and coordinates rounded to ~1 km. The
  -- real address comes from the preceptor's `home_places` row, once
  -- there is a confirmed booking to justify reading it.
  place_type         text,
  heartspot_id       uuid,
  heartspot_name     text,
  place_address      text,
  place_lat          double precision,
  place_lng          double precision,
  place_map_url      text
)
language sql
security definer
stable
as $$
  select
    s.id, p.id, p.full_name, p.phone, p.area_id,
    c.id, c.name, c.city, c.zone_id, c.latitude, c.longitude,
    s.day_of_week, s.start_time, s.end_time, s.capacity, s.note,
    coalesce(b.cnt, 0) as booked_count,
    s.place_type::text,
    h.id, h.name,
    -- A heartspot's own details win; otherwise the center's.
    case when s.place_type = 'home' then null
         else coalesce(h.address, c.address) end,
    -- Two decimal places is about 1.1 km — enough to sort by distance,
    -- not enough to point at a house.
    case when s.place_type = 'home'
           then round(hp.latitude::numeric, 2)::double precision
         else coalesce(h.latitude, c.latitude) end,
    case when s.place_type = 'home'
           then round(hp.longitude::numeric, 2)::double precision
         else coalesce(h.longitude, c.longitude) end,
    case when s.place_type = 'home' then null
         else coalesce(h.map_url, c.map_url) end
  from availability_slots s
  join profiles p on p.id = s.preceptor_id
  left join centers c on c.id = s.center_id
  left join heartspots h on h.id = s.heartspot_id
  left join home_places hp on hp.profile_id = s.preceptor_id
  left join (
    select slot_id, count(*) as cnt
    from bookings
    where booking_date = target_date
      and status not in ('cancelled', 'declined', 'expired', 'no_show')
    group by slot_id
  ) b on b.slot_id = s.id
  where s.is_active = true
    and s.day_of_week = extract(dow from target_date)::int;
$$;

grant execute on function find_available_slots(date) to authenticated;

-- =====================================================================
-- HARDENING — keep the elevated-privilege functions honest.
-- (Same as migrations/003_security_hardening.sql, for a fresh install.)
-- =====================================================================

-- A fixed search_path stops a caller pointing the function at a schema of
-- their own so it reads *their* `profiles` table instead of ours.
-- `public, pg_temp` (rather than '') keeps the unqualified table names in
-- these bodies working; pg_temp last means a temp table can't shadow a real one.
alter function public.set_booking_defaults()     set search_path = public, pg_temp;
alter function public.on_booking_status_change() set search_path = public, pg_temp;
alter function public.find_available_slots(date) set search_path = public, pg_temp;
-- normalize_slot_place() already fixes its own search_path at creation.

-- Trigger functions only ever run from a trigger, so nobody needs EXECUTE
-- on them — and without it they stop being REST endpoints. Postgres checks
-- this privilege when the trigger is created, not each time it fires.
revoke execute on function public.check_slot_capacity()      from public, anon, authenticated;
revoke execute on function public.set_booking_defaults()     from public, anon, authenticated;
revoke execute on function public.on_booking_status_change() from public, anon, authenticated;
revoke execute on function public.guard_profile_role()       from public, anon, authenticated;
revoke execute on function public.normalize_slot_place()     from public, anon, authenticated;

-- is_admin() is evaluated inside the RLS policies as the calling user, so
-- signed-in users must keep EXECUTE. Signed-out ones never reach a policy
-- that uses it.
revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated;

-- The slot search is for signed-in users only.
revoke execute on function public.find_available_slots(date) from public, anon;

-- One more setting lives outside the database: turn on **leaked password
-- protection** in the Supabase Dashboard under Authentication → Sign In /
-- Providers → Password.
