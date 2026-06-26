import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  SlidersHorizontal,
  Navigation,
  X,
  CalendarDays,
  CheckCircle2,
  Search as SearchIcon,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  getZones,
  getCenters,
  getAreas,
  getCities,
  findPreceptors,
  createBooking,
  type SlotFilters,
} from '../lib/api'
import type { Zone, Center, Area, AvailableSlot, PreceptorWithSlots } from '../lib/types'
import { Button, Field, Select, PageLoader, EmptyState, Badge } from '../components/ui'
import { PreceptorCard } from '../components/PreceptorCard'
import { Modal } from '../components/Modal'
import { upcomingDates, prettyDate, formatTimeRange, dayShort, cx } from '../lib/utils'

type TimeBand = '' | 'morning' | 'afternoon' | 'evening'
const TIME_BANDS: Record<Exclude<TimeBand, ''>, { from: string; to: string }> = {
  morning: { from: '00:00', to: '11:59' },
  afternoon: { from: '12:00', to: '16:59' },
  evening: { from: '17:00', to: '23:59' },
}

interface BookingTarget {
  preceptor: PreceptorWithSlots['preceptor']
  center: PreceptorWithSlots['center']
  slot: AvailableSlot
}

export default function FindPreceptors() {
  const { user, profile } = useAuth()
  const dates = useMemo(() => upcomingDates(14), [])

  const [date, setDate] = useState(dates[0].iso)

  // Filter master data
  const [zones, setZones] = useState<Zone[]>([])
  const [centers, setCenters] = useState<Center[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [cities, setCities] = useState<string[]>([])

  const [zoneId, setZoneId] = useState('')
  const [centerId, setCenterId] = useState('')
  const [areaId, setAreaId] = useState('')
  const [city, setCity] = useState('')
  const [band, setBand] = useState<TimeBand>('')

  const [showFilters, setShowFilters] = useState(false)

  // Near me
  const [nearMe, setNearMe] = useState(false)
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null)
  const [geoMsg, setGeoMsg] = useState<string | null>(null)

  // Results
  const [results, setResults] = useState<PreceptorWithSlots[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Booking modal
  const [target, setTarget] = useState<BookingTarget | null>(null)
  const [note, setNote] = useState('')
  const [booking, setBooking] = useState(false)
  const [bookError, setBookError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Load filter sources once.
  useEffect(() => {
    getZones().then(setZones).catch(() => {})
    getCities().then(setCities).catch(() => {})
  }, [])

  useEffect(() => {
    setCenterId('')
    setAreaId('')
    setCenters([])
    setAreas([])
    if (!zoneId) return
    getCenters(zoneId).then(setCenters).catch(() => {})
  }, [zoneId])

  useEffect(() => {
    setAreaId('')
    setAreas([])
    if (!centerId) return
    getAreas(centerId).then(setAreas).catch(() => {})
  }, [centerId])

  const activeFilterCount =
    (zoneId ? 1 : 0) + (centerId ? 1 : 0) + (areaId ? 1 : 0) + (city ? 1 : 0) + (band ? 1 : 0)

  const runSearch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const filters: SlotFilters = {
        date,
        zoneId: zoneId || undefined,
        centerId: centerId || undefined,
        areaId: areaId || undefined,
        city: city || undefined,
        fromTime: band ? TIME_BANDS[band].from : undefined,
        toTime: band ? TIME_BANDS[band].to : undefined,
        origin: nearMe ? origin : null,
      }
      const data = await findPreceptors(filters)
      setResults(data)
    } catch (e: any) {
      setError(e.message ?? 'Could not load preceptors. Please try again.')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [date, zoneId, centerId, areaId, city, band, nearMe, origin])

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
        if (profile?.home_latitude != null && profile?.home_longitude != null) {
          setOrigin({ lat: profile.home_latitude, lng: profile.home_longitude })
          setNearMe(true)
          setGeoMsg('Using your saved home location.')
        } else {
          setGeoMsg('Couldn\u2019t get your location. Add it in your profile to sort by distance.')
        }
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  function clearFilters() {
    setZoneId('')
    setCenterId('')
    setAreaId('')
    setCity('')
    setBand('')
  }

  function openBooking(p: PreceptorWithSlots, slot: AvailableSlot) {
    setTarget({ preceptor: p.preceptor, center: p.center, slot })
    setNote('')
    setBookError(null)
  }

  async function confirmBooking() {
    if (!target || !user) return
    setBooking(true)
    setBookError(null)
    try {
      await createBooking({
        slotId: target.slot.id,
        abhyasiId: user.id,
        date,
        note: note.trim() || undefined,
      })
      setTarget(null)
      setSuccess(`Sitting booked with ${target.preceptor.full_name} on ${prettyDate(date)}.`)
      window.setTimeout(() => setSuccess(null), 6000)
      runSearch() // refresh remaining counts
    } catch (e: any) {
      const code = e?.code as string | undefined
      const msg = (e?.message as string | undefined) ?? ''
      if (code === '23505' || /duplicate|unique/i.test(msg)) {
        setBookError('You have already booked this slot for this date.')
      } else if (code === 'P0001' || /full/i.test(msg)) {
        setBookError('This slot just filled up. Please choose another time.')
      } else {
        setBookError(msg || 'Could not complete the booking. Please try again.')
      }
    } finally {
      setBooking(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl text-ink-900">Find a sitting</h1>
        <p className="mt-1 text-sm text-ink-500">
          Pick a day, then book an open time with a preceptor.
        </p>
      </div>

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

          <Field label="Zone">
            <Select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
              <option value="">All zones</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Center">
            <Select value={centerId} onChange={(e) => setCenterId(e.target.value)} disabled={!zoneId}>
              <option value="">{zoneId ? 'All centers' : 'Choose a zone first'}</option>
              {centers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.city}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Area">
            <Select value={areaId} onChange={(e) => setAreaId(e.target.value)} disabled={!centerId}>
              <option value="">{centerId ? 'All areas' : 'Choose a center first'}</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="City">
            <Select value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">All cities</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>

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
      ) : results.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-8 w-8" />}
          title="No open sittings"
          subtitle={`No preceptors are available on ${prettyDate(date)} with these filters. Try another day or widen your filters.`}
          action={
            activeFilterCount > 0 ? (
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink-500">
            {results.length} preceptor{results.length > 1 ? 's' : ''} available on{' '}
            <span className="font-medium text-ink-700">{prettyDate(date)}</span>
          </p>
          {results.map((p) => (
            <PreceptorCard
              key={p.preceptor.id}
              data={p}
              onBook={(slot) => openBooking(p, slot)}
            />
          ))}
        </div>
      )}

      {/* Booking confirmation */}
      <Modal
        open={!!target}
        onClose={() => (booking ? null : setTarget(null))}
        title="Confirm your sitting"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTarget(null)} disabled={booking}>
              Cancel
            </Button>
            <Button onClick={confirmBooking} loading={booking} className="flex-1">
              Confirm booking
            </Button>
          </>
        }
      >
        {target && (
          <div className="space-y-4">
            <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-3.5">
              <p className="font-semibold text-ink-900">{target.preceptor.full_name}</p>
              {target.center && (
                <p className="mt-0.5 text-sm text-ink-500">
                  {target.center.name}
                  {target.center.city ? `, ${target.center.city}` : ''}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge tone="brand">{prettyDate(date)}</Badge>
                <span className="text-sm text-ink-700">
                  {formatTimeRange(target.slot.start_time, target.slot.end_time)}
                </span>
                <Badge tone={target.slot.remaining === 1 ? 'amber' : 'green'}>
                  {target.slot.remaining} of {target.slot.capacity} left
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
    </div>
  )
}
