// TypeScript shapes that mirror the database tables.

export type UserRole = 'abhyasi' | 'preceptor' | 'admin'
export type BookingStatus = 'confirmed' | 'cancelled' | 'completed'

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
  booking_date: string // 'YYYY-MM-DD'
  status: BookingStatus
  note: string | null
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
