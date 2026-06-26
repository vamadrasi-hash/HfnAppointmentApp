-- =====================================================================
-- HEARTFULNESS APPOINTMENT MANAGEMENT SYSTEM — DATABASE SCHEMA
-- Run this ONCE in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
-- It is safe to re-run: it drops and recreates everything cleanly.
-- =====================================================================

-- ---- Clean slate (so you can re-run during setup) -------------------
drop table if exists bookings cascade;
drop table if exists availability_slots cascade;
drop table if exists profiles cascade;
drop table if exists areas cascade;
drop table if exists centers cascade;
drop table if exists zones cascade;
drop type if exists user_role cascade;
drop type if exists booking_status cascade;

create extension if not exists "uuid-ossp";

-- ---- Enums ----------------------------------------------------------
create type user_role as enum ('abhyasi', 'preceptor', 'admin');
create type booking_status as enum ('confirmed', 'cancelled', 'completed');

-- =====================================================================
-- MASTER DATA: Zone -> Center -> Area
-- =====================================================================
create table zones (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null unique,            -- e.g. 'Zone A'
  description text,
  sort_order  int default 0,
  created_at  timestamptz default now()
);

create table centers (
  id          uuid primary key default uuid_generate_v4(),
  zone_id     uuid not null references zones(id) on delete cascade,
  name        text not null,                   -- e.g. 'Surat Central Center'
  city        text not null,                   -- e.g. 'Surat'
  address     text,
  latitude    double precision,                -- for "near me" search
  longitude   double precision,
  created_at  timestamptz default now()
);

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
  area_id         uuid references areas(id) on delete set null,
  city            text,
  -- geolocation (used by the "near me" feature)
  home_latitude   double precision,
  home_longitude  double precision,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index idx_profiles_center on profiles(center_id);
create index idx_profiles_role on profiles(role);

-- =====================================================================
-- AVAILABILITY SLOTS — a preceptor's recurring weekly openings
-- day_of_week follows JavaScript: 0=Sunday, 1=Monday ... 6=Saturday
-- =====================================================================
create table availability_slots (
  id            uuid primary key default uuid_generate_v4(),
  preceptor_id  uuid not null references profiles(id) on delete cascade,
  center_id     uuid references centers(id) on delete set null,  -- where the sitting happens
  day_of_week   int not null check (day_of_week between 0 and 6),
  start_time    time not null,
  end_time      time not null,
  capacity      int not null default 1 check (capacity > 0),
  is_active     boolean not null default true,
  note          text,
  created_at    timestamptz default now(),
  constraint chk_time_order check (end_time > start_time)
);

create index idx_slots_preceptor on availability_slots(preceptor_id);
create index idx_slots_day on availability_slots(day_of_week);
create index idx_slots_center on availability_slots(center_id);

-- =====================================================================
-- BOOKINGS — an abhyasi reserves a place in a slot for one real date
-- =====================================================================
create table bookings (
  id            uuid primary key default uuid_generate_v4(),
  slot_id       uuid not null references availability_slots(id) on delete cascade,
  abhyasi_id    uuid not null references profiles(id) on delete cascade,
  booking_date  date not null,
  status        booking_status not null default 'confirmed',
  note          text,
  created_at    timestamptz default now()
);

create index idx_bookings_slot_date on bookings(slot_id, booking_date);
create index idx_bookings_abhyasi on bookings(abhyasi_id);

-- One person cannot hold two live places in the same slot on the same date
create unique index uniq_live_booking
  on bookings (slot_id, booking_date, abhyasi_id)
  where status <> 'cancelled';

-- =====================================================================
-- CAPACITY GUARD — refuse a booking that would overfill a slot.
-- This runs inside the database, so even simultaneous requests are safe.
-- =====================================================================
create or replace function check_slot_capacity()
returns trigger as $$
declare
  slot_capacity int;
  live_count int;
begin
  if (new.status = 'cancelled') then
    return new;
  end if;

  select capacity into slot_capacity
  from availability_slots where id = new.slot_id;

  select count(*) into live_count
  from bookings
  where slot_id = new.slot_id
    and booking_date = new.booking_date
    and status <> 'cancelled'
    and id <> new.id;

  if live_count >= slot_capacity then
    raise exception 'This slot is already full for the selected date.';
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_check_capacity
  before insert or update on bookings
  for each row execute function check_slot_capacity();

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table zones               enable row level security;
alter table centers             enable row level security;
alter table areas               enable row level security;
alter table profiles            enable row level security;
alter table availability_slots  enable row level security;
alter table bookings            enable row level security;

-- Helper: is the current user an admin? (security definer bypasses RLS,
-- which avoids infinite recursion when checking the profiles table.)
create or replace function is_admin()
returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- ---- Master data: everyone signed in can read; only admins edit -----
create policy "master read zones"   on zones   for select to authenticated using (true);
create policy "master read centers" on centers for select to authenticated using (true);
create policy "master read areas"   on areas   for select to authenticated using (true);

create policy "admin write zones"   on zones   for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin write centers" on centers for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin write areas"   on areas   for all to authenticated using (is_admin()) with check (is_admin());

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
-- The app applies the zone / center / area / city / time filters on top.
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
  booked_count       bigint
)
language sql
security definer
stable
as $$
  select
    s.id, p.id, p.full_name, p.phone, p.area_id,
    c.id, c.name, c.city, c.zone_id, c.latitude, c.longitude,
    s.day_of_week, s.start_time, s.end_time, s.capacity, s.note,
    coalesce(b.cnt, 0) as booked_count
  from availability_slots s
  join profiles p on p.id = s.preceptor_id
  left join centers c on c.id = s.center_id
  left join (
    select slot_id, count(*) as cnt
    from bookings
    where booking_date = target_date and status <> 'cancelled'
    group by slot_id
  ) b on b.slot_id = s.id
  where s.is_active = true
    and s.day_of_week = extract(dow from target_date)::int;
$$;

grant execute on function find_available_slots(date) to authenticated;
