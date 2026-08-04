-- =====================================================================
-- 006 — A preceptor's home address is private until they confirm
--
-- 005 kept the home address on `availability_slots`, and every signed-in
-- user can read that table (they have to — it is how anyone finds an open
-- time). Row level security is row-level: there is no way to hide one
-- column of a row that must otherwise stay visible. So the address moves
-- to a table of its own, which only the right people can read.
--
--   slot_places   one row per home sitting, readable by
--                   * the preceptor whose slot it is
--                   * an admin
--                   * an abhyasi whose booking on that slot is confirmed
--                     (or already happened)
--
-- An abhyasi with a request still waiting sees the area and nothing more.
--
-- The search screen keeps working: `find_available_slots` runs as
-- SECURITY DEFINER, so it can read the private row and hand back only a
-- coarse version of it — coordinates rounded to about a kilometre, which
-- is enough to sort by distance and not enough to find the house.
--
-- Run this ONCE in the Supabase SQL Editor, after 005.
-- =====================================================================

-- ---- 1. the private table -------------------------------------------
create table if not exists slot_places (
  slot_id    uuid primary key references availability_slots(id) on delete cascade,
  address    text not null,
  latitude   double precision,
  longitude  double precision,
  map_url    text,
  updated_at timestamptz default now()
);

alter table slot_places enable row level security;

drop policy if exists "preceptor manages own slot place" on slot_places;
drop policy if exists "slot place readable once confirmed" on slot_places;

-- The preceptor (or an admin) owns it outright.
create policy "preceptor manages own slot place" on slot_places
  for all to authenticated
  using (
    exists (
      select 1 from availability_slots s
      where s.id = slot_places.slot_id and (s.preceptor_id = auth.uid() or is_admin())
    )
  )
  with check (
    exists (
      select 1 from availability_slots s
      where s.id = slot_places.slot_id and (s.preceptor_id = auth.uid() or is_admin())
    )
  );

-- An abhyasi sees it only once the sitting is actually on. 'requested' is
-- deliberately absent: asking is not the same as being invited. The
-- finished states stay readable so a past sitting still reads sensibly.
create policy "slot place readable once confirmed" on slot_places
  for select to authenticated
  using (
    exists (
      select 1 from bookings b
      where b.slot_id = slot_places.slot_id
        and b.abhyasi_id = auth.uid()
        and b.status in ('confirmed', 'reminded', 'completed', 'no_show')
    )
  );

-- ---- 2. move what 005 already stored ---------------------------------
insert into slot_places (slot_id, address, latitude, longitude, map_url)
select id, address, latitude, longitude, map_url
from availability_slots
where place_type = 'home'
  and coalesce(btrim(address), '') <> ''
on conflict (slot_id) do nothing;

-- ---- 3. take the public columns away ---------------------------------
-- A heartspot sitting never needed them: it inherits its address from the
-- heartspot, and that one from its center.
-- The search RPC still reads those columns, so it goes first; step 5
-- builds it back.
drop function if exists find_available_slots(date);

alter table availability_slots drop constraint if exists chk_home_has_address;
alter table availability_slots
  drop column if exists address,
  drop column if exists latitude,
  drop column if exists longitude,
  drop column if exists map_url;

-- ---- 4. keep the two halves consistent -------------------------------
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
    new.heartspot_id := null;
  else
    if tg_op = 'UPDATE' then
      -- No longer a home sitting: the private address has nothing left to
      -- describe, so it goes with it.
      delete from slot_places where slot_id = new.id;
    end if;
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

revoke execute on function public.normalize_slot_place() from public, anon, authenticated;

-- ---- 5. the search RPC gives out only what it may --------------------
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
  -- where the sitting happens. For a home sitting this is deliberately
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
as $$
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
           then round(sp.latitude::numeric, 2)::double precision
         else coalesce(h.latitude, c.latitude) end,
    case when s.place_type = 'home'
           then round(sp.longitude::numeric, 2)::double precision
         else coalesce(h.longitude, c.longitude) end,
    case when s.place_type = 'home' then null
         else coalesce(h.map_url, c.map_url) end
  from availability_slots s
  join profiles p on p.id = s.preceptor_id
  left join centers c on c.id = s.center_id
  left join heartspots h on h.id = s.heartspot_id
  left join slot_places sp on sp.slot_id = s.id
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
