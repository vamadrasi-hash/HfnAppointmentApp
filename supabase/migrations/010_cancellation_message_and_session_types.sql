-- =====================================================================
-- 010 — What kind of sitting, how many are coming, and a cancellation
--       that says why in the preceptor's own words.
--
-- Three things change here.
--
-- 1. **Type of session.** A small master table, `session_types`, behind
--    the dropdown a seeker picks from when they request a sitting. It
--    starts with two rows — "Regular individual sitting" and
--    "Introductory sitting" — and administrators may add more.
--
-- 2. **People accompanying.** `bookings.accompanying_count` is how many
--    come *with* the seeker, so a booking now takes 1 + that many places
--    in a slot rather than always one. A seeker may still ask for more
--    than the slot holds: that is a request the preceptor answers, so the
--    guard lets it through (and auto-confirm deliberately steps aside),
--    and `requested_accompanying_count` remembers what was asked for even
--    if the preceptor approves fewer.
--
-- 3. **A cancellation in the preceptor's own words.** `cancel_reason`
--    already existed; `cancel_reason_hi` carries the same message in
--    Hindi, and the notification the seeker gets now shows both, exactly
--    as they were written.
--
-- Run this ONCE in the Supabase SQL Editor, after 009.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TYPE OF SESSION — master data
-- ---------------------------------------------------------------------
create table if not exists session_types (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,                   -- e.g. 'Introductory sitting'
  -- The same name in Hindi, for the messages that go out in both.
  name_hi     text,
  description text,
  sort_order  int not null default 0,
  -- Uncheck rather than delete, so past bookings keep their type.
  is_active   boolean not null default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Two types cannot share a name (case-insensitively).
create unique index if not exists uniq_session_type_name
  on session_types (lower(name));

insert into session_types (name, name_hi, description, sort_order)
values
  ('Regular individual sitting', 'नियमित व्यक्तिगत सिटिंग',
   'The usual individual sitting for someone already practising.', 1),
  ('Introductory sitting', 'परिचयात्मक सिटिंग',
   'The first sittings for someone new to Heartfulness.', 2)
on conflict do nothing;

alter table session_types enable row level security;

drop policy if exists "master read session types"  on session_types;
drop policy if exists "admin write session types"  on session_types;

create policy "master read session types" on session_types
  for select to authenticated using (true);

create policy "admin write session types" on session_types
  for all to authenticated using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------
-- 2. A booking says what kind of sitting, and how many are coming
-- ---------------------------------------------------------------------
alter table bookings
  add column if not exists session_type_id uuid references session_types(id) on delete set null,
  -- How many people come *with* the seeker. The seeker themselves is
  -- always one more, so a booking takes 1 + this many places.
  add column if not exists accompanying_count int not null default 0,
  -- What was asked for, kept even when the preceptor approves fewer.
  add column if not exists requested_accompanying_count int,
  -- The cancellation message in Hindi, alongside `cancel_reason`.
  add column if not exists cancel_reason_hi text;

alter table bookings drop constraint if exists chk_accompanying_count;
alter table bookings add constraint chk_accompanying_count
  check (accompanying_count >= 0 and accompanying_count <= 50);

create index if not exists idx_bookings_session_type on bookings(session_type_id);

comment on column bookings.accompanying_count is
  'How many people come with the seeker. The booking takes 1 + this many places.';
comment on column bookings.requested_accompanying_count is
  'What the seeker asked for, even when the preceptor approved fewer.';
comment on column bookings.cancel_reason_hi is
  'The cancellation message in Hindi, as the preceptor wrote it.';

-- ---------------------------------------------------------------------
-- 3. Counting places rather than bookings
--
-- Every screen that asks "how full is this slot" now has to add up the
-- people, not the rows. One function answers that, so the capacity guard
-- and both search RPCs cannot drift apart.
-- ---------------------------------------------------------------------
create or replace function slot_seats_taken(
  p_slot    uuid,
  p_date    date,
  p_exclude uuid default null
)
returns int
language sql
security definer
stable
set search_path = public, pg_temp
as $fn$
  select coalesce(sum(1 + coalesce(b.accompanying_count, 0)), 0)::int
  from bookings b
  where b.slot_id = p_slot
    and b.booking_date = p_date
    and b.status not in ('cancelled', 'declined', 'expired', 'no_show')
    and (p_exclude is null or b.id <> p_exclude);
$fn$;

-- Nothing private here: the same number is already in every search
-- result as "N of M left".
grant  execute on function public.slot_seats_taken(uuid, date, uuid) to authenticated;
revoke execute on function public.slot_seats_taken(uuid, date, uuid) from public, anon;

-- ---- The capacity guard ---------------------------------------------
-- A slot that still has a free place accepts the request, however large
-- the party: whether five may come to a sitting for four is the
-- preceptor's decision, not the database's. A slot with no free place at
-- all is full, exactly as before.
create or replace function check_slot_capacity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  slot_capacity int;
  taken int;
begin
  if new.slot_id is null then
    return new;  -- nothing published, nothing to fill up
  end if;

  if new.status in ('cancelled', 'declined', 'expired', 'no_show') then
    return new;
  end if;

  select capacity into slot_capacity
  from availability_slots where id = new.slot_id;

  taken := slot_seats_taken(new.slot_id, new.booking_date, new.id);

  if taken >= slot_capacity then
    raise exception 'This slot is already full for the selected date.';
  end if;

  return new;
end;
$fn$;

revoke execute on function public.check_slot_capacity() from public, anon, authenticated;

-- ---- Booking defaults ------------------------------------------------
-- Two additions: every booking gets a session type (the first active one
-- if the screen sent none), and a party that does not fit in what is left
-- is never auto-confirmed — a preceptor has to look at it.
create or replace function set_booking_defaults()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  slot_preceptor uuid;
  precep_auto    boolean;
  precep_open    boolean;
  precep_status  preceptor_status;
  slot_capacity  int;
  seats_free     int;
  party          int;
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

  -- What kind of sitting. The screen asks, but a booking made any other
  -- way still ends up with one.
  if new.session_type_id is null then
    select id into new.session_type_id
    from session_types
    where is_active
    order by sort_order, name
    limit 1;
  end if;

  -- What was asked for is what arrived; only the preceptor changes it later.
  new.requested_accompanying_count := coalesce(new.accompanying_count, 0);

  -- Approval, kept from 008 and covering both kinds of request.
  select preceptor_status into precep_status from profiles where id = new.preceptor_id;
  if precep_status is distinct from 'approved' then
    raise exception 'This preceptor is not approved to give sittings yet.';
  end if;

  -- Auto-confirm is a promise about times the preceptor published, so it
  -- applies to slot bookings only — and never to a party larger than the
  -- places left, which is a question only the preceptor can answer.
  if new.status = 'requested' and new.slot_id is not null then
    select auto_confirm into precep_auto from profiles where id = new.preceptor_id;
    if coalesce(precep_auto, false) then
      select capacity into slot_capacity from availability_slots where id = new.slot_id;
      seats_free := slot_capacity - slot_seats_taken(new.slot_id, new.booking_date, new.id);
      party := 1 + coalesce(new.accompanying_count, 0);
      if party <= seats_free then
        new.status := 'confirmed';
        new.confirmed_at := now();
      end if;
    end if;
  end if;

  return new;
end;
$fn$;

revoke execute on function public.set_booking_defaults() from public, anon, authenticated;

-- ---- Who may change how many people are coming -----------------------
-- The preceptor answers "may five come to a sitting for four", so only
-- they (or an admin, or a scheduled job) may move that number afterwards.
-- What the seeker originally asked for never changes at all.
create or replace function guard_booking_party_size()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.accompanying_count is distinct from old.accompanying_count
     and not (auth.uid() is null or auth.uid() = old.preceptor_id or is_admin()) then
    raise exception 'Only the preceptor can change how many people are coming.';
  end if;

  new.requested_accompanying_count := old.requested_accompanying_count;
  return new;
end;
$fn$;

drop trigger if exists trg_booking_party_size on bookings;
create trigger trg_booking_party_size
  before update on bookings
  for each row execute function guard_booking_party_size();

revoke execute on function public.guard_booking_party_size() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Notifications — the cancellation says why, in both languages
--
-- The seeker is told exactly what the preceptor wrote, in English and in
-- Hindi, unchanged. The same message is what the preceptor sends on
-- WhatsApp from the app, so the two never say different things.
-- ---------------------------------------------------------------------
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
  party_text  text := '';
  is_open     boolean := (new.slot_id is null);
  party       int := 1 + coalesce(new.accompanying_count, 0);
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
      when_text || party_text || case when is_open then ' · outside your schedule' else '' end
    );

    -- Auto-confirm means the abhyasi never waits, so tell them at once.
    if new.status = 'confirmed' then
      insert into notifications (profile_id, booking_id, kind, title, body)
      values (
        new.abhyasi_id, new.id, 'confirmed',
        'Your sitting is confirmed',
        when_text || party_text || ' · with ' || coalesce(precep_name, 'your preceptor')
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

drop trigger if exists trg_notify_on_booking on bookings;
create trigger trg_notify_on_booking
  after insert or update of status on bookings
  for each row execute function notify_on_booking();

revoke execute on function public.notify_on_booking() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Search counts places, not bookings
--
-- "2 of 4 left" has to mean two more people, not two more bookings, now
-- that one booking can bring a family.
-- ---------------------------------------------------------------------
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
    coalesce(b.seats, 0) as booked_count,
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
  from availability_slots s
  join profiles p on p.id = s.preceptor_id and p.preceptor_status = 'approved'
  left join centers c on c.id = s.center_id
  left join heartspots h on h.id = s.heartspot_id
  left join home_places hp on hp.profile_id = s.preceptor_id
  left join lateral (
    select coalesce(sum(1 + coalesce(bk.accompanying_count, 0)), 0) as seats
    from bookings bk
    where bk.slot_id = s.id
      and bk.booking_date = target_date
      and bk.status not in ('cancelled', 'declined', 'expired', 'no_show')
  ) b on true
  where s.is_active = true
    and s.day_of_week = extract(dow from target_date)::int
  order by s.start_time;
$fn$;

grant  execute on function public.find_available_slots(date) to authenticated;
revoke execute on function public.find_available_slots(date) from public, anon;

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
    coalesce(b.seats, 0) as booked_count,
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
  join profiles p on p.id = s.preceptor_id and p.preceptor_status = 'approved'
  left join centers c on c.id = s.center_id
  left join heartspots h on h.id = s.heartspot_id
  left join home_places hp on hp.profile_id = s.preceptor_id
  left join lateral (
    select coalesce(sum(1 + coalesce(bk.accompanying_count, 0)), 0) as seats
    from bookings bk
    where bk.slot_id = s.id
      and bk.booking_date = span.on_date
      and bk.status not in ('cancelled', 'declined', 'expired', 'no_show')
  ) b on true
  order by span.on_date, s.start_time;
$fn$;

grant  execute on function public.find_available_slots_range(date, int) to authenticated;
revoke execute on function public.find_available_slots_range(date, int) from public, anon;
