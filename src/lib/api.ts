import { supabase } from './supabase'
import type {
  Zone,
  Center,
  Heartspot,
  Profile,
  AppNotification,
  AreaGroup,
  PreceptorStatus,
  AvailabilitySlot,
  AvailableSlot,
  CenterGroup,
  PreceptorWithSlots,
  BookingDetail,
  PlaceDetails,
  ResolvedPlace,
  SessionType,
  SittingPlaceType,
} from './types'
import { distanceKm } from './utils'
import { HOME_PLACE_NAME, MY_HOME_PLACE_NAME, resolvePlace } from './place'
import { NO_CITY_GROUP, centerFullLabel, centerGroup } from './centers'

// ------------------------------------------------------------------
// MASTER DATA
// ------------------------------------------------------------------
export async function getZones(): Promise<Zone[]> {
  const { data, error } = await supabase
    .from('zones')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}

// Called with no zone this returns every center; the app caches the whole
// list once (see lib/masterData.ts) and filters it in memory.
export async function getCenters(zoneId?: string): Promise<Center[]> {
  let q = supabase.from('centers').select('*').order('name', { ascending: true })
  if (zoneId) q = q.eq('zone_id', zoneId)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

// Every center's heartspots, cached alongside the centers themselves.
export async function getHeartspots(centerId?: string): Promise<Heartspot[]> {
  let q = supabase.from('heartspots').select('*').order('name', { ascending: true })
  if (centerId) q = q.eq('center_id', centerId)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

/**
 * What kind of sitting can be asked for. Inactive types stay in the list
 * so a past booking still names its own type; the booking screens filter
 * them out themselves.
 */
export async function getSessionTypes(): Promise<SessionType[]> {
  const { data, error } = await supabase
    .from('session_types')
    .select('id, name, name_hi, description, sort_order, is_active')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as SessionType[]
}

// ---- Master data editing (admins only; RLS enforces that) ------------
export type CenterInput = Omit<Center, 'id'>
export type HeartspotInput = Omit<Heartspot, 'id'>
export type SessionTypeInput = Omit<SessionType, 'id'>

export async function createCenter(input: CenterInput): Promise<Center> {
  const { data, error } = await supabase.from('centers').insert(input).select('*').single()
  if (error) throw error
  return data
}

export async function updateCenter(id: string, patch: Partial<CenterInput>): Promise<Center> {
  const { data, error } = await supabase
    .from('centers')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteCenter(id: string): Promise<void> {
  const { error } = await supabase.from('centers').delete().eq('id', id)
  if (error) throw error
}

export async function createHeartspot(input: HeartspotInput): Promise<Heartspot> {
  const { data, error } = await supabase.from('heartspots').insert(input).select('*').single()
  if (error) throw error
  return data
}

export async function updateHeartspot(
  id: string,
  patch: Partial<HeartspotInput>,
): Promise<Heartspot> {
  const { data, error } = await supabase
    .from('heartspots')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteHeartspot(id: string): Promise<void> {
  const { error } = await supabase.from('heartspots').delete().eq('id', id)
  if (error) throw error
}

export async function createSessionType(input: SessionTypeInput): Promise<SessionType> {
  const { data, error } = await supabase.from('session_types').insert(input).select('*').single()
  if (error) throw error
  return data
}

export async function updateSessionType(
  id: string,
  patch: Partial<SessionTypeInput>,
): Promise<SessionType> {
  const { data, error } = await supabase
    .from('session_types')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteSessionType(id: string): Promise<void> {
  const { error } = await supabase.from('session_types').delete().eq('id', id)
  if (error) throw error
}


// ------------------------------------------------------------------
// PROFILE
// ------------------------------------------------------------------
const HOME_PLACE_EMBED = 'home_place:home_places ( address, latitude, longitude, map_url )'

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(`*, ${HOME_PLACE_EMBED}`)
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return { ...data, home_place: onePlace((data as any).home_place) }
}

export async function upsertProfile(p: Partial<Profile> & { id: string }): Promise<Profile> {
  // `home_place` is a table of its own — see saveHomePlace.
  const { home_place: _ignored, ...columns } = p
  const payload = { ...columns, updated_at: new Date().toISOString() }
  const { data, error } = await supabase
    .from('profiles')
    .upsert(payload, { onConflict: 'id' })
    .select(`*, ${HOME_PLACE_EMBED}`)
    .single()
  if (error) throw error
  return { ...data, home_place: onePlace((data as any).home_place) }
}

/**
 * Change a few columns and leave the rest alone.
 *
 * Not `upsertProfile`: an upsert is an insert that falls back to an update,
 * so Postgres builds the whole row first and a partial one trips
 * `full_name`'s not-null rule before it ever gets as far as the conflict.
 * Everything that edits an existing profile — a switch on the dashboard,
 * say — belongs here.
 */
export async function updateProfile(
  id: string,
  patch: Partial<Omit<Profile, 'id' | 'home_place'>>,
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(`*, ${HOME_PLACE_EMBED}`)
    .single()
  if (error) throw error
  return { ...data, home_place: onePlace((data as any).home_place) }
}

/**
 * Where this person lives. Kept out of `profiles` because that table is
 * readable by every signed-in user; this one is readable by the person
 * themselves, an admin, and an abhyasi whose sitting at that preceptor's
 * home is confirmed. Passing null clears it.
 */
export async function saveHomePlace(
  profileId: string,
  place: PlaceDetails | null,
): Promise<void> {
  const empty =
    !place ||
    (!place.address?.trim() && place.latitude == null && !place.map_url?.trim())

  if (empty) {
    const { error } = await supabase.from('home_places').delete().eq('profile_id', profileId)
    if (error) throw error
    return
  }

  const { error } = await supabase.from('home_places').upsert(
    {
      profile_id: profileId,
      address: place!.address?.trim() || null,
      latitude: place!.latitude,
      longitude: place!.longitude,
      map_url: place!.map_url,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'profile_id' },
  )
  if (error) throw error
}

// ------------------------------------------------------------------
// PRECEPTOR APPROVAL (admins only; RLS enforces that)
// ------------------------------------------------------------------

/**
 * Everyone who signed up as a preceptor, whatever the administrators have
 * decided so far. Those still waiting come first — that is the queue an
 * admin is here to clear.
 */
export async function getPreceptorApprovals(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'preceptor')
    .order('created_at', { ascending: true })
  if (error) throw error

  const rank: Record<string, number> = { pending: 0, approved: 1, rejected: 2 }
  return (data ?? []).sort(
    (a, b) => (rank[a.preceptor_status ?? 'pending'] ?? 3) - (rank[b.preceptor_status ?? 'pending'] ?? 3),
  )
}

/**
 * Approve, reject, or put a preceptor account back in the queue. Only an
 * admin gets past the database guard; `approved_by` and `approved_at` are
 * stamped there rather than here.
 */
export async function setPreceptorStatus(
  profileId: string,
  status: PreceptorStatus,
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ preceptor_status: status, updated_at: new Date().toISOString() })
    .eq('id', profileId)
    .select('*')
    .single()
  if (error) throw error
  return data
}

// ------------------------------------------------------------------
// AVAILABILITY SLOTS (preceptor side)
// ------------------------------------------------------------------
// A home sitting's address is the preceptor's own, so the caller hands it
// in rather than the query fetching the same row once per slot. On this
// screen the preceptor is the viewer, so they always have it.
export async function getMySlots(
  preceptorId: string,
  homePlace?: PlaceDetails | null,
): Promise<AvailabilitySlot[]> {
  const { data, error } = await supabase
    .from('availability_slots')
    .select('*')
    .eq('preceptor_id', preceptorId)
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true })
  if (error) throw error
  return (data ?? []).map((s: any) => ({
    ...s,
    place_details: s.place_type === 'home' ? (homePlace ?? null) : null,
  }))
}

