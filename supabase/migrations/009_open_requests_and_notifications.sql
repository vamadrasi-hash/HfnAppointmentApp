-- =====================================================================
-- 009 — Asking outside the schedule, being told about it, and looking
--       further ahead than one day.
--
-- Three things change here.
--
-- 1. **A preceptor can accept requests outside their schedule.**
--    `profiles.accepts_open_requests` is that choice. When it is on, an
--    abhyasi may ask for a time the preceptor never published, so a
--    booking no longer has to point at a slot: `bookings.slot_id` becomes
--    nullable and the asked-for time is carried on the booking itself.
--    Auto-confirm deliberately does NOT apply to these — a time nobody
--    published is always the preceptor's to accept by hand. Approval (008)
--    comes first either way: an unapproved preceptor is neither listed nor
--    askable.
--
-- 2. **Notifications.** A small per-person inbox, written by triggers on
--    `bookings`: the preceptor hears about every request, the abhyasi
--    hears about every decision on theirs.
--
-- 3. **Looking ahead.** `find_available_slots_range` is
--    `find_available_slots` over a span of dates instead of one, which is
--    what "next available time" and "who is free near here at all" need.
--
-- Run this ONCE in the Supabase SQL Editor, after 008.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The preceptor's choice
-- ---------------------------------------------------------------------
alter table profiles
  add column if not exists accepts_open_requests boolean not null default false;

comment on column profiles.accepts_open_requests is
  'Preceptor opted in to being asked for times outside their published schedule.';

-- ---------------------------------------------------------------------
-- 2. A booking need not point at a slot
-- ---------------------------------------------------------------------
alter table bookings alter column slot_id drop not null;

alter table bookings
  add column if not exists requested_start_time time,
  add column if not exists requested_end_time   time;

comment on column bookings.requested_start_time is
  'Only for a booking with no slot: the time the abhyasi asked for.';

-- Either it belongs to a slot, or it names a preceptor and a time.
alter table bookings drop constraint if exists chk_booking_target;
alter table bookings add constraint chk_booking_target check (
  slot_id is not null
  or (preceptor_id is not null and requested_start_time is not null)
);

-- The same "one live place per person" rule as `uniq_live_booking`, for
-- the bookings that have no slot to hang it off.
create unique index if not exists uniq_live_open_request
  on bookings (preceptor_id, booking_date, requested_start_time, abhyasi_id)
  where slot_id is null
    and status not in ('cancelled', 'declined', 'expired', 'no_show');

