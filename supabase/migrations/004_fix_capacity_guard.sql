-- =====================================================================
-- 004 — The capacity guard never actually guarded anything
--
-- `check_slot_capacity()` counts the live bookings on a slot and refuses
-- one that would overfill it. But it ran as the *calling* user, so its
-- `select count(*) from bookings` went through row level security — and
-- the "bookings readable to involved" policy only shows you your own
-- bookings. So the second person to book always counted **zero** existing
-- bookings and was let straight in.
--
-- Reproduced on a 1-place slot: two different abhyasis, two accepted
-- bookings. The README promises the database refuses this, and it did not.
--
-- The fix is the same one `find_available_slots` already uses: run the
-- count with SECURITY DEFINER so it sees every booking, while RLS keeps
-- protecting the rows themselves from being *read* by the app.
--
-- Run this ONCE in the Supabase SQL Editor.
-- =====================================================================

create or replace function check_slot_capacity()
returns trigger
language plpgsql
security definer                      -- <- so the count is not filtered by RLS
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

-- A trigger function is never called directly, so keep it off the REST API.
revoke execute on function public.check_slot_capacity() from public, anon, authenticated;

-- =====================================================================
-- Existing data: any slot already overfilled by this bug stays as it is.
-- To find them:
--   select b.slot_id, b.booking_date, count(*) as booked, s.capacity
--   from bookings b join availability_slots s on s.id = b.slot_id
--   where b.status not in ('cancelled','declined','expired','no_show')
--   group by b.slot_id, b.booking_date, s.capacity
--   having count(*) > s.capacity;
-- =====================================================================
