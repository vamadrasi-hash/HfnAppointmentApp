import { MapPin, Navigation, Clock, CalendarPlus, CalendarClock } from 'lucide-react'
import type { AvailableSlot, PreceptorWithSlots } from '../lib/types'
import { Avatar, Badge, Card } from './ui'
import { PlaceLine } from './PlaceLine'
import { formatTimeRange, prettyDate, cx } from '../lib/utils'

export function PreceptorCard({
  data,
  onBook,
  onAskTime,
  /**
   * In the by-area list the day the seeker picked is not the point — the
   * preceptor's soonest free time is, whichever day it falls on.
   */
  showNextAvailable = false,
}: {
  data: PreceptorWithSlots
  onBook: (slot: AvailableSlot) => void
  /** Ask for a time this preceptor never published. */
  onAskTime?: (p: PreceptorWithSlots) => void
  showNextAvailable?: boolean
}) {
  const { preceptor, center, distanceKm, distanceApprox, slots, openToRequests, nextAvailable } =
    data

  const onDay = !showNextAvailable && slots.length > 0
  const showNext = showNextAvailable && !!nextAvailable
  const canAsk = openToRequests && !!onAskTime

  return (
    <Card>
      <div className="flex items-start gap-3">
        <Avatar name={preceptor.full_name} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink-900">{preceptor.full_name}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-500">
            {center && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {center.name}
                {center.city ? `, ${center.city}` : ''}
              </span>
            )}
            {distanceKm != null && (
              <span
                className="inline-flex items-center gap-1 text-brand-600"
                // A home sitting is placed to the nearest kilometre or so,
                // so its distance is rounded rather than precise.
                title={distanceApprox ? 'Approximate — a home address is kept private' : undefined}
              >
                <Navigation className="h-3.5 w-3.5" />
                {distanceApprox
                  ? `~${Math.max(1, Math.round(distanceKm))} km`
                  : `${distanceKm < 1 ? '<1' : distanceKm.toFixed(1)} km`}
              </span>
            )}
          </div>
          {openToRequests && (
            <div className="mt-1.5">
              <Badge tone="gold">Open to requests any time</Badge>
            </div>
          )}
        </div>
      </div>

      {onDay && (
        <>
          <div className="mt-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-400">
            <Clock className="h-3.5 w-3.5" /> Available times
          </div>
          <div className="mt-2 grid gap-2">
            {slots.map((slot) => (
              <SlotButton key={slot.id} slot={slot} onBook={onBook} />
            ))}
          </div>
        </>
      )}

      {showNext && (
        <>
          <div className="mt-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-400">
            <CalendarClock className="h-3.5 w-3.5" /> Next available
          </div>
          <div className="mt-2">
            <SlotButton slot={nextAvailable!} onBook={onBook} withDate />
          </div>
        </>
      )}

      {!onDay && !showNext && !canAsk && (
        <p className="mt-3 rounded-xl border border-dashed border-brand-200 px-3.5 py-2.5 text-sm text-ink-400">
          No open times in the next two weeks.
        </p>
      )}

      {canAsk && (
        <button
          onClick={() => onAskTime!(data)}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-brand-300 px-3.5 py-2.5 text-sm font-medium text-brand-700 transition-colors hover:border-brand-400 hover:bg-brand-50"
        >
          <CalendarPlus className="h-4 w-4" />
          {onDay || showNext ? 'Ask for another time' : 'Ask for a time'}
        </button>
      )}
    </Card>
  )
}

function SlotButton({
  slot,
  onBook,
  withDate = false,
}: {
  slot: AvailableSlot
  onBook: (slot: AvailableSlot) => void
  withDate?: boolean
}) {
  const full = slot.remaining <= 0
  return (
    <button
      disabled={full}
      onClick={() => onBook(slot)}
      className={cx(
        'flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition-colors',
        full
          ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-ink-400'
          : 'border-brand-200 bg-brand-50/40 hover:border-brand-400 hover:bg-brand-50',
      )}
    >
      <span className="flex min-w-0 flex-col">
        {withDate && (
          <span className="text-xs font-medium text-brand-700">{prettyDate(slot.date)}</span>
        )}
        <span className={cx('text-sm font-semibold', full ? 'text-ink-400' : 'text-ink-900')}>
          {formatTimeRange(slot.start_time, slot.end_time)}
        </span>
        {/* Where this particular sitting happens — a preceptor can hold
            one at a heartspot and another at home. */}
        <PlaceLine place={slot.place} className="mt-0.5 text-xs" />
        {slot.note && <span className="mt-0.5 text-xs text-ink-400">{slot.note}</span>}
      </span>
      {full ? (
        <Badge tone="neutral">Full</Badge>
      ) : (
        <Badge tone={slot.remaining === 1 ? 'amber' : 'green'}>
          {slot.remaining} of {slot.capacity} left
        </Badge>
      )}
    </button>
  )
}
