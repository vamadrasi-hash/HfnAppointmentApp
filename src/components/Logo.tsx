import { cx } from '../lib/utils'

/* The brand artwork. Both files are produced from assets/brand/ by
   scripts/prepare_logos.py — see that script before replacing either one. */
const MARK = '/logo-mark.png'
const MARK_WHITE = '/logo-mark-white.png'
const WORDMARK = '/logo-wordmark.png'
const WORDMARK_COMPACT = '/logo-wordmark-compact.png'

/* The seated figure. `tone` picks the copy to use: the brand blue for light
   backgrounds, white for dark ones. */
export function HeartfulnessMark({
  className,
  tone = 'brand',
  title,
}: {
  className?: string
  tone?: 'brand' | 'white'
  title?: string
}) {
  return (
    <img
      src={tone === 'white' ? MARK_WHITE : MARK}
      alt={title ?? ''}
      aria-hidden={title ? undefined : true}
      draggable={false}
      className={cx('block select-none object-contain', className ?? 'h-8 w-8')}
    />
  )
}

/* The logotype — "heartfulness / advancing in love". Give it a width; the
   height follows from the artwork. `compact` drops the tagline, which only
   smudges below roughly 7rem. */
export function HeartfulnessWordmark({
  className,
  compact,
}: {
  className?: string
  compact?: boolean
}) {
  return (
    <img
      src={compact ? WORDMARK_COMPACT : WORDMARK}
      alt="Heartfulness"
      draggable={false}
      className={cx('block h-auto select-none', className ?? 'w-44')}
    />
  )
}

/* Mark above logotype — the arrangement used on the sign-in screen. */
export function HeartfulnessLockup({ className }: { className?: string }) {
  return (
    <div className={cx('flex flex-col items-center', className)}>
      <div className="relative mb-6 flex h-32 w-32 items-center justify-center">
        <span className="absolute inset-0 animate-breathe rounded-full bg-brand-100" />
        <HeartfulnessMark className="relative h-[5.25rem] w-[5.25rem]" />
      </div>
      <HeartfulnessWordmark className="w-44" />
    </div>
  )
}
