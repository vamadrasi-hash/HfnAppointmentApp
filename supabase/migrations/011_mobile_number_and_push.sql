-- =====================================================================
-- 010 — A mobile number to answer on, and pop-up notifications.
--
-- Four things change here.
--
-- 1. **A mobile number is part of registering.** A preceptor answering a
--    request — especially one for a time they never published — settles
--    it with a call, so the number has to be there. New profiles must
--    carry one; profiles made before this can carry on without, but
--    cannot have theirs emptied.
--
-- 2. **The preceptor's notification carries that number**, so the answer
--    is one tap away from the alert itself.
--
-- 3. **Notifications go out over realtime**, which is what lets the app
--    raise a pop-up the moment one is written instead of a minute later.
--
-- 4. **Web Push subscriptions.** One row per device that agreed to be
--    told with the app closed. Filled in by the app, read by the
--    `send-push` edge function (see supabase/functions/send-push). Until
--    that function is deployed the table simply sits empty and pop-ups
--    happen while the app is open.
--
-- Run this ONCE in the Supabase SQL Editor, after 010.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. A mobile number is part of registering
-- ---------------------------------------------------------------------
create or replace function require_profile_phone()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  digits text := regexp_replace(coalesce(new.phone, ''), '\D', '', 'g');
begin
  -- Keep it tidy on the way in: blank is the same as absent.
  new.phone := nullif(btrim(coalesce(new.phone, '')), '');

  if tg_op = 'INSERT' then
    if length(digits) < 10 then
      raise exception 'A mobile number of at least 10 digits is needed to register.'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- An account that predates this rule is left alone unless someone
  -- touches the number, and then it has to be a real one.
  if new.phone is distinct from old.phone then
    if old.phone is not null and new.phone is null then
      raise exception 'Your mobile number cannot be removed — preceptors are shown it to reach you.'
        using errcode = 'check_violation';
    end if;
    if new.phone is not null and length(digits) < 10 then
      raise exception 'A mobile number needs at least 10 digits.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_require_profile_phone on profiles;
create trigger trg_require_profile_phone
  before insert or update on profiles
  for each row execute function require_profile_phone();

revoke execute on function public.require_profile_phone() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. The request notification carries the abhyasi's mobile
--
-- Otherwise the preceptor reads "someone requested a sitting", opens the
-- app, and only then finds out how to reach them.
-- ---------------------------------------------------------------------
create or replace function notify_on_booking()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  abhy_name   text;
  abhy_phone  text;
  precep_name text;
  start_at    time;
  when_ts     timestamp;
  when_text   text;
  party_text  text := '';
  is_open     boolean := (new.slot_id is null);
  party       int := 1 + coalesce(new.accompanying_count, 0);
