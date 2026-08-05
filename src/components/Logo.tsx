import { cx } from '../lib/utils'

/* The seated figure, drawn once and mirrored so the mark stays perfectly
   balanced. Everything is filled with `currentColor`, so the mark simply takes
   whatever text colour it is placed in. */
const ARM =
  'M143 56 C 108 84, 60 134, 64 178 C 67 206, 116 220, 152 224 ' +
  'C 126 212, 90 198, 92 174 C 94 134, 128 84, 143 56 Z'
const LEG = 'M178 196 C 128 220, 74 234, 22 242 C 86 292, 140 268, 178 196 Z'
const MIRROR = 'translate(300,0) scale(-1,1)'

export function HeartfulnessMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 300 288"
      fill="currentColor"
      className={cx('block', className)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {/* head */}
      <path
        fillRule="evenodd"
        d="M148 14a17 17 0 1 0 0 34 17 17 0 1 0 0-34Zm0 8.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 1 1 0-17Z"
      />
      <path d="M136 20 C 128 11, 116 11, 112 20 C 119 15, 127 17, 133 25 Z" />
      {/* the flame held at the heart */}
      <path d="M150 72 C 160 100, 161 126, 151 150 C 141 126, 140 100, 150 72 Z" />
      <circle cx="151" cy="161" r="5.5" />
      {/* arms */}
      <path d={ARM} />
      <g transform={MIRROR}>
        <path d={ARM} />
      </g>
      {/* legs, folded */}
      <path d={LEG} />
      <g transform={MIRROR}>
        <path d={LEG} />
      </g>
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
      <div className="relative mb-6 flex h-24 w-24 items-center justify-center">
        <span className="absolute inset-0 animate-breathe rounded-full bg-brand-100" />
        <HeartfulnessMark className="relative h-16 w-16 text-brand-600" />
      </div>
      <HeartfulnessWordmark className="text-[2.35rem] text-ink-900" />
    </div>
  )
}
