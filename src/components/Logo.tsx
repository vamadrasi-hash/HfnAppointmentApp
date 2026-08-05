import { cx } from '../lib/utils'

/* The seated figure, traced from the Heartfulness mark.
 *
 * Every element is one calligraphic stroke: an outline that swells in the
 * middle and tapers to a point at both ends, the way a brush leaves it. They
 * are filled with `currentColor`, so the mark takes whatever text colour it is
 * placed in. */
const STROKES = [
  // the head, and the swirl that cradles it
  'M134 20a16 16 0 1 0 0 32 16 16 0 1 0 0-32ZM134 27a9 9 0 1 1 0 18 9 9 0 1 1 0-18Z',
  'M110 30C109.1 16.4 129.1 10.4 142 15C126.9 5.6 106.9 11.6 110 30Z',
  // the flame held at the heart
  'M151 76C137.6 103 137 126.4 149 154C162.4 127 163 103.6 151 76Z',
  // arms, crossing just past one another at the base
  'M142 60C82 112.5 48 194.5 153 228C64 193.5 98 111.5 142 60Z',
  'M158 60C202 111.5 236 193.5 147 228C252 194.5 218 112.5 158 60Z',
  // legs, folded
  'M192 206C136.4 236.1 64.4 248.1 16 234C67.6 267.9 139.6 255.9 192 206Z',
  'M108 206C160.4 255.9 232.4 267.9 284 234C235.6 248.1 163.6 236.1 108 206Z',
]

export function HeartfulnessMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 300 276"
      fill="currentColor"
      fillRule="evenodd"
      className={cx('block', className)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {STROKES.map((d) => (
        <path key={d} d={d} />
      ))}
      <circle cx="150" cy="165" r="4.5" />
    </svg>
  )
}

/* The logotype. Sized in `em`, so the caller only sets a font size and the
   tagline follows along. */
export function HeartfulnessWordmark({ className }: { className?: string }) {
  return (
    <span className={cx('block select-none leading-none', className)}>
      <span
        className="block font-serif font-normal tracking-[-0.01em]"
        style={{ fontVariationSettings: "'opsz' 144" }}
      >
        heartfulness
      </span>
      <span className="mt-[0.12em] block text-right font-serif text-[0.26em] tracking-[0.14em] opacity-60">
        advancing in love
      </span>
    </span>
  )
}

/* Mark above logotype — the arrangement used on the sign-in screen. */
export function HeartfulnessLockup({ className }: { className?: string }) {
  return (
    <div className={cx('flex flex-col items-center', className)}>
      <div className="relative mb-6 flex h-28 w-28 items-center justify-center">
        <span className="absolute inset-0 animate-breathe rounded-full bg-brand-100" />
        <HeartfulnessMark className="relative h-20 w-20 text-brand-600" />
      </div>
      <HeartfulnessWordmark className="text-[2.35rem] text-ink-900" />
    </div>
  )
}