// PostgREST returns a one-to-one embed as an object, but an unresolved
// relationship as an array — accept either.
function onePlace(embedded: any): PlaceDetails | null {
  const row = Array.isArray(embedded) ? (embedded[0] ?? null) : (embedded ?? null)
  if (!row) return null
  return {
    address: row.address ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    map_url: row.map_url ?? null,
  }
}

export async function createSlot(
  slot: Omit<AvailabilitySlot, 'id' | 'place_details'>,
): Promise<AvailabilitySlot> {
  const { data, error } = await supabase
    .from('availability_slots')
    .insert(slot)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateSlot(
  id: string,
  patch: Partial<AvailabilitySlot>,
): Promise<void> {
  const { error } = await supabase.from('availability_slots').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteSlot(id: string): Promise<void> {
  const { error } = await supabase.from('availability_slots').delete().eq('id', id)
  if (error) throw error
}

// ------------------------------------------------------------------
// FINDING SLOTS TO BOOK (abhyasi / preceptor as booker)
// ------------------------------------------------------------------
export interface SlotFilters {
  date: string // ISO yyyy-MM-dd — the day the seeker picked
  zoneId?: string
  centerId?: string
  fromTime?: string // 'HH:MM' inclusive
  toTime?: string // 'HH:MM' inclusive
  origin?: { lat: number; lng: number } | null // for "near me" sorting
  includeFull?: boolean
  /**
   * How far ahead to look for "the next available time" and for the
   * by-area list. The search reads one span of days in a single round
   * trip, so this costs nothing extra per day.
   */
  windowStart?: string
  windowDays?: number
}

interface RawSlotRow {
  /** The real date this weekly slot falls on. */
  slot_date: string
  slot_id: string
  preceptor_id: string
  preceptor_name: string
  preceptor_phone: string | null
  preceptor_area_id: string | null
  center_id: string | null
  center_name: string | null
  center_city: string | null
  center_zone_id: string | null
  center_lat: number | null
  center_lng: number | null
  day_of_week: number
  start_time: string
  end_time: string
  capacity: number
  note: string | null
  booked_count: number
  // where the sitting happens, already resolved by the RPC
  place_type: SittingPlaceType
  heartspot_id: string | null
  heartspot_name: string | null
  place_address: string | null
  place_lat: number | null
  place_lng: number | null
  place_map_url: string | null
}

// The RPC has already walked heartspot -> center, so this only has to name
// the place. A home sitting never arrives with its address here: search
// gets the area and a coordinate rounded to about a kilometre, which is
// only ever used to sort by distance.
function placeFromRow(r: RawSlotRow): ResolvedPlace {
  const isHome = r.place_type === 'home'
  return {
    type: r.place_type,
    name: isHome
      ? HOME_PLACE_NAME
      : (r.heartspot_name ?? r.center_name ?? 'Heartspot'),
    area: r.center_id ? centerFullLabel({ name: r.center_name ?? '', city: r.center_city }) : null,
    address: r.place_address,
    latitude: r.place_lat,
    longitude: r.place_lng,
    map_url: r.place_map_url,
    restricted: isHome,
  }
}

// A preceptor who takes requests outside their schedule. They hold no
// slot to be found through, so the search asks for them separately.
interface RawOpenPreceptorRow {
  preceptor_id: string
  preceptor_name: string
  preceptor_phone: string | null
  center_id: string | null
  center_name: string | null
  center_city: string | null
  center_zone_id: string | null
  center_lat: number | null
  center_lng: number | null
  // Rounded to about a kilometre by the RPC — enough to sort by, never
  // enough to point at a house.
  home_lat: number | null
  home_lng: number | null
}

function toAvailableSlot(r: RawSlotRow): AvailableSlot {
  return {
    id: r.slot_id,
    date: r.slot_date,
    preceptor_id: r.preceptor_id,
    center_id: r.center_id,
    day_of_week: r.day_of_week,
    start_time: r.start_time,
    end_time: r.end_time,
    capacity: r.capacity,
    is_active: true,
    note: r.note,
    place_type: r.place_type,
    place: placeFromRow(r),
    preceptor: { id: r.preceptor_id, full_name: r.preceptor_name, phone: r.preceptor_phone },
    center: r.center_id
      ? {
          id: r.center_id,
          name: r.center_name ?? '',
          city: r.center_city,
          latitude: r.center_lat,
          longitude: r.center_lng,
        }
      : null,
    booked_count: Number(r.booked_count),
    remaining: r.capacity - Number(r.booked_count),
  }
}

/**
 * Everything the "find a sitting" screen asks in one round trip:
 *
 *  - `onDate`  who is open on the day the seeker picked;
 *  - `next`    the soonest open time anywhere in the window, so a seeker
 *              who has picked no slot is still told when the next one is
 *              and whose it is;
 *  - `areas`   every available preceptor grouped by area and center — the
 *              answer to "nobody is near me".
 */
export interface AvailabilitySearch {
  onDate: PreceptorWithSlots[]
  next: AvailableSlot | null
  areas: AreaGroup[]
}

const DEAD_END = Number.POSITIVE_INFINITY

export async function searchAvailability(filters: SlotFilters): Promise<AvailabilitySearch> {
  const windowStart = filters.windowStart ?? filters.date
  const windowDays = filters.windowDays ?? 14

  const [slotRes, openRes] = await Promise.all([
    supabase.rpc('find_available_slots_range', {
      start_date: windowStart,
      days: windowDays,
    }),
    supabase.rpc('find_open_request_preceptors'),
  ])
  if (slotRes.error) throw slotRes.error
  if (openRes.error) throw openRes.error

  const rows = (slotRes.data ?? []) as RawSlotRow[]
  const openRows = (openRes.data ?? []) as RawOpenPreceptorRow[]

  // Zone and center narrow *who*, so they apply everywhere. Time of day
  // narrows *when*, so it only applies to the slots themselves.
  const inPlace = (r: { center_zone_id: string | null; center_id: string | null }) => {
    if (filters.zoneId && r.center_zone_id !== filters.zoneId) return false
    if (filters.centerId && r.center_id !== filters.centerId) return false
    return true
  }
  const inTimeBand = (r: RawSlotRow) => {
    const start = r.start_time.slice(0, 5)
    if (filters.fromTime && start < filters.fromTime) return false
    if (filters.toTime && start > filters.toTime) return false
    return true
  }

  const usable = rows.filter(
    (r) =>
      inPlace(r) &&
      inTimeBand(r) &&
      (filters.includeFull || r.capacity - Number(r.booked_count) > 0),
  )

  // Measure to where the sitting actually is, falling back to the center
  // when the place itself carries no coordinates. A home sitting's
  // coordinate is rounded to ~1 km, so it is reported as approximate
  // rather than quoted to one decimal place.
  const distanceOf = (lat: number | null, lng: number | null): number | null =>
    filters.origin && lat != null && lng != null
      ? distanceKm(filters.origin.lat, filters.origin.lng, lat, lng)
      : null

  const byPreceptor = new Map<string, PreceptorWithSlots>()
  const openIds = new Set(openRows.map((r) => r.preceptor_id))

  for (const r of usable) {
    let entry = byPreceptor.get(r.preceptor_id)
    if (!entry) {
      const distance = distanceOf(r.place_lat ?? r.center_lat, r.place_lng ?? r.center_lng)
      entry = {
        preceptor: { id: r.preceptor_id, full_name: r.preceptor_name, phone: r.preceptor_phone },
        center: r.center_id
          ? { id: r.center_id, name: r.center_name ?? '', city: r.center_city }
          : null,
        distanceKm: distance,
        distanceApprox: distance != null && r.place_type === 'home' && r.place_lat != null,
        slots: [],
        openToRequests: openIds.has(r.preceptor_id),
        nextAvailable: null,
      }
      byPreceptor.set(r.preceptor_id, entry)
    }

    const slot = toAvailableSlot(r)
    if (r.slot_date === filters.date) entry.slots.push(slot)

    // The rows come back ordered by date then time, so the first one seen
    // is the soonest.
    if (!entry.nextAvailable) entry.nextAvailable = slot
  }

  // Preceptors who publish nothing (or nothing left) but can still be
  // asked. Without this they would never appear in a search at all.
  for (const r of openRows) {
    if (byPreceptor.has(r.preceptor_id)) continue
    if (!inPlace(r)) continue
    const distance = distanceOf(r.home_lat ?? r.center_lat, r.home_lng ?? r.center_lng)
    byPreceptor.set(r.preceptor_id, {
      preceptor: { id: r.preceptor_id, full_name: r.preceptor_name, phone: r.preceptor_phone },
      center: r.center_id
        ? { id: r.center_id, name: r.center_name ?? '', city: r.center_city }
        : null,
      distanceKm: distance,
      distanceApprox: distance != null && r.home_lat != null,
      slots: [],
      openToRequests: true,
      nextAvailable: null,
    })
  }

  const everyone = Array.from(byPreceptor.values())
  everyone.forEach((p) => p.slots.sort((a, b) => a.start_time.localeCompare(b.start_time)))

  // Sort: by distance when "near me" is on, otherwise by name. Anyone we
  // cannot place goes last either way.
  const byDistanceThenName = (a: PreceptorWithSlots, b: PreceptorWithSlots) => {
    if (filters.origin) {
      const da = a.distanceKm ?? DEAD_END
      const db = b.distanceKm ?? DEAD_END
      if (da !== db) return da - db
    }
    return a.preceptor.full_name.localeCompare(b.preceptor.full_name)
  }

  const onDate = everyone
    .filter((p) => p.slots.length > 0 || p.openToRequests)
    .sort(byDistanceThenName)

  // The soonest open time anywhere, nearest first when two fall together.
  let next: AvailableSlot | null = null
  let nextOwner: PreceptorWithSlots | null = null
  for (const p of everyone) {
    const cand = p.nextAvailable
    if (!cand) continue
    if (!next) {
      next = cand
      nextOwner = p
      continue
    }
    const byWhen =
      cand.date.localeCompare(next.date) || cand.start_time.localeCompare(next.start_time)
    if (byWhen < 0) {
      next = cand
      nextOwner = p
    } else if (byWhen === 0 && (p.distanceKm ?? DEAD_END) < (nextOwner?.distanceKm ?? DEAD_END)) {
      next = cand
      nextOwner = p
    }
  }

  return { onDate, next, areas: groupByArea(everyone, byDistanceThenName) }
}

/**
 * Everyone who is free somewhere in the window, gathered under their area
 * (the center's city) and then their center. This is what a seeker sees
 * when nobody is available near them: the wider picture, still ordered so
 * the closest area comes first.
 */
function groupByArea(
  preceptors: PreceptorWithSlots[],
  compare: (a: PreceptorWithSlots, b: PreceptorWithSlots) => number,
): AreaGroup[] {
  const available = preceptors.filter((p) => p.nextAvailable || p.openToRequests)

  const areas = new Map<string, Map<string, CenterGroup>>()
  for (const p of available) {
    const area = p.center ? centerGroup(p.center) : NO_CITY_GROUP
    const centerId = p.center?.id ?? null
    const key = centerId ?? '—'
    if (!areas.has(area)) areas.set(area, new Map())
    const centers = areas.get(area)!
    if (!centers.has(key)) {
      centers.set(key, {
        centerId,
        centerName: p.center?.name ?? 'No center recorded',
        preceptors: [],
      })
    }
    centers.get(key)!.preceptors.push(p)
  }

  const best = (list: PreceptorWithSlots[]) =>
    list.reduce((m, p) => Math.min(m, p.distanceKm ?? DEAD_END), DEAD_END)

  return Array.from(areas.entries())
    .map(([area, centers]) => {
      const groups = Array.from(centers.values())
      groups.forEach((g) => g.preceptors.sort(compare))
      groups.sort(
        (a, b) =>
          best(a.preceptors) - best(b.preceptors) ||
          a.centerName.localeCompare(b.centerName, undefined, { sensitivity: 'base' }),
      )
      return {
        area,
        centers: groups,
        preceptorCount: groups.reduce((n, g) => n + g.preceptors.length, 0),
      }
    })
    .sort((a, b) => {
      // Centers with no city recorded collect at the bottom.
      if (a.area === NO_CITY_GROUP) return 1
      if (b.area === NO_CITY_GROUP) return -1
      const da = Math.min(...a.centers.map((c) => best(c.preceptors)))
      const db = Math.min(...b.centers.map((c) => best(c.preceptors)))
      if (da !== db) return da - db
      return a.area.localeCompare(b.area, undefined, { sensitivity: 'base' })
    })
}

// ------------------------------------------------------------------
// BOOKINGS — the request -> confirm state machine
// ------------------------------------------------------------------

// Abhyasi asks for a sitting. It starts as 'requested' unless the
// preceptor has auto_confirm on (the DB trigger handles that) — and a
// party larger than the places left is never auto-confirmed, because
// only the preceptor can say whether they may all come.
export async function requestSitting(input: {
  slotId: string
  abhyasiId: string
  date: string
  sessionTypeId?: string | null
  /** How many come with them; the seeker themselves is one more. */
  accompanying?: number
  note?: string
}): Promise<void> {
  const { error } = await supabase.from('bookings').insert({
    slot_id: input.slotId,
    abhyasi_id: input.abhyasiId,
    booking_date: input.date,
    session_type_id: input.sessionTypeId ?? null,
    accompanying_count: input.accompanying ?? 0,
    note: input.note ?? null,
    status: 'requested',
  })
  if (error) throw error
}

/**
 * Asking for a time the preceptor never published. Only preceptors who
 * opted in accept these — the database checks that rather than trusting
 * the screen — and they are never auto-confirmed: a time nobody published
 * is always the preceptor's to accept by hand.
 */
export async function requestOpenSitting(input: {
  preceptorId: string
  abhyasiId: string
  date: string
  startTime: string
  endTime?: string
  sessionTypeId?: string | null
  accompanying?: number
  note?: string
}): Promise<void> {
  const { error } = await supabase.from('bookings').insert({
    slot_id: null,
    preceptor_id: input.preceptorId,
    abhyasi_id: input.abhyasiId,
    booking_date: input.date,
    requested_start_time: input.startTime,
    requested_end_time: input.endTime ?? null,
    session_type_id: input.sessionTypeId ?? null,
    accompanying_count: input.accompanying ?? 0,
    note: input.note ?? null,
    status: 'requested',
  })
  if (error) throw error
}

// ---- Preceptor decisions on a request ----
/**
 * Confirm a request. When more people were asked for than the sitting
 * holds, the preceptor may confirm the whole party or trim it — passing
 * `accompanying` here is that decision. Only they may change the number;
 * the database enforces it.
 */
export async function confirmBooking(
  bookingId: string,
  opts: { accompanying?: number } = {},
): Promise<void> {
  const patch: Record<string, unknown> = { status: 'confirmed' }
  if (opts.accompanying != null) patch.accompanying_count = opts.accompanying
  const { error } = await supabase.from('bookings').update(patch).eq('id', bookingId)
  if (error) throw error
}

export async function declineBooking(bookingId: string, reason?: string): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .update({ status: 'declined', decline_reason: reason?.trim() || null })
    .eq('id', bookingId)
  if (error) throw error
}

export async function proposeAlternate(
  bookingId: string,
  alt: { date: string; startTime: string; endTime?: string },
): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .update({
      status: 'alternate_proposed',
      alternate_date: alt.date,
      alternate_start_time: alt.startTime,
      alternate_end_time: alt.endTime ?? null,
    })
    .eq('id', bookingId)
  if (error) throw error
}

