import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { cx, initials } from '../lib/utils'

// ---------------- Button ----------------
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  loading?: boolean
  full?: boolean
}
const buttonStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-soft disabled:bg-brand-300',
  secondary:
    'bg-white text-brand-700 border border-brand-200 hover:border-brand-400 hover:bg-brand-50 disabled:opacity-50',
  ghost: 'text-ink-700 hover:bg-brand-50 disabled:opacity-50',
  danger: 'bg-white text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50',
}
export function Button({
  variant = 'primary',
  loading,
  full,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold',
        'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2',
        full && 'w-full',
        buttonStyles[variant],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  )
}

// ---------------- Card ----------------
export function Card({
  children,
  className,
  onClick,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={cx(
        'rounded-2xl border border-brand-100 bg-white p-4 shadow-soft',
        onClick && 'cursor-pointer transition-shadow hover:shadow-lift',
        className,
      )}
    >
      {children}
    </div>
  )
}

// ---------------- Label + field wrapper ----------------
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}
    </label>
  )
}

// ---------------- Input ----------------
export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        'w-full rounded-xl border border-brand-200 bg-white px-3.5 py-2.5 text-ink-900',
        'placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100',
        className,
      )}
      {...rest}
    />
  )
}

// ---------------- Select ----------------
interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  placeholder?: string
}
export function Select({ className, children, ...rest }: SelectProps) {
  return (
    <div className="relative">
      <select
        className={cx(
          'w-full appearance-none rounded-xl border border-brand-200 bg-white px-3.5 py-2.5 pr-9 text-ink-900',
          'focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100',
          'disabled:bg-brand-50 disabled:text-ink-400',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
          clipRule="evenodd"
        />
      </svg>
    </div>
  )
}

// ---------------- Badge ----------------
type BadgeTone = 'brand' | 'gold' | 'neutral' | 'green' | 'red' | 'amber'
const badgeTones: Record<BadgeTone, string> = {
  brand: 'bg-brand-50 text-brand-700 border-brand-100',
  gold: 'bg-gold-100 text-gold-600 border-gold-200',
  neutral: 'bg-slate-50 text-ink-500 border-slate-100',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  red: 'bg-red-50 text-red-600 border-red-100',
  amber: 'bg-amber-50 text-amber-700 border-amber-100',
}
export function Badge({ tone = 'brand', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        badgeTones[tone],
      )}
    >
      {children}
    </span>
  )
}

// ---------------- Avatar ----------------
export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <div
      className={cx(
        'flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-serif text-brand-700',
        className ?? 'h-11 w-11 text-base',
      )}
    >
      {initials(name)}
    </div>
  )
}

// ---------------- Spinner ----------------
export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx('animate-spin text-current', className ?? 'h-5 w-5')} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

// ---------------- Full-page loader ----------------
export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-ink-500">
      <div className="h-12 w-12 animate-breathe rounded-full bg-brand-100" />
      <span className="text-sm">{label}</span>
    </div>
  )
}

// ---------------- Empty state ----------------
export function EmptyState({
  icon,
  title,
  subtitle,
  action,
}: {
  icon?: ReactNode
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-brand-200 bg-white/60 px-6 py-12 text-center">
      {icon && <div className="mb-3 text-brand-400">{icon}</div>}
      <p className="font-serif text-lg text-ink-900">{title}</p>
      {subtitle && <p className="mt-1 max-w-xs text-sm text-ink-500">{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// ---------------- Section header ----------------
export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="font-serif text-lg text-ink-900">{children}</h2>
      {hint && <span className="text-xs text-ink-400">{hint}</span>}
    </div>
  )
}
