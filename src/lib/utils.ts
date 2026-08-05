import { format, parse, addDays, startOfToday, isBefore } from 'date-fns'
import type { BookingStatus } from './types'

// ---- Booking status display ------------------------------------------
// Badge tones must match the set defined in components/ui.tsx.
export type StatusTone = 'brand' | 'gold' | 'neutral' | 'green' | 'red' | 'amber'

export const STATUS_META: Record<BookingStatus, { label: string; tone: StatusTone }> = {
  requested:          { label: 'Awaiting confirmation', tone: 'amber' },
  confirmed:          { label: 'Confirmed',              tone: 'brand' },
  alternate_proposed: { label: 'New time proposed',      tone: 'gold' },
  declined:           { label: 'Declined',               tone: 'red' },
  cancelled:          { label: 'Cancelled',              tone: 'neutral' },
  reminded:           { label: 'Confirmed',              tone: 'brand' },
  completed:          { label: 'Completed',              tone: 'green' },
  no_show:            { label: 'No-show',                tone: 'red' },
  expired:            { label: 'Expired',                tone: 'neutral' },
}

export function statusLabel(s: BookingStatus): string {
  return STATUS_META[s]?.label ?? s
}

export function statusTone(s: BookingStatus): StatusTone {
  return STATUS_META[s]?.tone ?? 'neutral'
}

// ---- Days of the week -------------------------------------------------
// Stored values follow JavaScript's getDay(): 0=Sunday ... 6=Saturday.
// We display the week starting on Monday, which is how the org thinks of it.
export const WEEK_DAYS: { value: number; label: string; short: string }[] = [
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
  { value: 0, label: 'Sunday', short: 'Sun' },
]

export function dayLabel(value: number): string {
  return WEEK_DAYS.find((d) => d.value === value)?.label ?? ''
}

export function dayShort(value: number): string {
  return WEEK_DAYS.find((d) => d.value === value)?.short ?? ''
}

// ---- Time formatting --------------------------------------------------
// Turn '06:30:00' (from the DB) into '6:30 AM' for display.
export function formatTime(time: string): string {
  try {
    const parsed = parse(time.slice(0, 5), 'HH:mm', new Date())
    return format(parsed, 'h:mm a')
  } catch {
    return time
  }
}

export function formatTimeRange(start: string, end: string): string {
  return `${formatTime(start)} – ${formatTime(end)}`
}

// A sitting is half an hour unless someone says otherwise — the schedule
// form uses this to move the end time along with the start.
export const DEFAULT_SITTING_MINUTES = 30

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':')
  return Number(h) * 60 + Number(m ?? 0)
}

export function minutesToTime(mins: number): string {
  // Wrap rather than run past midnight, so 23:50 + 30 reads as 00:20.
  const wrapped = ((mins % 1440) + 1440) % 1440
  const h = Math.floor(wrapped / 60)
  const m = wrapped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function addMinutesToTime(time: string, mins: number): string {
  return minutesToTime(timeToMinutes(time) + mins)
}

/** How long a slot lasts, or 0 if the end is not after the start. */
export function durationMinutes(start: string, end: string): number {
  return Math.max(0, timeToMinutes(end) - timeToMinutes(start))
}

// When a booking has a slot, the slot says when it is. A request made
// outside the schedule carries its own time instead.
export function bookingTimes(b: {
  slot?: { start_time: string; end_time: string } | null
  requested_start_time?: string | null
  requested_end_time?: string | null
}): { start: string; end: string } | null {
  if (b.slot) return { start: b.slot.start_time, end: b.slot.end_time }
  if (b.requested_start_time) {
    return {
      start: b.requested_start_time,
      end: b.requested_end_time ?? addMinutesToTime(b.requested_start_time, DEFAULT_SITTING_MINUTES),
    }
  }
  return null
}

// ---- How many are coming ---------------------------------------------
// A booking can bring people with it, so it takes 1 + accompanying_count
// places in the sitting. The seeker is always one of them.
export function partySize(b: { accompanying_count?: number | null }): number {
  return 1 + (b.accompanying_count ?? 0)
}

export function peopleLabel(n: number): string {
  return n === 1 ? '1 person' : `${n} people`
}

// ---- Dates ------------------------------------------------------------
export const ISO_DATE = 'yyyy-MM-dd'

export function toISODate(d: Date): string {
  return format(d, ISO_DATE)
}

export function fromISODate(s: string): Date {
  return parse(s, ISO_DATE, new Date())
}

export function prettyDate(s: string): string {
  return format(fromISODate(s), 'EEE, d MMM yyyy')
}

export function isPastDate(s: string): boolean {
  return isBefore(fromISODate(s), startOfToday())
}

// Build the list of selectable dates: today + the next N days.
export function upcomingDates(days = 14): { iso: string; label: string; dow: number }[] {
  const out: { iso: string; label: string; dow: number }[] = []
  const today = startOfToday()
  for (let i = 0; i < days; i++) {
    const d = addDays(today, i)
    out.push({
      iso: toISODate(d),
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : format(d, 'EEE, d MMM'),
      dow: d.getDay(),
    })
  }
  return out
}

// ---- Geolocation distance (Haversine), in kilometres -----------------
export function distanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Tiny class-name joiner (so we don't need an extra dependency).
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}
