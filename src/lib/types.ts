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
  city: string
  address: string | null
  latitude: number | null
  longitude: number | null
}

export interface Area {
  id: string
  center_id: string
  name: string
  pincode: string | null
  latitude: number | null
  longitude: number | null
}

export interface Profile {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  role: UserRole
  zone_id: string | null
  center_id: string | null
  area_id: string | null
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
  capacity: number
  is_active: boolean
  note: string | null
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

export interface AvailableSlot extends AvailabilitySlot {
  preceptor: Pick<Profile, 'id' | 'full_name' | 'phone'>
  center: Pick<Center, 'id' | 'name' | 'city' | 'latitude' | 'longitude'> | null
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
}
