import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Phone,
  Inbox,
  Info,
  Check,
  Copy,
  X,
  CalendarClock,
  CalendarPlus,
  Clock3,
  MessageCircle,
  Users,
  UserX,
} from 'lucide-react'
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
import { isApprovedPreceptor, isPendingPreceptor, isPreceptorRole } from '../lib/roles'
import { Avatar, Badge, Button, Card, EmptyState, PageLoader, SectionTitle } from '../components/ui'
import { Modal } from '../components/Modal'
import { PlaceLine } from '../components/PlaceLine'
import { CANCELLATION_REASONS, buildCancellationMessage } from '../lib/cancellation'
import { HOME_PLACE_NAME, placeSummary } from '../lib/place'
import { copyText, whatsappNumber, whatsappShareUrl } from '../lib/share'
import {
  DEFAULT_SITTING_MINUTES,
  addMinutesToTime,
  bookingTimes,
  durationMinutes,
  formatTimeRange,
  formatTime,
  partySize,
  peopleLabel,
  prettyDate,
  isPastDate,
  statusLabel,
  statusTone,
} from '../lib/utils'

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
  /** `people` is how many the preceptor is letting come, when they trim a party. */
  onConfirm?: (b: BookingDetail, people?: number) => void
  onDecline?: (b: BookingDetail) => void
  onPropose?: (b: BookingDetail) => void
  onCancel?: (b: BookingDetail) => void
  onComplete?: (b: BookingDetail) => void
  onNoShow?: (b: BookingDetail) => void
}) {
  const isRequested = b.status === 'requested'
  const isLiveConfirmed = b.status === 'confirmed' || b.status === 'reminded'
  const isAlternate = b.status === 'alternate_proposed'
  // A request for a time this preceptor never published: it has no slot,
  // so it carries its own time and no place.
  const isOpenRequest = !b.slot_id
  const times = bookingTimes(b)

  // Who is coming. More than this sitting was opened for is a question
  // for the preceptor rather than a refusal — they say how many may come.
  const party = partySize(b)
  const allowed = b.slot?.capacity ?? null
  const tooMany = allowed != null && party > allowed
  const asked = b.requested_accompanying_count == null ? null : b.requested_accompanying_count + 1
  const trimmed = asked != null && asked > party

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
          <div className="mt-1 text-sm text-ink-500">
            {times && <span>{formatTimeRange(times.start, times.end)}</span>}
            <PlaceLine place={b.place} className="mt-0.5" />
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {b.session_type && <Badge tone="neutral">{b.session_type.name}</Badge>}
              {party > 1 && (
                <Badge tone={tooMany ? 'amber' : 'brand'}>
                  <Users className="h-3 w-3" /> {peopleLabel(party)}
                </Badge>
              )}
            </div>
            {trimmed && (
              <p className="mt-1 text-xs text-ink-400">
                They asked for {peopleLabel(asked!)}; {peopleLabel(party)} approved.
              </p>
            )}
            {isOpenRequest && (
              <p className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-gold-100/60 px-2.5 py-1 text-xs text-gold-600">
                <CalendarPlus className="h-3 w-3" />
                {isRequested
                  ? 'Asked for outside your schedule — confirm this time or propose another, and agree the place when you do.'
                  : 'Asked for outside your schedule.'}
              </p>
            )}
          </div>
          {/* The abhyasi's mobile, so an out-of-schedule time can be
              settled with a call rather than a round of messages. */}
          {b.abhyasi?.phone ? (
            <a
              href={`tel:${b.abhyasi.phone}`}
              className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1 text-sm font-medium text-brand-700 hover:bg-brand-100"
            >
              <Phone className="h-3.5 w-3.5" /> {b.abhyasi.phone}
            </a>
          ) : (
            <p className="mt-1.5 text-xs text-ink-400">No mobile number on their profile.</p>
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

      {isRequested && onConfirm && tooMany && (
        <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50/70 p-3">
          <p className="inline-flex items-start gap-2 text-sm text-amber-800">
            <Users className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              This sitting is for {peopleLabel(allowed!)}, and{' '}
              {b.abhyasi?.full_name ?? 'the abhyasi'} has asked to bring {peopleLabel(party)}. Let
              them all come, or approve the {allowed} you opened.
            </span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => onConfirm(b, party)} disabled={busy} className="flex-1">
              <Check className="h-4 w-4" /> Confirm all {party}
            </Button>
            <Button variant="secondary" onClick={() => onConfirm(b, allowed!)} disabled={busy}>
              Confirm {allowed} only
            </Button>
          </div>
        </div>
      )}

      {isRequested && onConfirm && (
        <div className="mt-3 flex flex-wrap gap-2">
          {!tooMany && (
            <Button onClick={() => onConfirm(b)} disabled={busy} className="flex-1">
              <Check className="h-4 w-4" /> Confirm
            </Button>
          )}
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
  // Nobody can request a sitting with a preceptor who is still waiting on
  // an administrator, so there is nothing incoming to show them yet.
  const canGiveSittings = isApprovedPreceptor(profile)
  const awaitingApproval = isPendingPreceptor(profile)
  const isPreceptor = isPreceptorRole(profile)

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

  // Cancelling a sitting: the message the preceptor writes, and then
  // sending that same message on to the abhyasi over WhatsApp.
  const [cancelTarget, setCancelTarget] = useState<BookingDetail | null>(null)
  const [cancelEn, setCancelEn] = useState('')
  const [cancelHi, setCancelHi] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [sendTarget, setSendTarget] = useState<{ b: BookingDetail; text: string } | null>(null)
  const [copied, setCopied] = useState(false)

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
    if (canGiveSittings) load()
    else setLoading(false)
  }, [canGiveSittings, load])

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
    const t = bookingTimes(b)
    setAltDate(b.booking_date)
    setAltStart(t?.start.slice(0, 5) ?? '')
    setAltEnd(t?.end.slice(0, 5) ?? '')
    setProposeTarget(b)
  }

  // Same rule as the schedule form: the end follows the start, keeping
  // whatever length is already there.
  function pickAltStart(start: string) {
    const span = durationMinutes(altStart, altEnd) || DEFAULT_SITTING_MINUTES
    setAltStart(start)
    setAltEnd(addMinutesToTime(start, span))
  }
  async function submitPropose() {
    if (!proposeTarget || !altDate || !altStart) return
    const b = proposeTarget
    setProposeTarget(null)
    await run(b.id, () =>
      proposeAlternate(b.id, { date: altDate, startTime: altStart, endTime: altEnd || undefined }),
    )
  }

  // ---- Cancelling, and saying why ------------------------------------
  function openCancel(b: BookingDetail) {
    setCancelEn('')
    setCancelHi('')
    setCancelTarget(b)
  }

  // Both boxes at once, so a preceptor who picks a common reason never has
  // to write the Hindi themselves.
  function pickReason(reason: { en: string; hi: string }) {
    setCancelEn(reason.en)
    setCancelHi(reason.hi)
  }

  /** The cancellation as one message — the same words the abhyasi is sent. */
  function cancellationText(b: BookingDetail, en: string, hi: string): string {
    const times = bookingTimes(b)
    // This screen calls a home sitting "My home"; the message is read by
    // the abhyasi, to whom it is the preceptor's.
    const place = b.place
      ? placeSummary({
          ...b.place,
          name: b.place.type === 'home' ? HOME_PLACE_NAME : b.place.name,
        })
      : null
    return buildCancellationMessage({
      seekerName: b.abhyasi?.full_name,
      preceptorName: b.preceptor?.full_name ?? profile?.full_name,
      date: b.booking_date,
      startTime: times?.start,
      endTime: times?.end,
      placeName: place,
      sessionType: b.session_type,
      messageEn: en,
      messageHi: hi,
    })
  }

  async function submitCancel() {
    if (!cancelTarget || !cancelEn.trim()) return
    const b = cancelTarget
    setCancelling(true)
    setError(null)
    try {
      await cancelBooking(b.id, cancelEn, cancelHi)
      // Straight on to sending it: the abhyasi has the notification
      // already, and this is the message that reaches their phone.
      setCancelTarget(null)
      setCopied(false)
      setSendTarget({ b, text: cancellationText(b, cancelEn, cancelHi) })
      await load()
    } catch (e: any) {
      setError(e.message ?? 'Could not cancel the sitting.')
      setCancelTarget(null)
    } finally {
      setCancelling(false)
    }
  }

  async function copyCancellation() {
    if (!sendTarget) return
    setCopied(await copyText(sendTarget.text))
    window.setTimeout(() => setCopied(false), 2500)
  }

  // The text goes to the clipboard as well as into the link, so a phone
  // that opens WhatsApp without the draft still has it to paste.
  async function sendOnWhatsApp() {
    if (!sendTarget) return
    await copyText(sendTarget.text)
    window.open(
      whatsappShareUrl(sendTarget.text, sendTarget.b.abhyasi?.phone),
      '_blank',
      'noopener,noreferrer',
    )
  }

  if (!canGiveSittings) {
    return (
      <div className="space-y-4">
        <h1 className="font-serif text-2xl text-ink-900">Incoming sittings</h1>
        <EmptyState
          icon={awaitingApproval ? <Clock3 className="h-8 w-8" /> : <Info className="h-8 w-8" />}
          title={
            awaitingApproval
              ? 'Waiting for approval'
              : isPreceptor
                ? 'Your preceptor account was not approved'
                : 'For preceptors only'
          }
          subtitle={
            awaitingApproval
              ? 'Requests can only reach you once an administrator has approved your preceptor account.'
              : isPreceptor
                ? 'You can still book sittings with other preceptors. If you believe this is a mistake, speak to your center’s coordinator.'
                : 'This is where preceptors see and confirm the sittings people request with them.'
          }
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
    // `people` arrives when the preceptor trims a party to what the
    // sitting holds; the abhyasi themselves is one of them.
    onConfirm: (b: BookingDetail, people?: number) =>
      run(b.id, () =>
        confirmBooking(b.id, people == null ? {} : { accompanying: Math.max(0, people - 1) }),
      ),
    onDecline: openDecline,
    onPropose: openPropose,
    onCancel: openCancel,
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

      {/* Cancelling: the message the abhyasi is sent, word for word */}
      <Modal
        open={!!cancelTarget}
        onClose={() => (cancelling ? null : setCancelTarget(null))}
        title="Cancel this sitting?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelTarget(null)} disabled={cancelling}>
              Keep it
            </Button>
            <Button
              variant="danger"
              onClick={submitCancel}
              loading={cancelling}
              disabled={!cancelEn.trim()}
              className="flex-1"
            >
              Cancel &amp; write to them
            </Button>
          </>
        }
      >
        {cancelTarget && (
          <div className="space-y-3">
            <p className="text-sm text-ink-600">
              {cancelTarget.abhyasi?.full_name ?? 'The abhyasi'} is told exactly what you write
              here — in the app, and in the WhatsApp message you send next.
            </p>

            <div className="flex flex-wrap gap-1.5">
              {CANCELLATION_REASONS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => pickReason(r)}
                  className="rounded-full border border-brand-200 bg-white px-3 py-1 text-xs text-ink-600 transition-colors hover:border-brand-400 hover:bg-brand-50"
                >
                  {r.en}
                </button>
              ))}
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-700">
                Your message (English)
              </span>
              <textarea
                value={cancelEn}
                onChange={(e) => setCancelEn(e.target.value)}
                rows={3}
                placeholder="Why the sitting cannot happen"
                className="w-full rounded-xl border border-brand-200 bg-white px-3.5 py-2.5 text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-700">
                वही संदेश हिंदी में <span className="text-ink-400">(optional)</span>
              </span>
              <textarea
                value={cancelHi}
                onChange={(e) => setCancelHi(e.target.value)}
                rows={3}
                placeholder="सिटिंग रद्द होने का कारण"
                className="w-full rounded-xl border border-brand-200 bg-white px-3.5 py-2.5 text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
              <span className="mt-1 block text-xs text-ink-400">
                Tap a reason above to fill both boxes. Left empty, your English words are sent under
                the Hindi heading rather than translated by guesswork.
              </span>
            </label>
          </div>
        )}
      </Modal>

      {/* Sending that message on WhatsApp */}
      <Modal
        open={!!sendTarget}
        onClose={() => setSendTarget(null)}
        title="Send it on WhatsApp"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSendTarget(null)}>
              Done
            </Button>
            <Button
              onClick={sendOnWhatsApp}
              className="flex-1 border-transparent bg-[#25D366] text-white shadow-soft hover:bg-[#1da851] active:bg-[#128C7E]"
            >
              <MessageCircle className="h-4 w-4" /> Send on WhatsApp
            </Button>
          </>
        }
      >
        {sendTarget && (
          <div className="space-y-3">
            <p className="text-sm text-ink-600">
              The sitting is cancelled and {sendTarget.b.abhyasi?.full_name ?? 'the abhyasi'} has
              been notified. Here is the same message for WhatsApp, in English and Hindi.
            </p>

            <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-brand-100 bg-brand-50/50 px-3.5 py-2.5 font-sans text-xs leading-relaxed text-ink-600">
              {sendTarget.text}
            </pre>

            {whatsappNumber(sendTarget.b.abhyasi?.phone) ? (
              <p className="inline-flex items-center gap-1.5 text-xs text-ink-500">
                <Phone className="h-3.5 w-3.5 text-brand-500" />
                Opens the chat with {sendTarget.b.abhyasi?.phone}, message ready to send.
              </p>
            ) : (
              <p className="text-xs text-amber-700">
                {sendTarget.b.abhyasi?.full_name ?? 'This abhyasi'} has no phone number on their
                profile, so WhatsApp will ask you which chat to send it to. The message is copied
                either way.
              </p>
            )}

            <Button variant="secondary" full onClick={copyCancellation}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy the message'}
            </Button>
          </div>
        )}
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
                onChange={(e) => pickAltStart(e.target.value)}
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
