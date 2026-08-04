-- =====================================================================
-- 005 — Where the sitting happens: heartspots + a preceptor's home
--
-- What this adds
--   1. `heartspots` — the meditation places that belong to a center.
--      A center can have several ("Adajan Heartspot", "Community hall"…).
--      Admins maintain them; everyone signed in can read them.
--   2. `centers.map_url` — so a center can also carry a Google Maps link
--      next to the address and coordinates it already had.
--   3. `availability_slots` learns *where* the sitting happens:
--        place_type   'heartspot' (the default) or 'home'
--        heartspot_id which heartspot, when place_type = 'heartspot'
--        address / latitude / longitude / map_url — used for a home
--        sitting, and available as an override for a heartspot one.
--   4. `find_available_slots` returns the resolved place, so the search
--      screen can show it without a second round trip.
--
-- Existing slots keep working: they become 'heartspot' slots at the
-- center they already pointed at.
--
-- Run this ONCE in the Supabase SQL Editor.
-- =====================================================================

-- ---- 1. heartspots ---------------------------------------------------
create table if not exists heartspots (
  id          uuid primary key default uuid_generate_v4(),
  center_id   uuid not null references centers(id) on delete cascade,
  name        text not null,                   -- e.g. 'Adajan Heartspot'
  address     text,
  latitude    double precision,
  longitude   double precision,
  map_url     text,                            -- a Google Maps link
  is_active   boolean not null default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists idx_heartspots_center on heartspots(center_id);

-- Two heartspots in one center cannot share a name (case-insensitively).
create unique index if not exists uniq_heartspot_name_per_center
  on heartspots (center_id, lower(name));

alter table heartspots enable row level security;

drop policy if exists "master read heartspots"  on heartspots;
drop policy if exists "admin write heartspots"  on heartspots;

create policy "master read heartspots" on heartspots
  for select to authenticated using (true);

create policy "admin write heartspots" on heartspots
  for all to authenticated using (is_admin()) with check (is_admin());

-- ---- 2. centers carry a map link too ---------------------------------
alter table centers add column if not exists map_url text;

-- ---- 3. the place of a sitting ---------------------------------------
do $$
begin
  create type sitting_place as enum ('heartspot', 'home');
exception
  when duplicate_object then null;
end
$$;

alter table availability_slots
  add column if not exists place_type   sitting_place not null default 'heartspot',
  add column if not exists heartspot_id uuid references heartspots(id) on delete set null,
  add column if not exists address      text,
  add column if not exists latitude     double precision,
  add column if not exists longitude    double precision,
  add column if not exists map_url      text;

create index if not exists idx_slots_heartspot on availability_slots(heartspot_id);

-- A home sitting is useless without an address to go to.
alter table availability_slots drop constraint if exists chk_home_has_address;
alter table availability_slots
  add constraint chk_home_has_address
  check (place_type <> 'home' or coalesce(btrim(address), '') <> '');

-- Keep the two halves consistent: a home sitting has no heartspot, and a
-- heartspot must belong to the center the slot is filed under (the center
-- fills itself in when only the heartspot was chosen).
create or replace function normalize_slot_place()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  hs_center uuid;
begin
  new.address := nullif(btrim(coalesce(new.address, '')), '');
  new.map_url := nullif(btrim(coalesce(new.map_url, '')), '');

  if new.place_type = 'home' then
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
$$;

drop trigger if exists trg_normalize_slot_place on availability_slots;
create trigger trg_normalize_slot_place
  before insert or update on availability_slots
  for each row execute function normalize_slot_place();

revoke execute on function public.normalize_slot_place() from public, anon, authenticated;

-- ---- 4. the search RPC returns the resolved place --------------------
-- The return type changes, so the old function has to go first.
drop function if exists find_available_slots(date);

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
  -- where the sitting happens
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
as $$
  select
    s.id, p.id, p.full_name, p.phone, p.area_id,
    c.id, c.name, c.city, c.zone_id, c.latitude, c.longitude,
    s.day_of_week, s.start_time, s.end_time, s.capacity, s.note,
    coalesce(b.cnt, 0) as booked_count,
    s.place_type::text,
    h.id, h.name,
    -- The slot's own details win; otherwise fall back to the heartspot,
    -- then to the center.
    coalesce(s.address,   h.address,   c.address),
    coalesce(s.latitude,  h.latitude,  c.latitude),
    coalesce(s.longitude, h.longitude, c.longitude),
    coalesce(s.map_url,   h.map_url,   c.map_url)
  from availability_slots s
  join profiles p on p.id = s.preceptor_id
  left join centers c on c.id = s.center_id
  left join heartspots h on h.id = s.heartspot_id
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
revoke execute on function public.find_available_slots(date) from public, anon;

-- ---- 5. give every center a starting heartspot -----------------------
-- Named after the center itself, so the picker is never empty. Admins
-- rename these and add the rest under Master data -> a center.
-- Skip this block if you would rather enter every heartspot by hand.
insert into heartspots (center_id, name)
select c.id, c.name
from centers c
where not exists (select 1 from heartspots h where h.center_id = c.id);

-- Existing slots already point at a center — file them under that
-- center's heartspot so they read the same way as new ones.
update availability_slots s
set heartspot_id = h.id
from heartspots h
where s.heartspot_id is null
  and s.place_type = 'heartspot'
  and h.center_id = s.center_id
  and lower(h.name) = lower((select c.name from centers c where c.id = s.center_id));
