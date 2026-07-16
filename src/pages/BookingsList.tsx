import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarX2, MapPin, Search, Check, X, Clock } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getMyBookings, cancelBooking, acceptAlternate, rejectAlternate } from '../lib/api'
import type { BookingDetail } from '../lib/types'
import { Badge, Button, Card, EmptyState, PageLoader, SectionTitle } from '../components/ui'
import { Modal } from '../components/Modal'
import {
  formatTimeRange,
  formatTime,
  prettyDate,
  isPastDate,
  statusLabel,
  statusTone,
} from '../lib/utils'

function BookingRow({
  b,
  onCancel,
  onAccept,
  onReject,
  busy,
}: {
  b: BookingDetail
  onCancel?: (b: BookingDetail) => void
  onAccept?: (b: BookingDetail) => void
  onReject?: (b: BookingDetail) => void
  busy: boolean
}) {
  const canCancel = b.status === 'requested' || b.status === 'confirmed' || b.status === 'reminded'
  const isAlternate = b.status === 'alternate_proposed'
  const reason = b.decline_reason || b.cancel_reason

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
        <Badge tone={statusTone(b.status)}>{statusLabel(b.status)}</Badge>
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

      {reason && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">Reason: {reason}</p>
      )}

      {isAlternate && b.alternate_date && (
        <div className="mt-3 rounded-xl border border-gold-200 bg-gold-100/40 p-3">
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-gold-600">
            <Clock className="h-4 w-4" /> New time proposed
          </p>
          <p className="mt-1 text-sm text-ink-700">
            {prettyDate(b.alternate_date)}
            {b.alternate_start_time
              ? `, ${
                  b.alternate_end_time
                    ? formatTimeRange(b.alternate_start_time, b.alternate_end_time)
                    : formatTime(b.alternate_start_time)
                }`
              : ''}
          </p>
          <div className="mt-3 flex gap-2">
            <Button onClick={() => onAccept?.(b)} disabled={busy} className="flex-1">
              <Check className="h-4 w-4" /> Accept
            </Button>
            <Button variant="danger" onClick={() => onReject?.(b)} disabled={busy}>
              <X className="h-4 w-4" /> Decline
            </Button>
          </div>
        </div>
      )}

      {canCancel && onCancel && (
        <div className="mt-3">
          <Button variant="danger" onClick={() => onCancel(b)} disabled={busy}>
            {b.status === 'requested' ? 'Withdraw request' : 'Cancel sitting'}
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
  const [busyId, setBusyId] = useState<string | null>(null)

  const [toCancel, setToCancel] = useState<BookingDetail | null>(null)
  const [cancelReason, setCancelReason] = useState('')
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

  async function run(id: string, fn: () => Promise<void>) {
    setBusyId(id)
    setError(null)
    try {
      await fn()
      await load()
    } catch (e: any) {
      setError(e.message ?? 'Could not update the sitting.')
    } finally {
      setBusyId(null)
    }
  }

  function openCancel(b: BookingDetail) {
    setCancelReason('')
    setToCancel(b)
  }

  async function doCancel() {
    if (!toCancel) return
    setCancelling(true)
    try {
      await cancelBooking(toCancel.id, cancelReason)
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

  const liveUpcoming = items
    .filter(
      (b) =>
        ['requested', 'confirmed', 'reminded', 'alternate_proposed'].includes(b.status) &&
        !isPastDate(b.booking_date),
    )
    .sort((a, b) => a.booking_date.localeCompare(b.booking_date))
  const liveIds = new Set(liveUpcoming.map((b) => b.id))
  const past = items
    .filter((b) => !liveIds.has(b.id))
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
          subtitle="When you request a sitting with a preceptor, it will appear here."
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
            <SectionTitle hint={`${liveUpcoming.length}`}>Upcoming</SectionTitle>
            {liveUpcoming.length === 0 ? (
              <p className="rounded-xl border border-dashed border-brand-200 bg-white/60 px-4 py-6 text-center text-sm text-ink-500">
                No upcoming sittings.{' '}
                <Link to="/find" className="font-medium text-brand-600">
                  Request one
                </Link>
                .
              </p>
            ) : (
              <div className="space-y-3">
                {liveUpcoming.map((b) => (
                  <BookingRow
                    key={b.id}
                    b={b}
                    busy={busyId === b.id}
                    onCancel={openCancel}
                    onAccept={(x) => run(x.id, () => acceptAlternate(x.id, x.alternate_date!))}
                    onReject={(x) => run(x.id, () => rejectAlternate(x.id))}
                  />
                ))}
              </div>
            )}
          </div>

          {past.length > 0 && (
            <div>
              <SectionTitle hint={`${past.length}`}>Past &amp; closed</SectionTitle>
              <div className="space-y-3">
                {past.map((b) => (
                  <BookingRow key={b.id} b={b} busy={busyId === b.id} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <Modal
        open={!!toCancel}
        onClose={() => (cancelling ? null : setToCancel(null))}
        title={toCancel?.status === 'requested' ? 'Withdraw this request?' : 'Cancel this sitting?'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setToCancel(null)} disabled={cancelling}>
              Keep it
            </Button>
            <Button variant="danger" onClick={doCancel} loading={cancelling} className="flex-1">
              {toCancel?.status === 'requested' ? 'Yes, withdraw' : 'Yes, cancel'}
            </Button>
          </>
        }
      >
        {toCancel && (
          <div className="space-y-3">
            <p className="text-sm text-ink-600">
              Your sitting with{' '}
              <span className="font-medium text-ink-900">{toCancel.preceptor?.full_name}</span> on{' '}
              <span className="font-medium text-ink-900">{prettyDate(toCancel.booking_date)}</span>{' '}
              will be released so someone else can book it.
            </p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={2}
              placeholder="Reason (optional)"
              className="w-full rounded-xl border border-brand-200 bg-white px-3.5 py-2.5 text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
        )}
      </Modal>
    </div>
  )
}
