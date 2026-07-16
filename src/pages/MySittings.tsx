import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Phone, Inbox, Info, Check, X, MapPin, CalendarClock, UserX } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  getMySittings,
  confirmBooking,
  declineBooking,
  proposeAlternate,
  cancelBooking,
  markCompleted,
  markNoShow,
} from '../lib/api'
import type { BookingDetail } from '../lib/types'
import { Avatar, Badge, Button, Card, EmptyState, PageLoader, SectionTitle } from '../components/ui'
import { Modal } from '../components/Modal'
import { formatTimeRange, formatTime, prettyDate, isPastDate, statusLabel, statusTone } from '../lib/utils'

function SittingCard({
  b,
  busy,
  onConfirm,
  onDecline,
  onPropose,
  onCancel,
  onComplete,
  onNoShow,
}: {
  b: BookingDetail
  busy: boolean
  onConfirm?: (b: BookingDetail) => void
  onDecline?: (b: BookingDetail) => void
  onPropose?: (b: BookingDetail) => void
  onCancel?: (b: BookingDetail) => void
  onComplete?: (b: BookingDetail) => void
  onNoShow?: (b: BookingDetail) => void
}) {
  const isRequested = b.status === 'requested'
  const isLiveConfirmed = b.status === 'confirmed' || b.status === 'reminded'
  const isAlternate = b.status === 'alternate_proposed'

  return (
    <Card>
      <div className="flex items-start gap-3">
        <Avatar name={b.abhyasi?.full_name ?? '?'} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate font-semibold text-ink-900">
              {b.abhyasi?.full_name ?? 'Abhyasi'}
            </p>
            <Badge tone={statusTone(b.status)}>{statusLabel(b.status)}</Badge>
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
          {isAlternate && b.alternate_date && (
            <p className="mt-2 rounded-lg bg-gold-100/60 px-3 py-2 text-sm text-gold-600">
              Waiting for {b.abhyasi?.full_name ?? 'the abhyasi'} to accept your proposed time:{' '}
              <span className="font-semibold">
                {prettyDate(b.alternate_date)}
                {b.alternate_start_time ? `, ${formatTime(b.alternate_start_time)}` : ''}
              </span>
            </p>
          )}
        </div>
      </div>

      {isRequested && onConfirm && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => onConfirm(b)} disabled={busy} className="flex-1">
            <Check className="h-4 w-4" /> Confirm
          </Button>
          <Button variant="secondary" onClick={() => onPropose?.(b)} disabled={busy}>
            <CalendarClock className="h-4 w-4" /> New time
          </Button>
          <Button variant="danger" onClick={() => onDecline?.(b)} disabled={busy}>
            <X className="h-4 w-4" /> Decline
          </Button>
        </div>
      )}

      {isLiveConfirmed && onComplete && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => onComplete(b)} disabled={busy}>
            <Check className="h-4 w-4" /> Mark done
          </Button>
          <Button variant="ghost" onClick={() => onNoShow?.(b)} disabled={busy}>
            <UserX className="h-4 w-4" /> No-show
          </Button>
          <Button variant="danger" onClick={() => onCancel?.(b)} disabled={busy}>
            Cancel
          </Button>
        </div>
      )}

      {isAlternate && onCancel && (
        <div className="mt-3">
          <Button variant="danger" onClick={() => onCancel(b)} disabled={busy}>
            Withdraw / cancel
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

  // Modals
  const [declineTarget, setDeclineTarget] = useState<BookingDetail | null>(null)
  const [declineReason, setDeclineReason] = useState('')
  const [proposeTarget, setProposeTarget] = useState<BookingDetail | null>(null)
  const [altDate, setAltDate] = useState('')
  const [altStart, setAltStart] = useState('')
  const [altEnd, setAltEnd] = useState('')

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

  function openDecline(b: BookingDetail) {
    setDeclineReason('')
    setDeclineTarget(b)
  }
  async function submitDecline() {
    if (!declineTarget) return
    const b = declineTarget
    setDeclineTarget(null)
    await run(b.id, () => declineBooking(b.id, declineReason))
  }

  function openPropose(b: BookingDetail) {
    setAltDate(b.booking_date)
    setAltStart(b.slot?.start_time?.slice(0, 5) ?? '')
    setAltEnd(b.slot?.end_time?.slice(0, 5) ?? '')
    setProposeTarget(b)
  }
  async function submitPropose() {
    if (!proposeTarget || !altDate || !altStart) return
    const b = proposeTarget
    setProposeTarget(null)
    await run(b.id, () =>
      proposeAlternate(b.id, { date: altDate, startTime: altStart, endTime: altEnd || undefined }),
    )
  }

  if (!isPreceptor) {
    return (
      <div className="space-y-4">
        <h1 className="font-serif text-2xl text-ink-900">Incoming sittings</h1>
        <EmptyState
          icon={<Info className="h-8 w-8" />}
          title="For preceptors only"
          subtitle="This is where preceptors see and confirm the sittings people request with them."
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

  const requested = items
    .filter((b) => b.status === 'requested')
    .sort((a, b) => a.booking_date.localeCompare(b.booking_date))

  const upcoming = items
    .filter(
      (b) =>
        (b.status === 'confirmed' || b.status === 'reminded' || b.status === 'alternate_proposed') &&
        !isPastDate(b.booking_date),
    )
    .sort((a, b) => a.booking_date.localeCompare(b.booking_date))

  const requestedOrUpcomingIds = new Set([...requested, ...upcoming].map((b) => b.id))
  const earlier = items
    .filter((b) => !requestedOrUpcomingIds.has(b.id))
    .sort((a, b) => b.booking_date.localeCompare(a.booking_date))

  const upcomingDatesList = Array.from(new Set(upcoming.map((b) => b.booking_date)))

  const handlers = {
    onConfirm: (b: BookingDetail) => run(b.id, () => confirmBooking(b.id)),
    onDecline: openDecline,
    onPropose: openPropose,
    onCancel: (b: BookingDetail) => run(b.id, () => cancelBooking(b.id)),
    onComplete: (b: BookingDetail) => run(b.id, () => markCompleted(b.id)),
    onNoShow: (b: BookingDetail) => run(b.id, () => markNoShow(b.id)),
  }

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
          title="No requests yet"
          subtitle="When an abhyasi requests one of your slots, it will show up here for you to confirm."
        />
      ) : (
        <>
          {requested.length > 0 && (
            <div className="space-y-3">
              <SectionTitle hint={`${requested.length}`}>Needs your response</SectionTitle>
              {requested.map((b) => (
                <SittingCard key={b.id} b={b} busy={busyId === b.id} {...handlers} />
              ))}
            </div>
          )}

          <div className="space-y-5">
            <SectionTitle hint={`${upcoming.length}`}>Upcoming</SectionTitle>
            {upcoming.length === 0 ? (
              <p className="rounded-xl border border-dashed border-brand-200 bg-white/60 px-4 py-6 text-center text-sm text-ink-500">
                No upcoming confirmed sittings.
              </p>
            ) : (
              upcomingDatesList.map((d) => (
                <div key={d}>
                  <p className="mb-2 text-sm font-semibold text-ink-700">{prettyDate(d)}</p>
                  <div className="space-y-3">
                    {upcoming
                      .filter((b) => b.booking_date === d)
                      .map((b) => (
                        <SittingCard key={b.id} b={b} busy={busyId === b.id} {...handlers} />
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

      {/* Decline modal */}
      <Modal
        open={!!declineTarget}
        onClose={() => setDeclineTarget(null)}
        title="Decline this request?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeclineTarget(null)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={submitDecline} className="flex-1">
              Decline request
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-ink-600">
            {declineTarget?.abhyasi?.full_name ?? 'The abhyasi'} will be told their request was
            declined. A short reason helps them understand why.
          </p>
          <textarea
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            rows={3}
            placeholder="Reason (optional) — e.g. not available that day"
            className="w-full rounded-xl border border-brand-200 bg-white px-3.5 py-2.5 text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </Modal>

      {/* Propose alternate modal */}
      <Modal
        open={!!proposeTarget}
        onClose={() => setProposeTarget(null)}
        title="Propose a different time"
        footer={
          <>
            <Button variant="ghost" onClick={() => setProposeTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={submitPropose}
              disabled={!altDate || !altStart}
              className="flex-1"
            >
              Send proposal
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-ink-600">
            Suggest a new date and time. {proposeTarget?.abhyasi?.full_name ?? 'The abhyasi'} can
            accept or decline it.
          </p>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-700">Date</span>
            <input
              type="date"
              value={altDate}
              onChange={(e) => setAltDate(e.target.value)}
              className="w-full rounded-xl border border-brand-200 bg-white px-3.5 py-2.5 text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </label>
          <div className="flex gap-3">
            <label className="block flex-1">
              <span className="mb-1.5 block text-sm font-medium text-ink-700">From</span>
              <input
                type="time"
                value={altStart}
                onChange={(e) => setAltStart(e.target.value)}
                className="w-full rounded-xl border border-brand-200 bg-white px-3.5 py-2.5 text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </label>
            <label className="block flex-1">
              <span className="mb-1.5 block text-sm font-medium text-ink-700">To</span>
              <input
                type="time"
                value={altEnd}
                onChange={(e) => setAltEnd(e.target.value)}
                className="w-full rounded-xl border border-brand-200 bg-white px-3.5 py-2.5 text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </label>
          </div>
        </div>
      </Modal>
    </div>
  )
}
