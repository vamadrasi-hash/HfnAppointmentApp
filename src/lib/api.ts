import { supabase } from './supabase'
import type {
  Zone,
  Center,
  Area,
  Profile,
  AvailabilitySlot,
  AvailableSlot,
  PreceptorWithSlots,
  BookingDetail,
} from './types'
import { distanceKm } from './utils'

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

export async function getCenters(zoneId?: string): Promise<Center[]> {
  let q = supabase.from('centers').select('*').order('name', { ascending: true })
  if (zoneId) q = q.eq('zone_id', zoneId)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function getAreas(centerId?: string): Promise<Area[]> {
  let q = supabase.from('areas').select('*').order('name', { ascending: true })
  if (centerId) q = q.eq('center_id', centerId)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function getCities(): Promise<string[]> {
  const { data, error } = await supabase.from('centers').select('city')
  if (error) throw error
  const set = new Set((data ?? []).map((r) => r.city).filter(Boolean))
  return Array.from(set).sort()
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
  areaId?: string
  city?: string
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
    if (filters.areaId && r.preceptor_area_id !== filters.areaId) return false
    if (filters.city && r.center_city !== filters.city) return false
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
      preceptor: { id: r.preceptor_id, full_name: r.preceptor_name, phone: r.preceptor_phone },
      center: r.center_id
        ? {
            id: r.center_id,
            name: r.center_name ?? '',
            city: r.center_city ?? '',
            latitude: r.center_lat,
            longitude: r.center_lng,
          }
        : null,
      booked_count: Number(r.booked_count),
      remaining,
    }

    if (!byPreceptor.has(r.preceptor_id)) {
      let distance: number | null = null
      if (filters.origin && r.center_lat != null && r.center_lng != null) {
        distance = distanceKm(filters.origin.lat, filters.origin.lng, r.center_lat, r.center_lng)
      }
      byPreceptor.set(r.preceptor_id, {
        preceptor: { id: r.preceptor_id, full_name: r.preceptor_name, phone: r.preceptor_phone },
        center: r.center_id
          ? { id: r.center_id, name: r.center_name ?? '', city: r.center_city ?? '' }
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
        id, preceptor_id, center_id, day_of_week, start_time, end_time, capacity, is_active, note,
        preceptor:profiles ( id, full_name, phone ),
        center:centers ( id, name, city )
      )
    `,
    )
    .eq('abhyasi_id', userId)
    .order('booking_date', { ascending: true })
  if (error) throw error

  return (data ?? []).map((b: any) => ({
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
    slot: b.slot
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
        }
      : null,
    preceptor: b.slot?.preceptor ?? null,
    center: b.slot?.center ?? null,
    abhyasi: null,
  }))
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
      slot:availability_slots ( id, preceptor_id, center_id, day_of_week, start_time, end_time, capacity, is_active, note,
        center:centers ( id, name, city ) ),
      abhyasi:profiles ( id, full_name, phone )
    `,
    )
    .in('slot_id', slotIds)
    .order('booking_date', { ascending: true })
  if (error) throw error

  return (data ?? []).map((b: any) => ({
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
    slot: b.slot
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
        }
      : null,
    preceptor: null,
    center: b.slot?.center ?? null,
    abhyasi: b.abhyasi ?? null,
  }))
}
