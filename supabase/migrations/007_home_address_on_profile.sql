-- =====================================================================
-- 007 — A home address belongs to the person, not to each slot
--
-- 006 put a home address on the slot. But a preceptor has one home, and
-- retyping it on every weekly slot is both tedious and a way to end up
-- with three versions of it. So it moves to the profile:
--
--   home_places   one row per person — the address, and the Google
--                 location that goes with it.
--
-- This also closes a hole that predates all of this. `profiles` is
-- readable by every signed-in user (the app needs names on booking
-- cards), and it carried `home_latitude` / `home_longitude`. So anyone
-- signed in could read where anyone else lives, abhyasis included. Those
-- two columns move into `home_places` and are dropped from `profiles`.
--
-- Who can read a row
--   * the person themselves
--   * an admin
--   * an abhyasi whose booking on one of that preceptor's *home* slots
--     is confirmed (or already happened)
--
-- Run this ONCE in the Supabase SQL Editor, after 006.
-- =====================================================================

-- ---- 1. the private table -------------------------------------------
create table if not exists home_places (
  profile_id uuid primary key references profiles(id) on delete cascade,
  address    text,
  latitude   double precision,
  longitude  double precision,
  map_url    text,
  updated_at timestamptz default now()
);

alter table home_places enable row level security;

drop policy if exists "own home place manageable" on home_places;
drop policy if exists "home place readable once confirmed" on home_places;

-- Yours to edit, nobody else's (bar an admin).
create policy "own home place manageable" on home_places
  for all to authenticated
  using (profile_id = auth.uid() or is_admin())
  with check (profile_id = auth.uid() or is_admin());

-- An abhyasi sees a preceptor's home only once a sitting there is on.
-- 'requested' is deliberately absent: asking is not the same as being
-- invited. The finished states stay readable so past sittings still read
-- sensibly.
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

-- ---- 2. bring across what is already stored --------------------------
-- The slot-level addresses from 006. A preceptor with several home slots
-- keeps the most recently edited one — they describe the same house.
insert into home_places (profile_id, address, latitude, longitude, map_url)
select distinct on (s.preceptor_id)
       s.preceptor_id, sp.address, sp.latitude, sp.longitude, sp.map_url
from slot_places sp
join availability_slots s on s.id = sp.slot_id
order by s.preceptor_id, sp.updated_at desc nulls last
on conflict (profile_id) do nothing;

-- The home coordinates people had already saved for "near me".
insert into home_places (profile_id, latitude, longitude)
select id, home_latitude, home_longitude
from profiles
where home_latitude is not null and home_longitude is not null
on conflict (profile_id) do update
  set latitude  = coalesce(home_places.latitude,  excluded.latitude),
      longitude = coalesce(home_places.longitude, excluded.longitude);

-- ---- 3. drop what they replaced --------------------------------------
-- The search RPC reads both, so it goes first; step 5 builds it back.
drop function if exists find_available_slots(date);

drop table if exists slot_places;

alter table profiles
  drop column if exists home_latitude,
  drop column if exists home_longitude;

-- ---- 4. the slot trigger has one less thing to tidy ------------------
create or replace function normalize_slot_place()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  hs_center uuid;
begin
  if new.place_type = 'home' then
    -- The address lives on the preceptor's profile now, so a home slot
    -- carries nothing of its own beyond saying that it is one.
    new.heartspot_id := null;
  elsif new.heartspot_id is not null then
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

  return new;
end;
$fn$;

revoke execute on function public.normalize_slot_place() from public, anon, authenticated;

-- ---- 5. the search RPC reads the preceptor's home --------------------
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
  -- vague: no address, no link, and coordinates rounded to ~1 km.
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
set search_path = public, pg_temp
as $fn$
  select
    s.id, p.id, p.full_name, p.phone, p.area_id,
    c.id, c.name, c.city, c.zone_id, c.latitude, c.longitude,
    s.day_of_week, s.start_time, s.end_time, s.capacity, s.note,
    coalesce(b.cnt, 0) as booked_count,
    s.place_type::text,
    h.id, h.name,
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
$fn$;

grant execute on function find_available_slots(date) to authenticated;
revoke execute on function public.find_available_slots(date) from public, anon;
