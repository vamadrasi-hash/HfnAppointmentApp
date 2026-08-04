import { Home, Lock, MapPin, Navigation } from 'lucide-react'
import type { ResolvedPlace } from '../lib/types'
import { directionsUrl } from '../lib/geo'
import { cx } from '../lib/utils'

/**
 * Where a sitting happens, in one or two lines: the heartspot (or the
 * preceptor's home), the center it belongs to, and — when we know where it
 * is — a link that starts navigation.
 */
export function PlaceLine({
  place,
  showAddress = false,
  className,
}: {
  place: ResolvedPlace | null
  /** Off in lists, on once the abhyasi has to actually get there. */
  showAddress?: boolean
  className?: string
}) {
  if (!place) return null
  const Icon = place.type === 'home' ? Home : MapPin
  // A restricted place may still carry a coarse coordinate for distance
  // sorting — never enough to navigate to, so no link.
  const directions = place.restricted ? null : directionsUrl(place)

  return (
    <div className={cx('min-w-0 text-sm text-ink-500', className)}>
      <span className="inline-flex min-w-0 items-center gap-1">
        <Icon className="h-3.5 w-3.5 shrink-0 text-brand-500" />
        <span className="truncate text-ink-600">{place.name}</span>
      </span>
      {place.area && place.area !== place.name && (
        <span className="ml-1 text-ink-400">· {place.area}</span>
      )}

      {showAddress && place.address && !place.restricted && (
        <p className="mt-0.5 text-ink-500">{place.address}</p>
      )}

      {showAddress && place.restricted && (
        <p className="mt-1 inline-flex items-start gap-1.5 rounded-lg bg-brand-50/70 px-2.5 py-1.5 text-xs text-ink-500">
          <Lock className="mt-0.5 h-3 w-3 shrink-0 text-brand-500" />
          The preceptor shares the address once they confirm your sitting.
        </p>
      )}

      {showAddress && directions && (
        <a
          href={directions}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-brand-600"
        >
          <Navigation className="h-3.5 w-3.5" /> Directions
        </a>
      )}
    </div>
  )
}
