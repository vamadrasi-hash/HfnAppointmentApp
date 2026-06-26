import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Phone, Inbox, Info, Check, X, MapPin } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getMySittings, setBookingStatus } from '../lib/api'
import type { BookingDetail, BookingStatus } from '../lib/types'
import { Avatar, Badge, Button, Card, EmptyState, PageLoader, SectionTitle } from '../components/ui'
import { formatTimeRange, prettyDate, isPastDate } from '../lib/utils'

function statusTone(s: BookingStatus) {
  if (s === 'completed') return 'green' as const
  if (s === 'cancelled') return 'red' as const
  return 'brand' as const
}

function SittingCard({
  b,
  onStatus,
  busy,
}: {
  b: BookingDetail
  onStatus?: (b: BookingDetail, status: BookingStatus) => void
  busy: boolean
}) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <Avatar name={b.abhyasi?.full_name ?? '?'} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate font-semibold text-ink-900">
              {b.abhyasi?.full_name ?? 'Abhyasi'}
            </p>
            <Badge tone={statusTone(b.status)}>
              {b.status[0].toUpperCase() + b.status.slice(1)}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-500">
            {b.slot && <span>{formatTimeRange(b.slot.start_time, b.slot.end_time)}</span>}
            {b.center && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {b.center.name}
              </span>
            )}
          </div>
          {b.abhyasi?.phone && (
            <a
              href={`tel:${b.abhyasi.phone}`}
              className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-brand-600"
            >
              <Phone className="h-3.5 w-3.5" /> {b.abhyasi.phone}
            </a>
          )}
          {b.note && <p className="mt-2 text-sm text-ink-500">“{b.note}”</p>}
        </div>
      </div>

      {onStatus && b.status === 'confirmed' && (
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" onClick={() => onStatus(b, 'completed')} disabled={busy}>
            <Check className="h-4 w-4" /> Mark done
          </Button>
          <Button variant="danger" onClick={() => onStatus(b, 'cancelled')} disabled={busy}>
            <X className="h-4 w-4" /> Cancel
          </Button>
        </div>
      )}
    </Card>
  )
}

export default function MySittings() {
  const { user, profile } = useAuth()
  const isPreceptor = profile?.role === 'preceptor' || profile?.role === 'admin'

  const [items, setItems] = useState<BookingDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const data = await getMySittings(user.id)
      setItems(data)
    } catch (e: any) {
      setError(e.message ?? 'Could not load incoming sittings.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (isPreceptor) load()
    else setLoading(false)
  }, [isPreceptor, load])

  async function changeStatus(b: BookingDetail, status: BookingStatus) {
    setBusyId(b.id)
    try {
      await setBookingStatus(b.id, status)
      await load()
    } catch (e: any) {
      setError(e.message ?? 'Could not update the sitting.')
    } finally {
      setBusyId(null)
    }
  }

  if (!isPreceptor) {
    return (
      <div className="space-y-4">
        <h1 className="font-serif text-2xl text-ink-900">Incoming sittings</h1>
        <EmptyState
          icon={<Info className="h-8 w-8" />}
          title="For preceptors only"
          subtitle="This is where preceptors see who has booked a sitting with them."
          action={
            <Link to="/find">
              <Button variant="secondary">Find a sitting</Button>
            </Link>
          }
        />
      </div>
    )
  }

  if (loading) return <PageLoader label="Loading incoming sittings…" />

  // Upcoming confirmed bookings, grouped by date.
  const upcoming = items
    .filter((b) => b.status === 'confirmed' && !isPastDate(b.booking_date))
    .sort((a, b) => a.booking_date.localeCompare(b.booking_date))
  const earlier = items
    .filter((b) => b.status !== 'confirmed' || isPastDate(b.booking_date))
    .sort((a, b) => b.booking_date.localeCompare(a.booking_date))

  const upcomingDatesList = Array.from(new Set(upcoming.map((b) => b.booking_date)))

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl text-ink-900">Incoming sittings</h1>

      {error && (
        <p className="rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-8 w-8" />}
          title="No bookings yet"
          subtitle="When an abhyasi books one of your slots, they will show up here with their contact details."
        />
      ) : (
        <>
          <div className="space-y-5">
            <SectionTitle hint={`${upcoming.length}`}>Upcoming</SectionTitle>
            {upcoming.length === 0 ? (
              <p className="rounded-xl border border-dashed border-brand-200 bg-white/60 px-4 py-6 text-center text-sm text-ink-500">
                No upcoming bookings right now.
              </p>
            ) : (
              upcomingDatesList.map((d) => (
                <div key={d}>
                  <p className="mb-2 text-sm font-semibold text-ink-700">{prettyDate(d)}</p>
                  <div className="space-y-3">
                    {upcoming
                      .filter((b) => b.booking_date === d)
                      .map((b) => (
                        <SittingCard
                          key={b.id}
                          b={b}
                          onStatus={changeStatus}
                          busy={busyId === b.id}
                        />
                      ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {earlier.length > 0 && (
            <div>
              <SectionTitle hint={`${earlier.length}`}>Earlier</SectionTitle>
              <div className="space-y-3">
                {earlier.map((b) => (
                  <SittingCard key={b.id} b={b} busy={busyId === b.id} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
