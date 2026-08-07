-- =====================================================================
-- 012 — A time that has already begun cannot be asked for.
--
-- The screens stopped offering this morning's times once the morning had
-- gone, but nothing in the database said so. `bookings` is written by a
-- plain insert under row level security, so anyone calling the API with
-- their own token could ask for a slot at half past six in the morning
-- at three in the afternoon, and the row would be accepted. This closes
-- that.
--
-- **Which zone.** A slot carries a bare time of day — 06:30 — with no
-- zone attached, and nothing in the schema records which zone a center
-- keeps, so the server has nothing to compare `now()` against on its
-- own. `app_timezone()` below states the assumption in one place: every
-- published time is read as being in that zone. Change it there if the
-- app is ever used somewhere else, or replace it with a column on
-- `centers` if two zones ever have to coexist.
--
-- **Who it applies to.** The seeker, which is where the hole was. An
-- admin and the service role are let through, as they are by the other
-- guards here, so a sitting can still be recorded after the fact and an
-- import is not fought at every row.
--
-- **Inserts only.** Confirming, declining or cancelling a request whose
-- time has since passed still has to work — those are updates, and this
-- does not touch them.
--
-- Run this ONCE in the Supabase SQL Editor, after 011.
-- =====================================================================

-- ---------------------------------------------------------------------
-- The zone every published time is kept in
-- ---------------------------------------------------------------------
create or replace function app_timezone()
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select 'Asia/Kolkata'::text;
$$;

grant execute on function public.app_timezone() to authenticated;

-- ---------------------------------------------------------------------
-- The guard
-- ---------------------------------------------------------------------
create or replace function guard_booking_not_past()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  starts_at time;
  begins_at timestamptz;
begin
  -- An admin, or the service role with no signed-in user at all, may
  -- record a sitting that has already happened.
  if auth.uid() is null or is_admin() then
    return new;
  end if;

  -- trg_booking_defaults has already run, so a slot booking has its slot
  -- and an out-of-schedule request has the time it asked for.
  if new.slot_id is not null then
    select start_time into starts_at
    from availability_slots
    where id = new.slot_id;
  else
    starts_at := new.requested_start_time;
  end if;

  -- Nothing to compare against. Whatever is wrong with the row, another
  -- guard has a better answer for it than this one.
  if starts_at is null or new.booking_date is null then
    return new;
  end if;

  -- The date and the time of day together are a wall-clock reading; the
  -- zone is what turns it into a moment.
  begins_at := (new.booking_date + starts_at) at time zone app_timezone();

  if begins_at <= now() then
    raise exception 'That time has already passed. Please pick a later one.';
  end if;

  return new;
end;
$fn$;

-- The name decides the order. It sorts after trg_booking_defaults
-- ('d' < 'n'), so the slot and the requested time are already filled in
-- by the time this runs, and before trg_check_capacity ('b' < 'c'), so a
-- time that has gone is refused before seats are counted for it.
drop trigger if exists trg_booking_not_past on bookings;
create trigger trg_booking_not_past
  before insert on bookings
  for each row execute function guard_booking_not_past();

-- Nobody calls the guard directly; the trigger runs it.
revoke execute on function public.guard_booking_not_past() from public, anon, authenticated;
