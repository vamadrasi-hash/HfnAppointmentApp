-- =====================================================================
-- 008 — A preceptor account waits for an administrator's approval
--
-- Anyone can sign up. An abhyasi is ready straight away: they sign in and
-- start requesting sittings. Saying "I am a preceptor", though, is a claim
-- about someone's role in the sangha, and the app cannot verify it — so a
-- preceptor account is created *pending* and an administrator approves it.
--
-- Until then the account behaves like any other signed-in person: they can
-- find and request sittings, but they cannot publish availability, and no
-- abhyasi sees them in search.
--
--   profiles.preceptor_status   'pending' | 'approved' | 'rejected'
--                               null for anyone who is not a preceptor
--
-- Everyone who is already a preceptor keeps working: this migration marks
-- them approved. Only new sign-ups have to wait.
--
-- Run this ONCE in the Supabase SQL Editor, after 007.
-- =====================================================================

-- ---- 1. the column ---------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'preceptor_status') then
    create type preceptor_status as enum ('pending', 'approved', 'rejected');
  end if;
end
$$;

alter table profiles
  add column if not exists preceptor_status preceptor_status,
  add column if not exists approved_by uuid references profiles(id) on delete set null,
  add column if not exists approved_at timestamptz;

create index if not exists idx_profiles_preceptor_status
  on profiles(preceptor_status)
  where preceptor_status is not null;

-- Nobody who is already giving sittings is asked to wait for approval.
update profiles
   set preceptor_status = 'approved',
       approved_at = coalesce(approved_at, now())
 where role in ('preceptor', 'admin')
   and preceptor_status is null;

-- ---- 2. the role guard also stamps the approval ----------------------
-- It already stopped a signed-in person making themselves an admin. Now it
-- also stops them approving themselves: outside of an admin (or the
-- service role), `preceptor_status` is carried over from the old row
-- rather than taken from what was sent.
create or replace function guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  -- The service role and scheduled jobs have no auth.uid(); both are trusted.
  privileged boolean := (auth.uid() is null or is_admin());
begin
  if not privileged then
    if tg_op = 'INSERT' then
      -- Signing up, you may only ever be an abhyasi or a preceptor...
      if new.role not in ('abhyasi', 'preceptor') then
        new.role := 'abhyasi';
      end if;
      -- ...and never arrive pre-approved; step 3 below decides.
      new.preceptor_status := null;
      new.approved_by := null;
      new.approved_at := null;
    else
      new.role := old.role;
      new.preceptor_status := old.preceptor_status;
      new.approved_by := old.approved_by;
      new.approved_at := old.approved_at;
    end if;
  end if;

  -- ---- 3. keep the approval in step with the role --------------------
  if new.role = 'preceptor' then
    -- A new preceptor waits; an existing one keeps whatever they have.
    if new.preceptor_status is null then
      new.preceptor_status := 'pending';
    end if;
  elsif new.role = 'admin' then
    new.preceptor_status := 'approved';
  else
    -- An abhyasi (or coordinator) has nothing to approve.
    new.preceptor_status := null;
  end if;

  if tg_op = 'UPDATE'
     and new.preceptor_status is distinct from old.preceptor_status
     and new.preceptor_status = 'approved' then
    new.approved_by := auth.uid();
    new.approved_at := now();
  end if;

  return new;
end;
$fn$;

revoke execute on function public.guard_profile_role() from public, anon, authenticated;

-- ---- 4. who may publish availability ---------------------------------
create or replace function is_approved_preceptor()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and (role = 'admin' or (role = 'preceptor' and preceptor_status = 'approved'))
  );
$fn$;

revoke execute on function public.is_approved_preceptor() from public, anon;
grant  execute on function public.is_approved_preceptor() to authenticated;

-- Reading and removing your own slots stays open — a preceptor whose
-- approval is withdrawn can still tidy up. Writing a new one, or bringing
-- an old one back, needs the approval.
drop policy if exists "preceptor manage own slots" on availability_slots;
drop policy if exists "approved preceptor manage own slots" on availability_slots;

create policy "approved preceptor manage own slots" on availability_slots
  for all to authenticated
  using (preceptor_id = auth.uid() or is_admin())
  with check ((preceptor_id = auth.uid() and is_approved_preceptor()) or is_admin());

-- ---- 5. an unapproved preceptor takes no bookings --------------------
-- Search already hides them (step 6) and they have no slots to be found
-- on, but a slot published before an approval was withdrawn would still be
-- bookable by anyone holding its id.
create or replace function set_booking_defaults()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  slot_preceptor uuid;
  precep_auto    boolean;
  precep_status  preceptor_status;
begin
  select preceptor_id into slot_preceptor from availability_slots where id = new.slot_id;
  new.preceptor_id := slot_preceptor;
  if new.requested_at is null then new.requested_at := now(); end if;

  select preceptor_status into precep_status from profiles where id = slot_preceptor;
  if precep_status is distinct from 'approved' then
    raise exception 'This preceptor is not approved to give sittings yet.';
  end if;

  if new.status = 'requested' then
    select auto_confirm into precep_auto from profiles where id = slot_preceptor;
    if coalesce(precep_auto, false) then
      new.status := 'confirmed';
      new.confirmed_at := now();
    end if;
  end if;
  return new;
end;
$fn$;

revoke execute on function public.set_booking_defaults() from public, anon, authenticated;

-- ---- 6. search only ever shows approved preceptors -------------------
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
    and p.preceptor_status = 'approved'
    and s.day_of_week = extract(dow from target_date)::int;
$fn$;

grant execute on function find_available_slots(date) to authenticated;
revoke execute on function public.find_available_slots(date) from public, anon;
