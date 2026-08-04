import { supabase } from './supabase'
import type {
  Zone,
  Center,
  Heartspot,
  Profile,
  AvailabilitySlot,
  AvailableSlot,
  PreceptorWithSlots,
  BookingDetail,
  ResolvedPlace,
  SittingPlaceType,
} from './types'
import { distanceKm } from './utils'
import { HOME_PLACE_NAME, MY_HOME_PLACE_NAME, resolvePlace } from './place'
import { centerFullLabel } from './centers'

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

// ---- Master data editing (admins only; RLS enforces that) ------------
export type CenterInput = Omit<Center, 'id'>
export type HeartspotInput = Omit<Heartspot, 'id'>

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


// ------------------------------------------------------------------
// PROFILE
// ------------------------------------------------------------------
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function upsertProfile(p: Partial<Profile> & { id: string }): Promise<Profile> {
  const payload = { ...p, updated_at: new Date().toISOString() }
  const { data, error } = await supabase
    .from('profiles')
    .upsert(payload, { onConflict: 'id' })
    .select('*')
    .single()
  if (error) throw error
  return data
}

// ------------------------------------------------------------------
// AVAILABILITY SLOTS (preceptor side)
// ------------------------------------------------------------------
export async function getMySlots(preceptorId: string): Promise<AvailabilitySlot[]> {
  const { data, error } = await supabase
    .from('availability_slots')
    .select('*')
    .eq('preceptor_id', preceptorId)
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createSlot(
  slot: Omit<AvailabilitySlot, 'id'>,
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
  date: string // ISO yyyy-MM-dd
  zoneId?: string
  centerId?: string
  fromTime?: string // 'HH:MM' inclusive
  toTime?: string // 'HH:MM' inclusive
  origin?: { lat: number; lng: number } | null // for "near me" sorting
  includeFull?: boolean
}

interface RawSlotRow {
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

// The RPC has already walked slot -> heartspot -> center, so this only
// has to name the place.
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
  }
}

export async function findPreceptors(
  filters: SlotFilters,
): Promise<PreceptorWithSlots[]> {
  const { data, error } = await supabase.rpc('find_available_slots', {
    target_date: filters.date,
  })
  if (error) throw error

  const rows = (data ?? []) as RawSlotRow[]

  // Apply the dropdown / time filters in the app.
  const filtered = rows.filter((r) => {
    if (filters.zoneId && r.center_zone_id !== filters.zoneId) return false
    if (filters.centerId && r.center_id !== filters.centerId) return false
    if (filters.fromTime && r.start_time.slice(0, 5) < filters.fromTime) return false
    if (filters.toTime && r.start_time.slice(0, 5) > filters.toTime) return false
    return true
  })

  // Group by preceptor and shape into AvailableSlot.
  const byPreceptor = new Map<string, PreceptorWithSlots>()

  for (const r of filtered) {
    const remaining = r.capacity - Number(r.booked_count)
    if (!filters.includeFull && remaining <= 0) continue

    const slot: AvailableSlot = {
      id: r.slot_id,
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
      remaining,
    }

    if (!byPreceptor.has(r.preceptor_id)) {
      // Measure to where the sitting actually is, falling back to the
      // center when the place itself carries no coordinates.
      const lat = r.place_lat ?? r.center_lat
      const lng = r.place_lng ?? r.center_lng
      let distance: number | null = null
      if (filters.origin && lat != null && lng != null) {
        distance = distanceKm(filters.origin.lat, filters.origin.lng, lat, lng)
      }
      byPreceptor.set(r.preceptor_id, {
        preceptor: { id: r.preceptor_id, full_name: r.preceptor_name, phone: r.preceptor_phone },
        center: r.center_id
          ? { id: r.center_id, name: r.center_name ?? '', city: r.center_city }
          : null,
        distanceKm: distance,
        slots: [],
      })
    }
    byPreceptor.get(r.preceptor_id)!.slots.push(slot)
  }

  const result = Array.from(byPreceptor.values())
  result.forEach((p) =>
    p.slots.sort((a, b) => a.start_time.localeCompare(b.start_time)),
  )

  // Sort: by distance when "near me" is on, otherwise by preceptor name.
  if (filters.origin) {
    result.sort((a, b) => {
      if (a.distanceKm == null) return 1
      if (b.distanceKm == null) return -1
      return a.distanceKm - b.distanceKm
    })
  } else {
    result.sort((a, b) => a.preceptor.full_name.localeCompare(b.preceptor.full_name))
  }
  return result
}

