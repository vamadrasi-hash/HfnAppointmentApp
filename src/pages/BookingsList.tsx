import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarX2, MapPin, Search } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getMyBookings, cancelBooking } from '../lib/api'
import type { BookingDetail } from '../lib/types'
import { Badge, Button, Card, EmptyState, PageLoader, SectionTitle } from '../components/ui'
import { Modal } from '../components/Modal'
import { formatTimeRange, prettyDate, isPastDate } from '../lib/utils'

function statusTone(s: BookingDetail['status']) {
  if (s === 'completed') return 'green' as const
  if (s === 'cancelled') return 'red' as const
  return 'brand' as const
}

function BookingRow({
  b,
  onCancel,
}: {
  b: BookingDetail
  onCancel?: (b: BookingDetail) => void
}) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink-900">
            {b.preceptor?.full_name ?? 'Preceptor'}
          </p>
          {b.center && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-sm text-ink-500">
              <MapPin className="h-3.5 w-3.5" />
              {b.center.name}
              {b.center.city ? `, ${b.center.city}` : ''}
            </p>
          )}
        </div>
        <Badge tone={statusTone(b.status)}>
          {b.status[0].toUpperCase() + b.status.slice(1)}
        </Badge>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <Badge tone="neutral">{prettyDate(b.booking_date)}</Badge>
        {b.slot && (
          <span className="text-ink-600">
            {formatTimeRange(b.slot.start_time, b.slot.end_time)}
          </span>
        )}
      </div>

      {b.note && <p className="mt-2 text-sm text-ink-500">“{b.note}”</p>}

      {onCancel && b.status === 'confirmed' && (
        <div className="mt-3">
          <Button variant="danger" onClick={() => onCancel(b)}>
            Cancel sitting
          </Button>
        </div>
      )}
    </Card>
  )
}

export default function BookingsList() {
  const { user } = useAuth()
  const [items, setItems] = useState<BookingDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [toCancel, setToCancel] = useState<BookingDetail | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const data = await getMyBookings(user.id)
      setItems(data)
    } catch (e: any) {
      setError(e.message ?? 'Could not load your sittings.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  async function doCancel() {
    if (!toCancel) return
    setCancelling(true)
    try {
      await cancelBooking(toCancel.id)
      setToCancel(null)
      await load()
    } catch (e: any) {
      setError(e.message ?? 'Could not cancel the sitting.')
      setToCancel(null)
    } finally {
      setCancelling(false)
    }
  }

  if (loading) return <PageLoader label="Loading your sittings…" />

  const upcoming = items
    .filter((b) => b.status === 'confirmed' && !isPastDate(b.booking_date))
    .sort((a, b) => a.booking_date.localeCompare(b.booking_date))
  const past = items
    .filter((b) => b.status !== 'confirmed' || isPastDate(b.booking_date))
    .sort((a, b) => b.booking_date.localeCompare(a.booking_date))

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl text-ink-900">My sittings</h1>

      {error && (
        <p className="rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<CalendarX2 className="h-8 w-8" />}
          title="No sittings yet"
          subtitle="When you book a sitting with a preceptor, it will appear here."
          action={
            <Link to="/find">
              <Button>
                <Search className="h-4 w-4" /> Find a sitting
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          <div>
            <SectionTitle hint={`${upcoming.length}`}>Upcoming</SectionTitle>
            {upcoming.length === 0 ? (
              <p className="rounded-xl border border-dashed border-brand-200 bg-white/60 px-4 py-6 text-center text-sm text-ink-500">
                No upcoming sittings.{' '}
                <Link to="/find" className="font-medium text-brand-600">
                  Book one
                </Link>
                .
              </p>
            ) : (
              <div className="space-y-3">
                {upcoming.map((b) => (
                  <BookingRow key={b.id} b={b} onCancel={setToCancel} />
                ))}
              </div>
            )}
          </div>

          {past.length > 0 && (
            <div>
              <SectionTitle hint={`${past.length}`}>Past &amp; cancelled</SectionTitle>
              <div className="space-y-3">
                {past.map((b) => (
                  <BookingRow key={b.id} b={b} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <Modal
        open={!!toCancel}
        onClose={() => (cancelling ? null : setToCancel(null))}
        title="Cancel this sitting?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setToCancel(null)} disabled={cancelling}>
              Keep it
            </Button>
            <Button variant="danger" onClick={doCancel} loading={cancelling} className="flex-1">
              Yes, cancel
            </Button>
          </>
        }
      >
        {toCancel && (
          <p className="text-sm text-ink-600">
            Your sitting with{' '}
            <span className="font-medium text-ink-900">{toCancel.preceptor?.full_name}</span> on{' '}
            <span className="font-medium text-ink-900">{prettyDate(toCancel.booking_date)}</span>{' '}
            will be released so someone else can book it.
          </p>
        )}
      </Modal>
    </div>
  )
}