// ---- Abhyasi responding to a proposed alternate ----
/**
 * A booking made against a published slot takes its time from that slot,
 * so accepting a new time only moves the date. A request made outside the
 * schedule carries its own time, and that is what every screen reads back
 * — so the accepted time has to be written onto the booking too, or the
 * abhyasi would go on being shown the hour they originally asked for.
 */
export async function acceptAlternate(b: {
  id: string
  slot_id: string | null
  alternate_date?: string | null
  alternate_start_time?: string | null
  alternate_end_time?: string | null
}): Promise<void> {
  const patch: Record<string, unknown> = {
    status: 'confirmed',
    booking_date: b.alternate_date,
  }
  if (!b.slot_id && b.alternate_start_time) {
    patch.requested_start_time = b.alternate_start_time
    patch.requested_end_time = b.alternate_end_time ?? null
  }
  const { error } = await supabase.from('bookings').update(patch).eq('id', b.id)
  if (error) throw error
}

export async function rejectAlternate(bookingId: string): Promise<void> {
  return cancelBooking(bookingId, 'Proposed alternate time was declined.')
}

/**
 * Cancel a sitting (either party). Whatever is written here is what the
 * other person is told, word for word — the English message and, when a
 * preceptor cancels, the same message in Hindi.
 */
export async function cancelBooking(
  bookingId: string,
  reason?: string,
  reasonHi?: string,
): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      cancel_reason: reason?.trim() || null,
      cancel_reason_hi: reasonHi?.trim() || null,
    })
    .eq('id', bookingId)
  if (error) throw error
}