// ------------------------------------------------------------------
// BOOKINGS — the request -> confirm state machine
// ------------------------------------------------------------------

// Abhyasi asks for a sitting. It starts as 'requested' unless the
// preceptor has auto_confirm on (the DB trigger handles that).
export async function requestSitting(input: {
  slotId: string
  abhyasiId: string
  date: string
  note?: string
}): Promise<void> {
  const { error } = await supabase.from('bookings').insert({
    slot_id: input.slotId,
    abhyasi_id: input.abhyasiId,
    booking_date: input.date,
    note: input.note ?? null,
    status: 'requested',
  })
  if (error) throw error
}

// ---- Preceptor decisions on a request ----
export async function confirmBooking(bookingId: string): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .update({ status: 'confirmed' })
    .eq('id', bookingId)
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
export async function acceptAlternate(bookingId: string, alternateDate: string): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .update({ status: 'confirmed', booking_date: alternateDate })
    .eq('id', bookingId)
  if (error) throw error
}

export async function rejectAlternate(bookingId: string): Promise<void> {
  return cancelBooking(bookingId, 'Proposed alternate time was declined.')
}

// ---- Cancellation (either party) ----
export async function cancelBooking(bookingId: string, reason?: string): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled', cancel_reason: reason?.trim() || null })
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
const BOOKING_SLOT_COLUMNS = `
  id, preceptor_id, center_id, day_of_week, start_time, end_time, capacity, is_active, note,
  place_type, heartspot_id, address, latitude, longitude, map_url,
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
        address: b.slot.address ?? null,
        latitude: b.slot.latitude ?? null,
        longitude: b.slot.longitude ?? null,
        map_url: b.slot.map_url ?? null,
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
    created_at: b.created_at,
    requested_at: b.requested_at,
    confirmed_at: b.confirmed_at,
    decided_at: b.decided_at,
    cancel_reason: b.cancel_reason,
    decline_reason: b.decline_reason,
    alternate_date: b.alternate_date,
    alternate_start_time: b.alternate_start_time,
    alternate_end_time: b.alternate_end_time,
    channel_used: b.channel_used,
    slot,
    preceptor: b.slot?.preceptor ?? null,
    center: b.slot?.center ?? null,
    abhyasi: b.abhyasi ?? null,
    place: slot ? resolvePlace(slot, b.slot?.heartspot ?? null, b.slot?.center ?? null, opts) : null,
  }
}

// My bookings as the one who booked (abhyasi or preceptor-as-booker).
export async function getMyBookings(userId: string): Promise<BookingDetail[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(
      `
      id, slot_id, abhyasi_id, preceptor_id, booking_date, status, note, created_at,
      requested_at, confirmed_at, decided_at, cancel_reason, decline_reason,
      alternate_date, alternate_start_time, alternate_end_time, channel_used,
      slot:availability_slots (
        ${BOOKING_SLOT_COLUMNS},
        preceptor:profiles ( id, full_name, phone )
      )
    `,
    )
    .eq('abhyasi_id', userId)
    .order('booking_date', { ascending: true })
  if (error) throw error

  return (data ?? []).map((b) => mapBooking(b))
}

// Incoming bookings on MY slots (preceptor view of who is coming).
export async function getMySittings(preceptorId: string): Promise<BookingDetail[]> {
  // First find my slot ids, then the bookings on them.
  const { data: slots, error: slotErr } = await supabase
    .from('availability_slots')
    .select('id')
    .eq('preceptor_id', preceptorId)
  if (slotErr) throw slotErr
  const slotIds = (slots ?? []).map((s) => s.id)
  if (slotIds.length === 0) return []

  const { data, error } = await supabase
    .from('bookings')
    .select(
      `
      id, slot_id, abhyasi_id, preceptor_id, booking_date, status, note, created_at,
      requested_at, confirmed_at, decided_at, cancel_reason, decline_reason,
      alternate_date, alternate_start_time, alternate_end_time, channel_used,
      slot:availability_slots ( ${BOOKING_SLOT_COLUMNS} ),
      abhyasi:profiles ( id, full_name, phone )
    `,
    )
    .in('slot_id', slotIds)
    .order('booking_date', { ascending: true })
  if (error) throw error

  // This is the preceptor's own screen, so a home sitting is *their* home.
  return (data ?? []).map((b) => mapBooking(b, { homeName: MY_HOME_PLACE_NAME }))
}
