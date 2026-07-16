-- =====================================================================
-- MIGRATION 001 — CONFIRMATION WORKFLOW (Phase 1)
-- ---------------------------------------------------------------------
-- Turns the simple "book = confirmed" model into the full request ->
-- confirm state machine from the spec:
--
--   requested -> confirmed | declined | alternate_proposed | expired
--   alternate_proposed -> confirmed (abhyasi accepts) | cancelled
--   confirmed -> reminded -> completed | no_show
--   confirmed/reminded/... -> cancelled
--
-- SAFE TO RUN ONCE on your EXISTING database (it keeps your data).
-- Every step is guarded, so re-running it does nothing harmful.
-- Paste this into Supabase -> SQL Editor -> New query -> Run.
-- (Fresh installs get all of this from schema.sql instead.)
-- =====================================================================

-- ---- 1. Expand the booking_status enum ------------------------------
-- We rebuild the type (instead of ALTER TYPE ADD VALUE) so it works
-- inside a single transaction and stays re-runnable.
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'booking_status' and e.enumlabel = 'requested'
  ) then
    execute 'alter table bookings alter column status drop default';
    execute 'alter type booking_status rename to booking_status_old';
    execute $e$
      create type booking_status as enum (
        'requested',            -- abhyasi asked; waiting on the preceptor
        'confirmed',            -- preceptor said yes (seat is held)
        'alternate_proposed',   -- preceptor offered a different time
        'declined',             -- preceptor said no
        'cancelled',            -- either party cancelled
        'reminded',             -- reminder sent (system) — still a live sitting
        'completed',            -- the sitting happened
        'no_show',              -- abhyasi did not attend
        'expired'               -- request went stale with no decision
      )
    $e$;
    execute 'alter table bookings alter column status type booking_status
             using status::text::booking_status';
    execute 'alter table bookings alter column status set default ''requested''';
    execute 'drop type booking_status_old';
  end if;
end $$;

-- ---- 2. New columns on bookings -------------------------------------
alter table bookings add column if not exists preceptor_id        uuid references profiles(id) on delete cascade;
alter table bookings add column if not exists requested_at        timestamptz default now();
alter table bookings add column if not exists confirmed_at        timestamptz;
alter table bookings add column if not exists decided_at          timestamptz;   -- when the last status change happened
alter table bookings add column if not exists decided_by          uuid references profiles(id) on delete set null;
alter table bookings add column if not exists cancel_reason       text;
alter table bookings add column if not exists decline_reason      text;
alter table bookings add column if not exists alternate_date      date;
alter table bookings add column if not exists alternate_start_time time;
alter table bookings add column if not exists alternate_end_time  time;
alter table bookings add column if not exists channel_used        text;          -- 'whatsapp' | 'email' (Phase 3/4)

-- Backfill preceptor_id on any bookings created before this migration.
update bookings b
   set preceptor_id = s.preceptor_id
  from availability_slots s
 where s.id = b.slot_id and b.preceptor_id is null;

create index if not exists idx_bookings_preceptor on bookings(preceptor_id);

-- ---- 3. Per-preceptor auto-confirm flag (spec §3) -------------------
alter table profiles add column if not exists auto_confirm boolean not null default false;

-- =====================================================================
-- 4. BEFORE INSERT: stamp preceptor_id + honour auto-confirm
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

  -- Low-friction preceptors: a request is confirmed the moment it is made.
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

drop trigger if exists trg_booking_defaults on bookings;
create trigger trg_booking_defaults
  before insert on bookings
  for each row execute function set_booking_defaults();

-- =====================================================================
-- 5. Capacity guard — only LIVE bookings hold a seat.
--    Dead states (cancelled/declined/expired/no_show) release it.
-- =====================================================================
create or replace function check_slot_capacity()
returns trigger as $$
declare
  slot_capacity int;
  live_count    int;
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
$$ language plpgsql;
-- (trigger trg_check_capacity already exists from schema.sql)

-- One live request/booking per person, per slot, per date.
drop index if exists uniq_live_booking;
create unique index uniq_live_booking
  on bookings (slot_id, booking_date, abhyasi_id)
  where status not in ('cancelled', 'declined', 'expired', 'no_show');

-- =====================================================================
-- 6. BEFORE UPDATE: enforce who may make which transition + stamp times
--    auth.uid() is the signed-in user. A null uid (pg_cron / service
--    role) or an admin is treated as "system" and may do system moves.
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
    -- Terminal states are final.
    if old.status in ('completed', 'no_show', 'declined', 'expired', 'cancelled') then
      raise exception 'This sitting is already %; its status cannot change.', old.status;
    end if;

    -- Either involved party (or system) may cancel a live sitting.
    if new.status = 'cancelled'
       and (is_precep or is_abhy or is_sys)
       and old.status in ('requested', 'confirmed', 'reminded', 'alternate_proposed') then
      ok := true;
    end if;

    -- Preceptor (or system) decides on a request.
    if (is_precep or is_sys) and old.status = 'requested'
       and new.status in ('confirmed', 'declined', 'alternate_proposed') then
      ok := true;
    end if;

    -- Preceptor (or system) records the outcome of a live sitting.
    if (is_precep or is_sys) and old.status in ('confirmed', 'reminded')
       and new.status in ('completed', 'no_show') then
      ok := true;
    end if;

    -- Abhyasi (or system) accepts a proposed alternate time.
    if (is_abhy or is_sys) and old.status = 'alternate_proposed'
       and new.status = 'confirmed' then
      ok := true;
    end if;

    -- System-only moves: reminder + auto-expiry.
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

drop trigger if exists trg_booking_status_change on bookings;
create trigger trg_booking_status_change
  before update on bookings
  for each row execute function on_booking_status_change();

-- =====================================================================
-- 7. Refresh find_available_slots so declined/expired seats reopen.
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
    where booking_date = target_date
      and status not in ('cancelled', 'declined', 'expired', 'no_show')
    group by slot_id
  ) b on b.slot_id = s.id
  where s.is_active = true
    and s.day_of_week = extract(dow from target_date)::int;
$$;

grant execute on function find_available_slots(date) to authenticated;

-- =====================================================================
-- DONE. Your existing bookings keep their status ('confirmed' etc.).
-- New bookings now start as 'requested' unless the preceptor has
-- auto_confirm turned on.
-- =====================================================================
