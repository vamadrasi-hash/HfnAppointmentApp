-- =====================================================================
-- 003 — Security hardening
--
-- Three fixes, all raised by the Supabase database linter or found
-- alongside them. None of these change how the app behaves for a normal
-- abhyasi, preceptor or admin.
--
--   1. A user can no longer give themselves a role. The "update own
--      profile" policy lets you edit your own row, and `role` is a column
--      on that row — so before this, any signed-in person could call the
--      API directly and set role = 'admin'. Roles are now decided by an
--      administrator, full stop.
--   2. Every SECURITY DEFINER function gets a fixed `search_path`. Without
--      one, a caller can point `search_path` at a schema of their own and
--      have the function run *their* `profiles` table instead of ours.
--   3. Trigger functions are no longer callable over the REST API. They
--      only ever run from a trigger, so nobody needs EXECUTE on them.
--
-- Run this ONCE in the Supabase SQL Editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Roles are an administrator's decision
-- ---------------------------------------------------------------------
-- Attempts to set your own role are ignored rather than rejected: the
-- sign-up screen sends `role` as part of its upsert, and a hard error
-- there would block a legitimate save. Silently keeping the stored role
-- closes the hole without breaking that flow.
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

drop trigger if exists trg_guard_profile_role on profiles;
create trigger trg_guard_profile_role
  before insert or update on profiles
  for each row execute function guard_profile_role();

-- ---------------------------------------------------------------------
-- 2. Pin search_path on every function that runs with elevated rights
-- ---------------------------------------------------------------------
-- `public, pg_temp` (rather than '') keeps the unqualified table names in
-- these function bodies working, while pg_temp last means a caller's
-- temporary tables can never shadow a real one.
alter function public.is_admin()                     set search_path = public, pg_temp;
alter function public.check_slot_capacity()          set search_path = public, pg_temp;
alter function public.set_booking_defaults()         set search_path = public, pg_temp;
alter function public.on_booking_status_change()     set search_path = public, pg_temp;
alter function public.find_available_slots(date)     set search_path = public, pg_temp;

-- ---------------------------------------------------------------------
-- 3. Take the internal functions off the REST API
-- ---------------------------------------------------------------------
-- Postgres checks EXECUTE on a trigger function when the trigger is
-- created, not each time it fires, so revoking here is safe.
revoke execute on function public.check_slot_capacity()      from public, anon, authenticated;
revoke execute on function public.set_booking_defaults()     from public, anon, authenticated;
revoke execute on function public.on_booking_status_change() from public, anon, authenticated;
revoke execute on function public.guard_profile_role()       from public, anon, authenticated;

-- is_admin() is evaluated inside the RLS policies as the calling user, so
-- signed-in users must keep EXECUTE. Signed-out ones never reach a policy
-- that uses it.
revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated;

-- The slot search is for signed-in users only.
revoke execute on function public.find_available_slots(date) from public, anon;
grant  execute on function public.find_available_slots(date) to authenticated;

-- =====================================================================
-- Not covered here (it is not a database setting): turn on
-- **leaked password protection** in the Supabase Dashboard under
-- Authentication → Sign In / Providers → Password. It checks new
-- passwords against HaveIBeenPwned so people cannot reuse a password
-- that has already appeared in a breach.
-- =====================================================================
