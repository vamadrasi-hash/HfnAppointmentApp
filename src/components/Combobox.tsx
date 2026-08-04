import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { cx } from '../lib/utils'

export interface ComboOption {
  value: string
  label: string
  /** Heading the option sits under. Options must arrive already grouped. */
  group?: string
  /** Extra text to match on — e.g. the city, so "surat" finds its centers. */
  keywords?: string
  /** Shown on the closed control. Falls back to `label`, which reads inside
   *  its group heading and so can leave the group out. */
  triggerLabel?: string
}

interface ComboboxProps {
  value: string
  options: ComboOption[]
  onChange: (value: string) => void
  /** Shown on the closed control when nothing is selected. */
  placeholder?: string
  searchPlaceholder?: string
  disabled?: boolean
  emptyText?: string
  /** Adds an "×" to go back to the placeholder (i.e. "no selection"). */
  clearable?: boolean
}

// "Surat-West, Adajan" -> "surat west adajan", so search ignores punctuation.
const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

type Row =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'option'; key: string; option: ComboOption; index: number }

export function Combobox({
  value,
  options,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Type to search…',
  disabled,
  emptyText = 'Nothing matches that search.',
  clearable,
}: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value) ?? null

  // Every word in the query must appear somewhere in the option.
  const matches = useMemo(() => {
    const words = normalize(query).split(' ').filter(Boolean)
    if (words.length === 0) return options
    return options.filter((o) => {
      const hay = normalize(`${o.group ?? ''} ${o.label} ${o.keywords ?? ''}`)
      return words.every((w) => hay.includes(w))
    })
  }, [options, query])

  // Flatten into render rows, inserting a heading whenever the group changes.
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = []
    let lastGroup: string | undefined
    matches.forEach((o, i) => {
      if (o.group && o.group !== lastGroup) {
        out.push({ kind: 'header', key: `h-${o.group}-${i}`, label: o.group })
        lastGroup = o.group
      }
      out.push({ kind: 'option', key: o.value, option: o, index: i })
    })
    return out
  }, [matches])

  // Close on an outside click.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Opening starts on the current selection with an empty search box.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(Math.max(0, matches.findIndex((o) => o.value === value)))
    inputRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Typing invalidates the old highlight.
  useEffect(() => setActive(0), [query])

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    if (!open) return
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  function pick(v: string) {
    onChange(v)
    setOpen(false)
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (matches.length === 0) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => (i + step + matches.length) % matches.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const hit = matches[active]
      if (hit) pick(hit.value)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      // Don't let it reach a surrounding Modal, which also closes on Escape.
      e.stopPropagation()
      setOpen(false)
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'flex w-full items-center gap-2 rounded-xl border border-brand-200 bg-white px-3.5 py-2.5 text-left',
          'focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100',
          'disabled:bg-brand-50 disabled:text-ink-400',
          open && 'border-brand-500 ring-2 ring-brand-100',
        )}
      >
        <span className={cx('min-w-0 flex-1 truncate', selected ? 'text-ink-900' : 'text-ink-400')}>
          {selected ? (selected.triggerLabel ?? selected.label) : placeholder}
        </span>
        {clearable && selected && !disabled && (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear selection"
            onClick={(e) => {
              e.stopPropagation()
              onChange('')
              setOpen(false)
            }}
            className="rounded-full p-0.5 text-ink-400 hover:bg-brand-50 hover:text-ink-600"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
        <ChevronDown className={cx('h-4 w-4 shrink-0 text-ink-400', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-brand-200 bg-white shadow-lift">
          <div className="flex items-center gap-2 border-b border-brand-50 px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-ink-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none"
            />
          </div>

          <div ref={listRef} className="max-h-72 overflow-y-auto py-1" role="listbox">
            {rows.length === 0 ? (
              <p className="px-3.5 py-6 text-center text-sm text-ink-400">{emptyText}</p>
            ) : (
              rows.map((row) =>
                row.kind === 'header' ? (
                  <p
                    key={row.key}
                    className="sticky top-0 bg-white/95 px-3.5 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-ink-400"
                  >
                    {row.label}
                  </p>
                ) : (
                  <button
                    key={row.key}
                    type="button"
                    role="option"
                    aria-selected={row.option.value === value}
                    data-active={row.index === active}
                    onMouseEnter={() => setActive(row.index)}
                    onClick={() => pick(row.option.value)}
                    className={cx(
                      'flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm',
                      row.index === active ? 'bg-brand-50 text-ink-900' : 'text-ink-700',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{row.option.label}</span>
                    {row.option.value === value && (
                      <Check className="h-4 w-4 shrink-0 text-brand-600" />
                    )}
                  </button>
                ),
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}
