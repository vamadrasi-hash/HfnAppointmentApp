import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  SlidersHorizontal,
  Navigation,
  X,
  CalendarDays,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  MapPin,
  Search as SearchIcon,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  searchAvailability,
  requestSitting,
  requestOpenSitting,
  type AvailabilitySearch,
  type SlotFilters,
} from '../lib/api'
import type { AvailableSlot, PreceptorWithSlots } from '../lib/types'
import { Badge, Button, Card, Field, Select, PageLoader, EmptyState } from '../components/ui'
import { ZoneCenterPicker, type ZoneCenterValue } from '../components/ZoneCenterPicker'
import { PreceptorCard } from '../components/PreceptorCard'
import { PlaceLine } from '../components/PlaceLine'
import { Modal } from '../components/Modal'
import {
  DEFAULT_SITTING_MINUTES,
  addMinutesToTime,
  durationMinutes,
  isUsablePhone,
  upcomingDates,
  prettyDate,
  formatTimeRange,
  dayShort,
  cx,
} from '../lib/utils'

type TimeBand = '' | 'morning' | 'afternoon' | 'evening'
const TIME_BANDS: Record<Exclude<TimeBand, ''>, { from: string; to: string }> = {
  morning: { from: '00:00', to: '11:59' },
  afternoon: { from: '12:00', to: '16:59' },
  evening: { from: '17:00', to: '23:59' },
}

const EMPTY_RESULT: AvailabilitySearch = { onDate: [], next: null, areas: [] }

const NEEDS_PHONE =
  'Add your mobile number in your profile first — the preceptor is shown it so they can reach you about the sitting.'