-- ---- Defaults: stamp the preceptor, or vet an out-of-schedule ask ----
-- (Security invoker, as before: everything it reads — the slot's owner,
-- the preceptor's two preferences — is readable by any signed-in user.)
create or replace function set_booking_defaults()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  slot_preceptor uuid;
  precep_auto    boolean;
  precep_open    boolean;
  precep_status  preceptor_status;
begin
  if new.slot_id is not null then
    select preceptor_id into slot_preceptor from availability_slots where id = new.slot_id;
    if slot_preceptor is null then
      raise exception 'That time slot no longer exists.';
    end if;
    new.preceptor_id := slot_preceptor;
    -- The slot already says when it is; these two are for the other kind.
    new.requested_start_time := null;
    new.requested_end_time := null;
  else
    -- An out-of-schedule request. The preceptor has to have opted in, and
    -- the abhyasi has to say when.
    if new.preceptor_id is null then
      raise exception 'Say which preceptor this request is for.';
    end if;
    select accepts_open_requests into precep_open
    from profiles where id = new.preceptor_id;
    if not coalesce(precep_open, false) then
      raise exception 'This preceptor only accepts sittings from their published schedule.';
    end if;
    if new.requested_start_time is null then
      raise exception 'Say what time you are asking for.';
    end if;
    if new.requested_end_time is null then
      new.requested_end_time := new.requested_start_time + interval '30 minutes';
    end if;
  end if;

  if new.requested_at is null then new.requested_at := now(); end if;

  -- Approval, kept from 008 and now covering both kinds. Search already
  -- hides an unapproved preceptor and they cannot publish a slot; this
  -- catches a slot published before an approval was withdrawn, and any
  -- request asked of them directly.
  select preceptor_status into precep_status from profiles where id = new.preceptor_id;
  if precep_status is distinct from 'approved' then
    raise exception 'This preceptor is not approved to give sittings yet.';
  end if;

  -- Auto-confirm is a promise about times the preceptor published, so it
  -- applies to slot bookings only.
  if new.status = 'requested' and new.slot_id is not null then
    select auto_confirm into precep_auto from profiles where id = new.preceptor_id;
    if coalesce(precep_auto, false) then
      new.status := 'confirmed';
      new.confirmed_at := now();
    end if;
  end if;

  return new;
end;
$fn$;

revoke execute on function public.set_booking_defaults() from public, anon, authenticated;

-- ---- Capacity only means something for a slot ------------------------
create or replace function check_slot_capacity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  slot_capacity int;
  live_count int;
begin
  if new.slot_id is null then
    return new;  -- nothing published, nothing to fill up
  end if;

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
$fn$;

revoke execute on function public.check_slot_capacity() from public, anon, authenticated;

-- ---- The two policies that found the preceptor through the slot ------
-- With no slot to join through, they have to read `preceptor_id`.
drop policy if exists "bookings readable to involved" on bookings;
create policy "bookings readable to involved" on bookings
  for select to authenticated using (
    abhyasi_id = auth.uid()
    or preceptor_id = auth.uid()
    or is_admin()
    or exists (
      select 1 from availability_slots s
      where s.id = bookings.slot_id and s.preceptor_id = auth.uid()
    )
  );

drop policy if exists "update involved booking" on bookings;
create policy "update involved booking" on bookings
  for update to authenticated using (
    abhyasi_id = auth.uid()
    or preceptor_id = auth.uid()
    or is_admin()
    or exists (
      select 1 from availability_slots s
      where s.id = bookings.slot_id and s.preceptor_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- 3. Notifications
--
-- One row per thing a person should hear about. Written only by the
-- trigger below (which runs as the table's owner and so passes RLS);
-- nobody gets an insert policy, so no one can post to anyone's inbox.
-- ---------------------------------------------------------------------
create table if not exists notifications (
  id          uuid primary key default uuid_generate_v4(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  booking_id  uuid references bookings(id) on delete cascade,
  -- 'request' | 'open_request' | 'confirmed' | 'declined'
  -- | 'alternate_proposed' | 'cancelled'
  kind        text not null,
  title       text not null,
  body        text,
  read_at     timestamptz,
  created_at  timestamptz default now()
);

create index if not exists idx_notifications_profile
  on notifications (profile_id, created_at desc);
create index if not exists idx_notifications_unread
  on notifications (profile_id) where read_at is null;

alter table notifications enable row level security;

drop policy if exists "own notifications readable"  on notifications;
drop policy if exists "own notifications updatable" on notifications;
drop policy if exists "own notifications deletable" on notifications;

create policy "own notifications readable" on notifications
  for select to authenticated using (profile_id = auth.uid());

-- Marking one read is the only edit a person makes to their own inbox.
create policy "own notifications updatable" on notifications
  for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "own notifications deletable" on notifications
  for delete to authenticated using (profile_id = auth.uid());

-- ---- Who hears what --------------------------------------------------
create or replace function notify_on_booking()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  abhy_name   text;
  precep_name text;
  start_at    time;
  when_ts     timestamp;
  when_text   text;
  is_open     boolean := (new.slot_id is null);
begin
  select full_name into abhy_name   from profiles where id = new.abhyasi_id;
  select full_name into precep_name from profiles where id = new.preceptor_id;

  if new.slot_id is not null then
    select start_time into start_at from availability_slots where id = new.slot_id;
  else
    start_at := new.requested_start_time;
  end if;

  when_ts   := new.booking_date + coalesce(start_at, time '00:00');
  when_text := to_char(when_ts, 'Dy DD Mon')
               || case when start_at is null then '' else to_char(when_ts, ', HH12:MI AM') end;

  if tg_op = 'INSERT' then
    insert into notifications (profile_id, booking_id, kind, title, body)
    values (
      new.preceptor_id,
      new.id,
      case when is_open then 'open_request' else 'request' end,
      coalesce(abhy_name, 'Someone') || ' requested a sitting',
      when_text || case when is_open then ' · outside your schedule' else '' end
    );

    -- Auto-confirm means the abhyasi never waits, so tell them at once.
    if new.status = 'confirmed' then
      insert into notifications (profile_id, booking_id, kind, title, body)
      values (
        new.abhyasi_id, new.id, 'confirmed',
        'Your sitting is confirmed',
        when_text || ' · with ' || coalesce(precep_name, 'your preceptor')
      );
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
            when_text || ' · with ' || coalesce(precep_name, 'your preceptor'));

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
              when_text);
    else
      insert into notifications (profile_id, booking_id, kind, title, body)
      values (new.abhyasi_id, new.id, 'cancelled',
              'Your sitting was cancelled',
              coalesce(new.cancel_reason, when_text));
    end if;
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_notify_on_booking on bookings;
create trigger trg_notify_on_booking
  after insert or update of status on bookings
  for each row execute function notify_on_booking();

revoke execute on function public.notify_on_booking() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Looking ahead: the same search, over a span of dates
--
-- `find_available_slots` answers "who is free on this one day". Finding
-- the *next* free time, or everyone free anywhere near here, means asking
-- the same question of the next fortnight — one round trip, not fourteen.
-- ---------------------------------------------------------------------
create or replace function find_available_slots_range(start_date date, days int default 14)
returns table (
  slot_date          date,
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
  -- Same care as the single-day search: a home sitting gives up no
  -- address, no link, and a coordinate rounded to about a kilometre.
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
  with span as (
    select d::date as on_date
    from generate_series(
      start_date,
      start_date + (least(greatest(coalesce(days, 14), 1), 60) - 1),
      interval '1 day'
    ) d
  )
  select
    span.on_date,
    s.id, p.id, p.full_name, p.phone, p.area_id,
    c.id, c.name, c.city, c.zone_id, c.latitude, c.longitude,
    s.day_of_week, s.start_time, s.end_time, s.capacity, s.note,
    coalesce(b.cnt, 0) as booked_count,
    s.place_type::text,
    h.id, h.name,
    case when s.place_type = 'home' then null
         else coalesce(h.address, c.address) end,
    case when s.place_type = 'home'
           then round(hp.latitude::numeric, 2)::double precision
         else coalesce(h.latitude, c.latitude) end,
    case when s.place_type = 'home'
           then round(hp.longitude::numeric, 2)::double precision
         else coalesce(h.longitude, c.longitude) end,
    case when s.place_type = 'home' then null
         else coalesce(h.map_url, c.map_url) end
  from span
  join availability_slots s
    on s.is_active = true
   and s.day_of_week = extract(dow from span.on_date)::int
  -- Only approved preceptors are findable, exactly as in the single-day
  -- search. (An admin's status is stamped 'approved' when their role is.)
  join profiles p on p.id = s.preceptor_id and p.preceptor_status = 'approved'
  left join centers c on c.id = s.center_id
  left join heartspots h on h.id = s.heartspot_id
  left join home_places hp on hp.profile_id = s.preceptor_id
  left join lateral (
    select count(*) as cnt
    from bookings bk
    where bk.slot_id = s.id
      and bk.booking_date = span.on_date
      and bk.status not in ('cancelled', 'declined', 'expired', 'no_show')
  ) b on true
  order by span.on_date, s.start_time;
$fn$;

grant  execute on function public.find_available_slots_range(date, int) to authenticated;
revoke execute on function public.find_available_slots_range(date, int) from public, anon;

-- ---------------------------------------------------------------------
-- 5. Preceptors who can be asked for a time they never published
--
-- They have no slot to be found through, so search would never see them.
-- Their center is public master data; their home is not, so it comes back
-- rounded to about a kilometre — only ever enough to sort by distance.
-- ---------------------------------------------------------------------
create or replace function find_open_request_preceptors()
returns table (
  preceptor_id    uuid,
  preceptor_name  text,
  preceptor_phone text,
  center_id       uuid,
  center_name     text,
  center_city     text,
  center_zone_id  uuid,
  center_lat      double precision,
  center_lng      double precision,
  home_lat        double precision,
  home_lng        double precision
)
language sql
security definer
stable
set search_path = public, pg_temp
as $fn$
  select
    p.id, p.full_name, p.phone,
    c.id, c.name, c.city, c.zone_id, c.latitude, c.longitude,
    round(hp.latitude::numeric, 2)::double precision,
    round(hp.longitude::numeric, 2)::double precision
  from profiles p
  left join centers c on c.id = p.center_id
  left join home_places hp on hp.profile_id = p.id
  where p.role in ('preceptor', 'admin')
    and p.preceptor_status = 'approved'
    and coalesce(p.accepts_open_requests, false) = true;
$fn$;

grant  execute on function public.find_open_request_preceptors() to authenticated;
revoke execute on function public.find_open_request_preceptors() from public, anon;
