import { MapPin, Navigation, Clock } from 'lucide-react'
import type { AvailableSlot, PreceptorWithSlots } from '../lib/types'
import { Avatar, Badge, Card } from './ui'
import { formatTimeRange, cx } from '../lib/utils'

export function PreceptorCard({
  data,
  onBook,
}: {
  data: PreceptorWithSlots
  onBook: (slot: AvailableSlot) => void
}) {
  const { preceptor, center, distanceKm, slots } = data

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
              <span className="inline-flex items-center gap-1 text-brand-600">
                <Navigation className="h-3.5 w-3.5" />
                {distanceKm < 1 ? '<1' : distanceKm.toFixed(1)} km
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-400">
        <Clock className="h-3.5 w-3.5" /> Available times
      </div>

      <div className="mt-2 grid gap-2">
        {slots.map((slot) => {
          const full = slot.remaining <= 0
          return (
            <button
              key={slot.id}
              disabled={full}
              onClick={() => onBook(slot)}
              className={cx(
                'flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition-colors',
                full
                  ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-ink-400'
                  : 'border-brand-200 bg-brand-50/40 hover:border-brand-400 hover:bg-brand-50',
              )}
            >
              <span className="flex flex-col">
                <span className={cx('text-sm font-semibold', full ? 'text-ink-400' : 'text-ink-900')}>
                  {formatTimeRange(slot.start_time, slot.end_time)}
                </span>
                {slot.note && <span className="text-xs text-ink-400">{slot.note}</span>}
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
        })}
      </div>
    </Card>
  )
}
