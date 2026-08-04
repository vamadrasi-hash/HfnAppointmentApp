// TypeScript shapes that mirror the database tables.

export type UserRole = 'abhyasi' | 'preceptor' | 'coordinator' | 'admin'

// The full sitting lifecycle. See the state machine in the spec.
export type BookingStatus =
  | 'requested'
  | 'confirmed'
  | 'alternate_proposed'
  | 'declined'
  | 'cancelled'
  | 'reminded'
  | 'completed'
  | 'no_show'
  | 'expired'

// States where the sitting is still "live" (holds a seat, needs attention).
export const LIVE_STATUSES: BookingStatus[] = [
  'requested',
  'confirmed',
  'alternate_proposed',
  'reminded',
]

export interface Zone {
  id: string
  name: string
  description: string | null
  sort_order: number | null
}

export interface Center {
  id: string
  zone_id: string
  name: string
  // Centers are grouped by city in the "City / Center" picker. Not every
  // center in the master list has a city yet, so this can be null.
  city: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  map_url: string | null
}

// A meditation place belonging to a center. A center can have several.
export interface Heartspot {
  id: string
  center_id: string
  name: string
  address: string | null
  latitude: number | null
  longitude: number | null
  map_url: string | null
  is_active: boolean
}

// Where a sitting happens.
export type SittingPlaceType = 'heartspot' | 'home'

// The address + map details a heartspot, a center and a slot all carry.
export interface PlaceDetails {
  address: string | null
  latitude: number | null
  longitude: number | null
  map_url: string | null
}

export interface Profile {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  role: UserRole
  // Where this person belongs: a zone and a center. The center's city is
  // copied onto the profile so it can be shown without another lookup.
  zone_id: string | null
  center_id: string | null
  city: string | null
  home_latitude: number | null
  home_longitude: number | null
  auto_confirm?: boolean
  created_at?: string
  updated_at?: string
}

export interface AvailabilitySlot {
  id: string
  preceptor_id: string
  center_id: string | null
  day_of_week: number // 0=Sun ... 6=Sat
  start_time: string // 'HH:MM:SS'
  end_time: string
  // How many abhyasis can join this sitting.
  capacity: number
  is_active: boolean
  note: string | null
  // ---- where the sitting happens ----
  place_type: SittingPlaceType
  heartspot_id: string | null
  // Filled in for a home sitting; also an override for a heartspot one.
  address: string | null
  latitude: number | null
  longitude: number | null
  map_url: string | null
}

export interface Booking {
  id: string
  slot_id: string
  abhyasi_id: string
  preceptor_id: string | null
  booking_date: string // 'YYYY-MM-DD'
  status: BookingStatus
  note: string | null
  // confirmation workflow
  requested_at?: string | null
  confirmed_at?: string | null
  decided_at?: string | null
  cancel_reason?: string | null
  decline_reason?: string | null
  // preceptor-proposed alternate time
  alternate_date?: string | null
  alternate_start_time?: string | null
  alternate_end_time?: string | null
  channel_used?: string | null
  created_at?: string
}

// ---- Joined / computed shapes used by the booking screens ----

// A place ready to show: the address and map details have already been
// resolved through slot -> heartspot -> center, so nothing else has to.
export interface ResolvedPlace extends PlaceDetails {
  type: SittingPlaceType
  /** 'Adajan Heartspot', or the preceptor's home. */
  name: string
  /** The center it is filed under, e.g. 'Surat · Surat-West-Adajan'. */
  area: string | null
}

// The raw place columns are left out: the RPC returns them already
// resolved, as `place`.
export interface AvailableSlot
  extends Omit<
    AvailabilitySlot,
    'heartspot_id' | 'address' | 'latitude' | 'longitude' | 'map_url'
  > {
  preceptor: Pick<Profile, 'id' | 'full_name' | 'phone'>
  center: Pick<Center, 'id' | 'name' | 'city' | 'latitude' | 'longitude'> | null
  place: ResolvedPlace
  booked_count: number
  remaining: number
}

export interface PreceptorWithSlots {
  preceptor: Pick<Profile, 'id' | 'full_name' | 'phone'>
  center: Pick<Center, 'id' | 'name' | 'city'> | null
  distanceKm: number | null
  slots: AvailableSlot[]
}

export interface BookingDetail extends Booking {
  slot: AvailabilitySlot | null
  preceptor: Pick<Profile, 'id' | 'full_name' | 'phone'> | null
  abhyasi: Pick<Profile, 'id' | 'full_name' | 'phone'> | null
  center: Pick<Center, 'id' | 'name' | 'city'> | null
  /** Where to go, ready to show. Null when the slot itself is gone. */
  place: ResolvedPlace | null
}