// ---- Preceptor recording the outcome ----
export async function markCompleted(bookingId: string): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .update({ status: 'completed' })
    .eq('id', bookingId)
  if (error) throw error
}

export async function markNoShow(bookingId: string): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .update({ status: 'no_show' })
    .eq('id', bookingId)
  if (error) throw error
}

// The slot columns every booking query needs, including where the
// sitting happens and the master-data rows behind it.
// The preceptor's `home_place` comes back null unless row level security
// lets this viewer read it — that is what keeps a home address behind
// confirmation.
const BOOKING_SLOT_COLUMNS = `
  id, preceptor_id, center_id, day_of_week, start_time, end_time, capacity, is_active, note,
  place_type, heartspot_id,
  preceptor:profiles ( id, full_name, phone, ${HOME_PLACE_EMBED} ),
  center:centers ( id, name, city, address, latitude, longitude, map_url ),
  heartspot:heartspots ( id, center_id, name, address, latitude, longitude, map_url, is_active )
`

// One shape for both booking screens. `homeName` is what a home sitting
// is called on this screen — the preceptor sees their own.
function mapBooking(b: any, opts: { homeName?: string } = {}): BookingDetail {
  const slot: AvailabilitySlot | null = b.slot
    ? {
        id: b.slot.id,
        preceptor_id: b.slot.preceptor_id,
        center_id: b.slot.center_id,
        day_of_week: b.slot.day_of_week,
        start_time: b.slot.start_time,
        end_time: b.slot.end_time,
        capacity: b.slot.capacity,
        is_active: b.slot.is_active,
        note: b.slot.note,
        place_type: b.slot.place_type ?? 'heartspot',
        heartspot_id: b.slot.heartspot_id ?? null,
        // A home sitting happens at the preceptor's home.
        place_details:
          b.slot.place_type === 'home' ? onePlace(b.slot.preceptor?.home_place) : null,
      }
    : null

  return {
    id: b.id,
    slot_id: b.slot_id,
    abhyasi_id: b.abhyasi_id,
    preceptor_id: b.preceptor_id,
    booking_date: b.booking_date,
    status: b.status,
    note: b.note,
    session_type_id: b.session_type_id ?? null,
    accompanying_count: b.accompanying_count ?? 0,
    requested_accompanying_count: b.requested_accompanying_count ?? null,
    // Set only when there is no slot — the time the abhyasi asked for.
    requested_start_time: b.requested_start_time ?? null,
    requested_end_time: b.requested_end_time ?? null,
    created_at: b.created_at,
    requested_at: b.requested_at,
    confirmed_at: b.confirmed_at,
    decided_at: b.decided_at,
    cancel_reason: b.cancel_reason,
    cancel_reason_hi: b.cancel_reason_hi ?? null,
    decline_reason: b.decline_reason,
    alternate_date: b.alternate_date,
    alternate_start_time: b.alternate_start_time,
    alternate_end_time: b.alternate_end_time,
    channel_used: b.channel_used,
    slot,
    // A request made outside the schedule has no slot to reach the
    // preceptor through, so that query embeds them directly as well.
    preceptor: b.slot?.preceptor ?? b.preceptor ?? null,
    center: b.slot?.center ?? null,
    abhyasi: b.abhyasi ?? null,
    // PostgREST hands back a one-to-one embed as an object, but an
    // unresolved relationship as an array.
    session_type: Array.isArray(b.session_type)
      ? (b.session_type[0] ?? null)
      : (b.session_type ?? null),
    place: slot ? resolvePlace(slot, b.slot?.heartspot ?? null, b.slot?.center ?? null, opts) : null,
  }
}