begin
  select full_name, phone into abhy_name, abhy_phone
  from profiles where id = new.abhyasi_id;
  select full_name into precep_name from profiles where id = new.preceptor_id;

  if new.slot_id is not null then
    select start_time into start_at from availability_slots where id = new.slot_id;
  else
    start_at := new.requested_start_time;
  end if;

  when_ts   := new.booking_date + coalesce(start_at, time '00:00');
  when_text := to_char(when_ts, 'Dy DD Mon')
               || case when start_at is null then '' else to_char(when_ts, ', HH12:MI AM') end;

  -- Someone coming alone is the ordinary case and needs no remark.
  if party > 1 then
    party_text := ' · ' || party || ' people';
  end if;

  if tg_op = 'INSERT' then
    insert into notifications (profile_id, booking_id, kind, title, body)
    values (
      new.preceptor_id,
      new.id,
      case when is_open then 'open_request' else 'request' end,
      coalesce(abhy_name, 'Someone') || ' requested a sitting',
      -- Their mobile rides along, so answering is one tap from the alert.
      when_text
        || party_text
        || case when is_open then ' · outside your schedule' else '' end
        || case when abhy_phone is null then '' else ' · ' || abhy_phone end
    );

    -- Auto-confirm means the abhyasi never waits, so tell them at once.
    if new.status = 'confirmed' then
      insert into notifications (profile_id, booking_id, kind, title, body)
      values (new.abhyasi_id, new.id, 'confirmed',
              'Your sitting is confirmed',
              when_text || party_text || ' · with ' || coalesce(precep_name, 'your preceptor'));
    end if;

    return new;
  end if;

  -- An update: only a change of status is worth an interruption.
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'confirmed' then
    insert into notifications (profile_id, booking_id, kind, title, body)
    values (new.abhyasi_id, new.id, 'confirmed',
            'Your sitting is confirmed',
            when_text || party_text || ' · with ' || coalesce(precep_name, 'your preceptor')
            -- Fewer than were asked for: say so here rather than let them
            -- find out at the door.
            || case
                 when new.requested_accompanying_count is not null
                  and new.requested_accompanying_count > coalesce(new.accompanying_count, 0)
                 then ' · ' || party || ' of the '
                      || (1 + new.requested_accompanying_count) || ' you asked for'
                 else '' end);

  elsif new.status = 'declined' then
    insert into notifications (profile_id, booking_id, kind, title, body)
    values (new.abhyasi_id, new.id, 'declined',
            'Your request was declined',
            coalesce(new.decline_reason, when_text));

  elsif new.status = 'alternate_proposed' then
    insert into notifications (profile_id, booking_id, kind, title, body)
    values (new.abhyasi_id, new.id, 'alternate_proposed',
            coalesce(precep_name, 'Your preceptor') || ' proposed another time',
            to_char(new.alternate_date + coalesce(new.alternate_start_time, time '00:00'),
                    'Dy DD Mon, HH12:MI AM'));

  elsif new.status = 'cancelled' then
    -- Tell whoever did not do the cancelling.
    if new.decided_by is not null and new.decided_by = new.abhyasi_id then
      insert into notifications (profile_id, booking_id, kind, title, body)
      values (new.preceptor_id, new.id, 'cancelled',
              coalesce(abhy_name, 'An abhyasi') || ' cancelled a sitting',
              when_text
              || case when new.cancel_reason is null then ''
                      else E'\n' || new.cancel_reason end);
    else
      insert into notifications (profile_id, booking_id, kind, title, body)
      values (new.abhyasi_id, new.id, 'cancelled',
              'Your sitting was cancelled',
              'आपकी सिटिंग रद्द कर दी गई है' || E'\n' || when_text
              -- Exactly what the preceptor wrote, in both languages.
              || case when new.cancel_reason is null then ''
                      else E'\n' || new.cancel_reason end
              || case when new.cancel_reason_hi is null then ''
                      else E'\n' || new.cancel_reason_hi end);
    end if;
  end if;

  return new;
end;
$fn$;

revoke execute on function public.notify_on_booking() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Notifications over realtime
--
-- Row level security still applies, so a subscriber only ever receives
-- their own rows. `replica identity full` is what lets the filter on
-- `profile_id` be applied to the change itself.
-- ---------------------------------------------------------------------
alter table notifications replica identity full;

do $$
begin
  alter publication supabase_realtime add table notifications;
exception
  when duplicate_object then null;   -- already published
  when undefined_object then null;   -- no realtime publication on this project
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Web Push subscriptions — one row per device that said yes
--
-- The endpoint is the device, so it is the key: signing in on the same
-- browser twice must not leave two of them. Nothing here is readable by
-- anyone but its owner (and the edge function, which uses the service
-- role and so bypasses these rules).
-- ---------------------------------------------------------------------
create table if not exists push_subscriptions (
  endpoint    text primary key,
  profile_id  uuid not null references profiles(id) on delete cascade,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists idx_push_subscriptions_profile
  on push_subscriptions (profile_id);

alter table push_subscriptions enable row level security;

drop policy if exists "own push subscriptions" on push_subscriptions;
create policy "own push subscriptions" on push_subscriptions
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