export default function FindPreceptors() {
  const { user, profile } = useAuth()
  const dates = useMemo(() => upcomingDates(14), [])

  const [date, setDate] = useState(dates[0].iso)

  // Where to look: a zone, then a city / center from the searchable list.
  const [place, setPlace] = useState<ZoneCenterValue>({ zoneId: '', centerId: '', city: null })
  const [band, setBand] = useState<TimeBand>('')

  const [showFilters, setShowFilters] = useState(false)

  // Near me
  const [nearMe, setNearMe] = useState(false)
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null)
  const [geoMsg, setGeoMsg] = useState<string | null>(null)

  // Results
  const [result, setResult] = useState<AvailabilitySearch>(EMPTY_RESULT)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Requesting a published time
  const [target, setTarget] = useState<AvailableSlot | null>(null)
  const [note, setNote] = useState('')
  const [booking, setBooking] = useState(false)
  const [bookError, setBookError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Asking for a time that was never published
  const [askTarget, setAskTarget] = useState<PreceptorWithSlots | null>(null)
  const [askDate, setAskDate] = useState('')
  const [askStart, setAskStart] = useState('07:00')
  const [askEnd, setAskEnd] = useState(addMinutesToTime('07:00', DEFAULT_SITTING_MINUTES))
  const [askNote, setAskNote] = useState('')

  const activeFilterCount = (place.zoneId ? 1 : 0) + (place.centerId ? 1 : 0) + (band ? 1 : 0)

  // The preceptor is given this number when they answer, so a request
  // cannot be sent without one. Everyone who registers now gives it; this
  // catches accounts made before it was asked for.
  const hasPhone = isUsablePhone(profile?.phone)

  // Distance is a "near me" answer and nothing else: with the button off
  // we measure nothing and show nothing, and the list is ordered by name.
  const searchOrigin = nearMe ? origin : null

  const runSearch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const filters: SlotFilters = {
        date,
        zoneId: place.zoneId || undefined,
        centerId: place.centerId || undefined,
        fromTime: band ? TIME_BANDS[band].from : undefined,
        toTime: band ? TIME_BANDS[band].to : undefined,
        origin: searchOrigin,
        // Look across the whole strip of dates in one go, so "the next
        // available time" and the by-area list cost no extra round trip.
        windowStart: dates[0].iso,
        windowDays: dates.length,
      }
      setResult(await searchAvailability(filters))
    } catch (e: any) {
      setError(e.message ?? 'Could not load preceptors. Please try again.')
      setResult(EMPTY_RESULT)
    } finally {
      setLoading(false)
    }
  }, [date, place.zoneId, place.centerId, band, searchOrigin, dates])

  // Re-run whenever the date, any filter, or the location changes.
  useEffect(() => {
    runSearch()
  }, [runSearch])

  function toggleNearMe() {
    if (nearMe) {
      setNearMe(false)
      setOrigin(null)
      setGeoMsg(null)
      return
    }
    setGeoMsg(null)
    if (!('geolocation' in navigator)) {
      setGeoMsg('Location is not available on this device.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setNearMe(true)
      },
      () => {
        // Fall back to the saved home location if the live one is refused.
        const saved = profile?.home_place
        if (saved?.latitude != null && saved?.longitude != null) {
          setOrigin({ lat: saved.latitude, lng: saved.longitude })
          setNearMe(true)
          setGeoMsg('Using your saved home location.')
        } else {
          setGeoMsg('Couldn’t get your location. Add it in your profile to sort by distance.')
        }
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  function clearFilters() {
    setPlace({ zoneId: '', centerId: '', city: null })
    setBand('')
  }

  function announce(message: string) {
    setSuccess(message)
    window.setTimeout(() => setSuccess(null), 7000)
  }

  // ---- Requesting a published time ----
  function openBooking(slot: AvailableSlot) {
    setTarget(slot)
    setNote('')
    setBookError(null)
  }

  async function submitRequest() {
    if (!target || !user) return
    if (!hasPhone) {
      setBookError(NEEDS_PHONE)
      return
    }
    setBooking(true)
    setBookError(null)
    try {
      await requestSitting({
        slotId: target.id,
        abhyasiId: user.id,
        // The slot carries its own date, which is not always the day being
        // looked at — "next available" can be further off.
        date: target.date,
        note: note.trim() || undefined,
      })
      const who = target.preceptor.full_name
      setTarget(null)
      announce(
        `Request sent to ${who} for ${prettyDate(target.date)}. You'll be notified once it's confirmed.`,
      )
      runSearch() // refresh remaining counts
    } catch (e: any) {
      setBookError(requestErrorMessage(e))
    } finally {
      setBooking(false)
    }
  }

  // ---- Asking for a time outside the schedule ----
  function openAsk(p: PreceptorWithSlots) {
    setAskTarget(p)
    setAskDate(date)
    setAskStart('07:00')
    setAskEnd(addMinutesToTime('07:00', DEFAULT_SITTING_MINUTES))
    setAskNote('')
    setBookError(null)
  }

  function pickAskStart(start: string) {
    const span = durationMinutes(askStart, askEnd) || DEFAULT_SITTING_MINUTES
    setAskStart(start)
    setAskEnd(addMinutesToTime(start, span))
  }

  async function submitAsk() {
    if (!askTarget || !user) return
    if (!askDate || !askStart) {
      setBookError('Pick the day and time you would like.')
      return
    }
    if (!hasPhone) {
      setBookError(NEEDS_PHONE)
      return
    }
    setBooking(true)
    setBookError(null)
    try {
      await requestOpenSitting({
        preceptorId: askTarget.preceptor.id,
        abhyasiId: user.id,
        date: askDate,
        startTime: askStart,
        endTime: askEnd || undefined,
        note: askNote.trim() || undefined,
      })
      const who = askTarget.preceptor.full_name
      const when = askDate
      setAskTarget(null)
      announce(
        `Request sent to ${who} for ${prettyDate(when)}. They will confirm the time and where to meet.`,
      )
      runSearch()
    } catch (e: any) {
      setBookError(requestErrorMessage(e))
    } finally {
      setBooking(false)
    }
  }

  // The soonest free time anywhere, shown when the seeker has not landed
  // on a day that has one.
  const next = result.next && result.next.date !== date ? result.next : null

  // Preceptors open to being asked show up whatever the day, so "is there
  // anything on this day" has to count published times, not names.
  const withTimes = result.onDate.filter((p) => p.slots.length > 0)
  const askableCount = result.onDate.length - withTimes.length

  // "Nobody here" is either no one at all — published or askable — or,
  // with near me on, nobody we could actually place on a map.
  const showAreas =
    !loading &&
    !error &&
    (result.onDate.length === 0 ||
      (nearMe && result.onDate.every((p) => p.distanceKm == null)))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl text-ink-900">Find a sitting</h1>
        <p className="mt-1 text-sm text-ink-500">
          Pick a day, then request an open time. The preceptor confirms your sitting.
        </p>
      </div>

      {/* Registered before a mobile number was asked for */}
      {!hasPhone && (
        <p className="rounded-xl border border-amber-100 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
          Add your mobile number in{' '}
          <Link to="/profile" className="font-semibold underline">
            your profile
          </Link>{' '}
          before requesting a sitting — the preceptor is shown it so they can reach you.
        </p>
      )}

      {/* Success banner */}
      {success && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Date strip */}
      <div className="-mx-4 overflow-x-auto px-4 no-scrollbar">
        <div className="flex gap-2 pb-1">
          {dates.map((d) => {
            const active = d.iso === date
            const isNamed = d.label === 'Today' || d.label === 'Tomorrow'
            const smallLine = isNamed ? dayShort(d.dow) : d.label.split(', ')[0]
            const boldLine = isNamed ? d.label : d.label.split(', ')[1]
            return (
              <button
                key={d.iso}
                onClick={() => setDate(d.iso)}
                className={cx(
                  'flex shrink-0 flex-col items-center rounded-xl border px-3.5 py-2 transition-colors',
                  active
                    ? 'border-brand-500 bg-brand-600 text-white shadow-soft'
                    : 'border-brand-100 bg-white text-ink-600 hover:border-brand-300',
                )}
              >
                <span className={cx('text-[11px] font-medium', active ? 'text-brand-50' : 'text-ink-400')}>
                  {smallLine}
                </span>
                <span className="text-sm font-semibold">{boldLine}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowFilters((s) => !s)}
          className={cx(
            'inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors',
            activeFilterCount > 0
              ? 'border-brand-300 bg-brand-50 text-brand-700'
              : 'border-brand-100 bg-white text-ink-600 hover:border-brand-300',
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] font-semibold text-white">
              {activeFilterCount}
            </span>
          )}
        </button>

        <button
          onClick={toggleNearMe}
          className={cx(
            'inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors',
            nearMe
              ? 'border-brand-500 bg-brand-600 text-white'
              : 'border-brand-100 bg-white text-ink-600 hover:border-brand-300',
          )}
        >
          <Navigation className="h-4 w-4" />
          Near me
        </button>
      </div>

      {geoMsg && <p className="text-xs text-amber-700">{geoMsg}</p>}

      {/* Filters panel */}
      {showFilters && (
        <div className="space-y-3 rounded-2xl border border-brand-100 bg-white p-4 shadow-soft">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-ink-700">Filters</p>
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                <X className="h-3.5 w-3.5" /> Clear all
              </button>
            )}
          </div>

          <ZoneCenterPicker
            mode="filter"
            zoneId={place.zoneId}
            centerId={place.centerId}
            onChange={setPlace}
          />

          <Field label="Time of day">
            <Select value={band} onChange={(e) => setBand(e.target.value as TimeBand)}>
              <option value="">Any time</option>
              <option value="morning">Morning (before 12 pm)</option>
              <option value="afternoon">Afternoon (12–5 pm)</option>
              <option value="evening">Evening (after 5 pm)</option>
            </Select>
          </Field>
        </div>
      )}

      {/* The soonest free time anywhere — so a seeker who has picked no
          slot is still told when the next one is, and whose. */}
      {!loading && next && (
        <Card className="border-brand-200 bg-brand-50/40">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-brand-700">
                <CalendarClock className="h-3.5 w-3.5" /> Next available
              </p>
              <p className="mt-1 font-semibold text-ink-900">{next.preceptor.full_name}</p>
              <p className="mt-0.5 text-sm text-ink-600">
                {prettyDate(next.date)} · {formatTimeRange(next.start_time, next.end_time)}
              </p>
              <PlaceLine place={next.place} className="mt-0.5 text-xs" />
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <Button onClick={() => openBooking(next)}>Request</Button>
              <button
                onClick={() => setDate(next.date)}
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                See that day
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Results */}
      {loading ? (
        <PageLoader label="Finding preceptors…" />
      ) : error ? (
        <EmptyState
          icon={<SearchIcon className="h-8 w-8" />}
          title="Something went wrong"
          subtitle={error}
          action={
            <Button variant="secondary" onClick={runSearch}>
              Try again
            </Button>
          }
        />
      ) : (
        <>
          {/* Everyone who can give a sitting on this day — the ones with a
              published time, and the ones who will take a time of your
              choosing. Nearest first with "near me" on. */}
          {result.onDate.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-ink-500">
                {withTimes.length > 0 ? (
                  <>
                    {withTimes.length} preceptor{withTimes.length > 1 ? 's' : ''} available on{' '}
                    <span className="font-medium text-ink-700">{prettyDate(date)}</span>
                    {askableCount > 0 && `, and ${askableCount} more you can ask for a time`}
                  </>
                ) : (
                  <>
                    Nobody has published a time on{' '}
                    <span className="font-medium text-ink-700">{prettyDate(date)}</span>, but{' '}
                    {askableCount} preceptor{askableCount > 1 ? 's take' : ' takes'} requests for a
                    time of your choosing
                  </>
                )}
                {searchOrigin && ', nearest first'}.
              </p>
              {result.onDate.map((p) => (
                <PreceptorCard
                  key={p.preceptor.id}
                  data={p}
                  onBook={openBooking}
                  onAskTime={openAsk}
                  // Nothing on the day they picked, but something later in
                  // the fortnight is still worth showing.
                  showNextAvailable={p.slots.length === 0}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<CalendarDays className="h-8 w-8" />}
              title="No open sittings"
              subtitle={`No preceptors have published a time on ${prettyDate(date)} with these filters, and none here take requests outside their schedule.${
                result.areas.length > 0 ? ' Here is everyone who is free soon.' : ''
              }`}
              action={
                activeFilterCount > 0 ? (
                  <Button variant="secondary" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          )}

          {/* Nobody near: the wider picture, area by area and center by
              center, each preceptor with their soonest free time. */}
          {showAreas && result.areas.length > 0 && (
            <div className="space-y-5">
              <div className="rounded-xl border border-brand-100 bg-brand-50/50 px-3.5 py-2.5 text-sm text-ink-600">
                {nearMe
                  ? 'Nobody could be placed near you, so here is everyone available, by area.'
                  : 'Preceptors available in the next two weeks, by area.'}
              </div>

              {result.areas.map((area) => (
                <div key={area.area}>
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <h2 className="inline-flex items-center gap-1.5 font-serif text-lg text-ink-900">
                      <MapPin className="h-4 w-4 text-brand-500" />
                      {area.area}
                    </h2>
                    <span className="text-xs text-ink-400">
                      {area.preceptorCount} preceptor{area.preceptorCount > 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="space-y-4">
                    {area.centers.map((group) => (
                      <div key={group.centerId ?? group.centerName}>
                        <p className="mb-2 text-sm font-semibold text-ink-700">
                          {group.centerName}
                        </p>
                        <div className="space-y-3">
                          {group.preceptors.map((p) => (
                            <PreceptorCard
                              key={p.preceptor.id}
                              data={p}
                              onBook={openBooking}
                              onAskTime={openAsk}
                              showNextAvailable
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Booking confirmation */}
      <Modal
        open={!!target}
        onClose={() => (booking ? null : setTarget(null))}
        title="Request this sitting"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTarget(null)} disabled={booking}>
              Cancel
            </Button>
            <Button onClick={submitRequest} loading={booking} className="flex-1">
              Send request
            </Button>
          </>
        }
      >
        {target && (
          <div className="space-y-4">
            <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-3.5">
              <p className="font-semibold text-ink-900">{target.preceptor.full_name}</p>
              {/* The full address and a directions link — this is the point
                  where the abhyasi has to know how to get there. */}
              <PlaceLine place={target.place} showAddress className="mt-1" />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge tone="brand">{prettyDate(target.date)}</Badge>
                <span className="text-sm text-ink-700">
                  {formatTimeRange(target.start_time, target.end_time)}
                </span>
                <Badge tone={target.remaining === 1 ? 'amber' : 'green'}>
                  {target.remaining} of {target.capacity} left
                </Badge>
              </div>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-700">
                Note for the preceptor <span className="text-ink-400">(optional)</span>
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Anything they should know before your sitting"
                className="w-full rounded-xl border border-brand-200 bg-white px-3.5 py-2.5 text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </label>

            {bookError && (
              <p className="rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
                {bookError}
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* Asking for a time outside the schedule */}
      <Modal
        open={!!askTarget}
        onClose={() => (booking ? null : setAskTarget(null))}
        title="Ask for a time"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAskTarget(null)} disabled={booking}>
              Cancel
            </Button>
            <Button onClick={submitAsk} loading={booking} className="flex-1">
              Send request
            </Button>
          </>
        }
      >
        {askTarget && (
          <div className="space-y-4">
            <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-3.5">
              <p className="font-semibold text-ink-900">{askTarget.preceptor.full_name}</p>
              <p className="mt-1 inline-flex items-start gap-1.5 text-sm text-ink-600">
                <CalendarPlus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-500" />
                Takes requests outside their published schedule. They can accept the time you name
                or propose another, and they settle where to meet.
              </p>
              {profile?.phone && (
                <p className="mt-2 text-xs text-ink-500">
                  They will see your mobile number,{' '}
                  <span className="font-medium text-ink-700">{profile.phone}</span>, so they can
                  reach you.
                </p>
              )}
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-700">Day</span>
              <input
                type="date"
                value={askDate}
                min={dates[0].iso}
                onChange={(e) => setAskDate(e.target.value)}
                className="w-full rounded-xl border border-brand-200 bg-white px-3.5 py-2.5 text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </label>

            <div className="flex gap-3">
              <label className="block flex-1">
                <span className="mb-1.5 block text-sm font-medium text-ink-700">From</span>
                <input
                  type="time"
                  value={askStart}
                  onChange={(e) => pickAskStart(e.target.value)}
                  className="w-full rounded-xl border border-brand-200 bg-white px-3.5 py-2.5 text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </label>
              <label className="block flex-1">
                <span className="mb-1.5 block text-sm font-medium text-ink-700">To</span>
                <input
                  type="time"
                  value={askEnd}
                  onChange={(e) => setAskEnd(e.target.value)}
                  className="w-full rounded-xl border border-brand-200 bg-white px-3.5 py-2.5 text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-700">
                Note for the preceptor <span className="text-ink-400">(optional)</span>
              </span>
              <textarea
                value={askNote}
                onChange={(e) => setAskNote(e.target.value)}
                rows={3}
                placeholder="Anything they should know"
                className="w-full rounded-xl border border-brand-200 bg-white px-3.5 py-2.5 text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </label>

            {bookError && (
              <p className="rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
                {bookError}
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

// The database refuses a double booking, a full slot and a preceptor who
// does not take open requests; each deserves plainer words than it gives.
function requestErrorMessage(e: any): string {
  const code = e?.code as string | undefined
  const msg = (e?.message as string | undefined) ?? ''
  if (code === '23505' || /duplicate|unique/i.test(msg)) {
    return 'You already have a request or sitting at that time.'
  }
  if (/full/i.test(msg)) return 'This slot just filled up. Please choose another time.'
  if (/published schedule/i.test(msg)) {
    return 'This preceptor has stopped taking requests outside their schedule.'
  }
  return msg || 'Could not send your request. Please try again.'
}