const BOOKING_COLUMNS = `
  id, slot_id, abhyasi_id, preceptor_id, booking_date, status, note, created_at,
  requested_at, confirmed_at, decided_at, cancel_reason, cancel_reason_hi, decline_reason,
  requested_start_time, requested_end_time,
  session_type_id, accompanying_count, requested_accompanying_count,
  alternate_date, alternate_start_time, alternate_end_time, channel_used,
  session_type:session_types ( id, name, name_hi, description, sort_order, is_active )
`

// My bookings as the one who booked (abhyasi or preceptor-as-booker).
export async function getMyBookings(userId: string): Promise<BookingDetail[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(
      `
      ${BOOKING_COLUMNS},
      slot:availability_slots ( ${BOOKING_SLOT_COLUMNS} ),
      preceptor:profiles!bookings_preceptor_id_fkey ( id, full_name, phone )
    `,
    )
    .eq('abhyasi_id', userId)
    .order('booking_date', { ascending: true })
  if (error) throw error

  return (data ?? []).map((b) => mapBooking(b))
}

// Sittings people have asked ME for (preceptor view of who is coming).
// Every booking carries `preceptor_id`, including the ones asked outside
// the schedule, which have no slot to be found through.
export async function getMySittings(preceptorId: string): Promise<BookingDetail[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(
      `
      ${BOOKING_COLUMNS},
      slot:availability_slots ( ${BOOKING_SLOT_COLUMNS} ),
      abhyasi:profiles!bookings_abhyasi_id_fkey ( id, full_name, phone )
    `,
    )
    .eq('preceptor_id', preceptorId)
    .order('booking_date', { ascending: true })
  if (error) throw error

  // This is the preceptor's own screen, so a home sitting is *their* home.
  return (data ?? []).map((b) => mapBooking(b, { homeName: MY_HOME_PLACE_NAME }))
}

// ------------------------------------------------------------------
// NOTIFICATIONS — the small inbox the database writes for each person
// ------------------------------------------------------------------
export async function getNotifications(
  profileId: string,
  limit = 50,
): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, booking_id, kind, title, body, read_at, created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as AppNotification[]
}

export async function countUnreadNotifications(profileId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .is('read_at', null)
  if (error) throw error
  return count ?? 0
}

export async function markNotificationsRead(profileId: string, ids?: string[]): Promise<void> {
  let q = supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('profile_id', profileId)
    .is('read_at', null)
  if (ids?.length) q = q.in('id', ids)
  const { error } = await q
  if (error) throw error
}
