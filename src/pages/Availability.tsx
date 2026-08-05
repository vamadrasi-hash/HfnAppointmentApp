import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Trash2, Clock, Users, Info, CalendarPlus, Home, MapPin } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getMySlots, createSlot, updateSlot, deleteSlot } from '../lib/api'
import type { AvailabilitySlot, Center, Heartspot, SittingPlaceType } from '../lib/types'
import {
  centerFullLabel,
  centerGroup,
  compareCenters,
  findHeartspot,
  heartspotsInCenter,
  loadMasterData,
} from '../lib/masterData'
import { MY_HOME_PLACE_NAME, resolvePlace } from '../lib/place'
import { hasLocation } from '../lib/geo'
import { Badge, Button, Card, EmptyState, Field, Input, PageLoader } from '../components/ui'
import { Combobox, type ComboOption } from '../components/Combobox'
import { Modal } from '../components/Modal'
import { PlaceLine } from '../components/PlaceLine'
import {
  DEFAULT_SITTING_MINUTES,
  WEEK_DAYS,
  addMinutesToTime,
  dayLabel,
  durationMinutes,
  formatTimeRange,
  formatTime,
  cx,
} from '../lib/utils'

interface FormState {
  // The same time often repeats across several days, so a new slot is
  // written once and saved for every day ticked. Editing touches the one
  // slot that was opened, so then this holds a single day.
  days: number[]
  start_time: string // 'HH:MM'
  end_time: string
  capacity: number
  center_id: string
  // Where the sitting happens. A home sitting needs nothing beyond
  // saying so — the address is on the preceptor's profile.
  place_type: SittingPlaceType
  heartspot_id: string
  note: string
  is_active: boolean
}

const emptyForm = (centerId: string): FormState => ({
  days: [1],
  start_time: '07:00',
  end_time: addMinutesToTime('07:00', DEFAULT_SITTING_MINUTES),
  capacity: 1,
  center_id: centerId,
  place_type: 'heartspot',
  heartspot_id: '',
  note: '',
  is_active: true,
})

// Postgres `time` accepts 'HH:MM'; we store with seconds for tidiness.
const withSeconds = (t: string) => (t.length === 5 ? `${t}:00` : t)

export default function Availability() {
  const { user, profile } = useAuth()
  const isPreceptor = profile?.role === 'preceptor' || profile?.role === 'admin'

  const [slots, setSlots] = useState<AvailabilitySlot[]>([])
  const [centers, setCenters] = useState<Center[]>([])
  const [heartspots, setHeartspots] = useState<Heartspot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<AvailabilitySlot | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm(profile?.center_id ?? ''))
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [delTarget, setDelTarget] = useState<AvailabilitySlot | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const [mySlots, master] = await Promise.all([
        getMySlots(user.id, profile?.home_place ?? null),
        loadMasterData(),
      ])
      setSlots(mySlots)
      setCenters(master.centers)
      setHeartspots(master.heartspots)
    } catch (e: any) {
      setError(e.message ?? 'Could not load your schedule.')
    } finally {
      setLoading(false)
    }
  }, [user, profile?.home_place])

  useEffect(() => {
    if (isPreceptor) load()
    else setLoading(false)
  }, [isPreceptor, load])

  // The same searchable "City / Center" list the profile screens use.
  const centerOptions = useMemo<ComboOption[]>(
    () =>
      [...centers].sort(compareCenters).map((c) => ({
        value: c.id,
        label: c.name,
        triggerLabel: centerFullLabel(c),
        group: centerGroup(c),
        keywords: c.city ?? '',
      })),
    [centers],
  )

  // Only the chosen center's heartspots — that is what "centerwise" means.
  const centerHeartspots = useMemo(
    () => heartspotsInCenter(heartspots, form.center_id).filter((h) => h.is_active),
    [heartspots, form.center_id],
  )

  const heartspotOptions = useMemo<ComboOption[]>(
    () =>
      centerHeartspots.map((h) => ({
        value: h.id,
        label: h.name,
        keywords: h.address ?? '',
      })),
    [centerHeartspots],
  )

  const chosenHeartspot = findHeartspot(heartspots, form.heartspot_id)

  // A home sitting happens at the address on this preceptor's profile.
  const homeAddress = profile?.home_place?.address?.trim() ?? ''

  function openAdd() {
    setEditing(null)
    setForm(emptyForm(profile?.center_id ?? centers[0]?.id ?? ''))
    setFormError(null)
    setOpen(true)
  }

  function openEdit(s: AvailabilitySlot) {
    setEditing(s)
    setForm({
      days: [s.day_of_week],
      start_time: s.start_time.slice(0, 5),
      end_time: s.end_time.slice(0, 5),
      capacity: s.capacity,
      center_id: s.center_id ?? '',
      place_type: s.place_type,
      heartspot_id: s.heartspot_id ?? '',
      note: s.note ?? '',
      is_active: s.is_active,
    })
    setFormError(null)
    setOpen(true)
  }

  // Editing changes the one slot that was opened, so its day is a choice
  // of one. Adding takes as many days as the same time repeats on.
  function toggleDay(day: number) {
    setForm((f) => {
      if (editing) return { ...f, days: [day] }
      return {
        ...f,
        days: f.days.includes(day) ? f.days.filter((d) => d !== day) : [...f.days, day],
      }
    })
  }

  // A sitting is half an hour, so the end time follows the start instead
  // of being typed twice. Once someone gives it a different length, that
  // length is what moves along with the start.
  function pickStart(start: string) {
    setForm((f) => {
      const span = durationMinutes(f.start_time, f.end_time) || DEFAULT_SITTING_MINUTES
      return { ...f, start_time: start, end_time: addMinutesToTime(start, span) }
    })
  }

  // Changing the center invalidates a heartspot from the old one.
  function pickCenter(centerId: string) {
    setForm((f) => {
      const keep =
        f.heartspot_id && heartspots.some((h) => h.id === f.heartspot_id && h.center_id === centerId)
      return { ...f, center_id: centerId, heartspot_id: keep ? f.heartspot_id : '' }
    })
  }

  async function save() {
    if (!user) return
    setFormError(null)
    if (form.days.length === 0) {
      setFormError('Pick at least one day.')
      return
    }
    if (form.end_time <= form.start_time) {
      setFormError('End time must be after the start time.')
      return
    }
    if (form.capacity < 1) {
      setFormError('At least one person has to be able to join.')
      return
    }
    if (!form.center_id) {
      setFormError('Pick the city / center this sitting belongs to.')
      return
    }
    if (form.place_type === 'heartspot' && centerHeartspots.length > 0 && !form.heartspot_id) {
      setFormError('Pick which heartspot the sitting happens at.')
      return
    }
    if (form.place_type === 'home' && !homeAddress) {
      setFormError('Add your home address in your profile before offering a sitting there.')
      return
    }

    const isHome = form.place_type === 'home'
    const payload = {
      start_time: withSeconds(form.start_time),
      end_time: withSeconds(form.end_time),
      capacity: form.capacity,
      center_id: form.center_id || null,
      place_type: form.place_type,
      // A heartspot sitting inherits its address from the heartspot, so it
      // stores nothing of its own.
      heartspot_id: isHome ? null : form.heartspot_id || null,
      note: form.note.trim() || null,
      is_active: form.is_active,
    }

    setSaving(true)
    try {
      if (editing) {
        await updateSlot(editing.id, { ...payload, day_of_week: form.days[0] })
      } else {
        // One slot per day ticked, saved in the order the week reads.
        const days = [...form.days].sort(
          (a, b) =>
            WEEK_DAYS.findIndex((d) => d.value === a) - WEEK_DAYS.findIndex((d) => d.value === b),
        )
        const failed: number[] = []
        for (const day of days) {
          try {
            await createSlot({ preceptor_id: user.id, day_of_week: day, ...payload })
          } catch {
            failed.push(day)
          }
        }
        // Anything that did save stays saved; only the rest is reported.
        if (failed.length === days.length) {
          setFormError('Could not save this slot.')
          return
        }
        if (failed.length > 0) {
          setError(`Saved, except for ${failed.map(dayLabel).join(', ')}. Please try those again.`)
        } else {
          const added = days.length
          setNotice(
            added === 1
              ? `${dayLabel(days[0])} added at ${formatTime(form.start_time)}.`
              : `${added} slots added at ${formatTime(form.start_time)}.`,
          )
          window.setTimeout(() => setNotice(null), 5000)
        }
      }

      setOpen(false)
      await load()
    } catch (e: any) {
      setFormError(e.message ?? 'Could not save this slot.')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!delTarget) return
    setDeleting(true)
    try {
      await deleteSlot(delTarget.id)
      setDelTarget(null)
      await load()
    } catch (e: any) {
      setError(e.message ?? 'Could not delete the slot.')
      setDelTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  if (!isPreceptor) {
    return (
      <div className="space-y-4">
        <h1 className="font-serif text-2xl text-ink-900">My schedule</h1>
        <EmptyState
          icon={<Info className="h-8 w-8" />}
          title="Only preceptors set availability"
          subtitle="Your account is registered as an abhyasi. If you serve as a preceptor, an administrator can update your role."
          action={
            <Link to="/find">
              <Button variant="secondary">Find a sitting instead</Button>
            </Link>
          }
        />
      </div>
    )
  }

  if (loading) return <PageLoader label="Loading your schedule…" />

  // Group slots by day, in Monday-first display order.
  const byDay = WEEK_DAYS.map((d) => ({
    day: d,
    slots: slots
      .filter((s) => s.day_of_week === d.value)
      .sort((a, b) => a.start_time.localeCompare(b.start_time)),
  })).filter((g) => g.slots.length > 0)

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl text-ink-900">My schedule</h1>
          <p className="mt-1 text-sm text-ink-500">
            Set the weekly times you can give individual sittings, and where they happen. A time
            that repeats can be added for several days at once.
          </p>
        </div>
        <Button onClick={openAdd} className="shrink-0">
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>

      {error && (
        <p className="rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
          {error}
        </p>
      )}

      {notice && (
        <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">
          {notice}
        </p>
      )}

      {slots.length === 0 ? (
        <EmptyState
          icon={<CalendarPlus className="h-8 w-8" />}
          title="No availability yet"
          subtitle="Add your first weekly time slot. Abhyasis will then be able to book sittings with you."
          action={
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4" /> Add availability
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          {byDay.map(({ day, slots: daySlots }) => (
            <div key={day.value}>
              <p className="mb-2 text-sm font-semibold text-ink-700">{day.label}</p>
              <div className="space-y-2">
                {daySlots.map((s) => {
                  const center = centers.find((c) => c.id === s.center_id) ?? null
                  const place = resolvePlace(s, findHeartspot(heartspots, s.heartspot_id), center, {
                    homeName: MY_HOME_PLACE_NAME,
                  })
                  return (
                    <Card key={s.id} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 shrink-0 text-brand-500" />
                          <span className="font-semibold text-ink-900">
                            {formatTimeRange(s.start_time, s.end_time)}
                          </span>
                          {!s.is_active && <Badge tone="neutral">Paused</Badge>}
                        </div>
                        <p className="mt-1 inline-flex items-center gap-1 text-sm text-ink-500">
                          <Users className="h-3.5 w-3.5" />
                          {s.capacity} {s.capacity === 1 ? 'person' : 'people'} can join
                        </p>
                        <PlaceLine place={place} className="mt-1" />
                        {!hasLocation(place) && (
                          <p className="mt-1 text-xs text-amber-700">
                            No address or map location yet — abhyasis won’t get directions.
                          </p>
                        )}
                        {s.note && <p className="mt-1 text-xs text-ink-400">{s.note}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => openEdit(s)}
                          className="rounded-lg p-2 text-ink-400 hover:bg-brand-50 hover:text-brand-600"
                          aria-label="Edit slot"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDelTarget(s)}
                          className="rounded-lg p-2 text-ink-400 hover:bg-red-50 hover:text-red-600"
                          aria-label="Delete slot"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / edit slot */}
      <Modal
        open={open}
        onClose={() => (saving ? null : setOpen(false))}
        title={editing ? 'Edit availability' : 'Add availability'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving} className="flex-1">
              {editing
                ? 'Save changes'
                : form.days.length > 1
                  ? `Add ${form.days.length} slots`
                  : 'Add slot'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink-700">
              {editing ? 'Day' : 'Days'}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {WEEK_DAYS.map((d) => {
                const on = form.days.includes(d.value)
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDay(d.value)}
                    aria-pressed={on}
                    className={cx(
                      'rounded-xl border px-2 py-2 text-sm font-medium transition-colors',
                      on
                        ? 'border-brand-500 bg-brand-600 text-white shadow-soft'
                        : 'border-brand-200 bg-white text-ink-600 hover:border-brand-400',
                    )}
                  >
                    {d.short}
                  </button>
                )
              })}
            </div>
            <p className="mt-1 text-xs text-ink-400">
              {editing
                ? 'Move this slot to a different day.'
                : 'Tick every day this time repeats on — one slot is added for each.'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start time">
              <Input type="time" value={form.start_time} onChange={(e) => pickStart(e.target.value)} />
            </Field>
            <Field
              label="End time"
              hint={`Follows the start by ${DEFAULT_SITTING_MINUTES} minutes — change it if yours run longer.`}
            >
              <Input
                type="time"
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
              />
            </Field>
          </div>

          <Field
            label="How many people can join?"
            hint="The number of abhyasis who can take this sitting together."
          >
            <Input
              type="number"
              min={1}
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
            />
          </Field>

          <Field
            label="City / Center"
            hint="Which center this sitting belongs to. Abhyasis search by this."
          >
            <Combobox
              value={form.center_id}
              options={centerOptions}
              onChange={pickCenter}
              placeholder="Select a city or center"
              searchPlaceholder="Type a city or center…"
              clearable
            />
          </Field>

          {/* ---- Where the sitting happens ---- */}
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink-700">Place of the sitting</p>
            <div className="grid grid-cols-2 gap-2">
              <PlaceTypeButton
                active={form.place_type === 'heartspot'}
                icon={<MapPin className="h-4 w-4" />}
                label="Heartspot"
                onClick={() => setForm({ ...form, place_type: 'heartspot' })}
              />
              <PlaceTypeButton
                active={form.place_type === 'home'}
                icon={<Home className="h-4 w-4" />}
                label="My home"
                onClick={() => setForm({ ...form, place_type: 'home' })}
              />
            </div>
          </div>

          {form.place_type === 'heartspot' ? (
            <div className="space-y-2">
              <Field
                label="Heartspot"
                hint="The heartspots of the center you picked above."
              >
                <Combobox
                  value={form.heartspot_id}
                  options={heartspotOptions}
                  onChange={(v) => setForm({ ...form, heartspot_id: v })}
                  disabled={!form.center_id}
                  clearable
                  placeholder={
                    !form.center_id
                      ? 'Pick a city / center first'
                      : centerHeartspots.length === 0
                        ? 'No heartspot listed for this center'
                        : 'Select a heartspot'
                  }
                  searchPlaceholder="Type a heartspot name…"
                  emptyText="No heartspot matches that."
                />
              </Field>

              {chosenHeartspot && (
                <div className="rounded-xl border border-brand-100 bg-brand-50/40 px-3.5 py-2.5 text-sm text-ink-600">
                  {chosenHeartspot.address ? (
                    <p>{chosenHeartspot.address}</p>
                  ) : (
                    <p className="text-ink-400">No address saved for this heartspot yet.</p>
                  )}
                  <p className="mt-1 text-xs text-ink-400">
                    A heartspot’s address and map location are kept in master data — ask an
                    administrator to correct them.
                  </p>
                </div>
              )}

              {form.center_id && centerHeartspots.length === 0 && (
                <p className="rounded-xl border border-amber-100 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
                  This center has no heartspots listed yet. Ask an administrator to add one, or hold
                  the sitting at your home.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {homeAddress ? (
                <div className="rounded-xl border border-brand-100 bg-brand-50/40 px-3.5 py-2.5 text-sm text-ink-600">
                  <p className="inline-flex items-center gap-1.5 font-medium text-ink-800">
                    <Home className="h-3.5 w-3.5 text-brand-500" /> Your home
                  </p>
                  <p className="mt-1">{homeAddress}</p>
                  <Link
                    to="/profile"
                    className="mt-1.5 inline-block text-xs font-medium text-brand-600 underline"
                  >
                    Change it in your profile
                  </Link>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-100 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
                  <p>You have not set a home address yet.</p>
                  <Link
                    to="/profile"
                    className="mt-1.5 inline-block text-xs font-medium underline"
                  >
                    Add it in your profile
                  </Link>
                </div>
              )}
              <p className="rounded-xl border border-brand-100 bg-brand-50/60 px-3.5 py-2.5 text-xs text-ink-600">
                Your address stays private until you confirm a sitting. Until then an abhyasi
                searching only sees your city and center — never the address, and never a map pin
                closer than about a kilometre.
              </p>
            </div>
          )}

          <Field label="Note" hint="Optional — e.g. ‘Only for new practitioners’.">
            <Input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Optional note"
            />
          </Field>

          <label className="flex items-center gap-3 rounded-xl border border-brand-100 bg-brand-50/40 px-3.5 py-2.5">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="h-4 w-4 rounded border-brand-300 text-brand-600 focus:ring-brand-400"
            />
            <span className="text-sm text-ink-700">
              Active{' '}
              <span className="text-ink-400">
                (uncheck to pause this slot without deleting it)
              </span>
            </span>
          </label>

          {formError && (
            <p className="rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
              {formError}
            </p>
          )}
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={!!delTarget}
        onClose={() => (deleting ? null : setDelTarget(null))}
        title="Delete this slot?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDelTarget(null)} disabled={deleting}>
              Keep it
            </Button>
            <Button variant="danger" onClick={confirmDelete} loading={deleting} className="flex-1">
              Delete
            </Button>
          </>
        }
      >
        {delTarget && (
          <p className="text-sm text-ink-600">
            Your{' '}
            <span className="font-medium text-ink-900">{dayLabel(delTarget.day_of_week)}</span>{' '}
            slot at{' '}
            <span className="font-medium text-ink-900">{formatTime(delTarget.start_time)}</span>{' '}
            will be removed. Existing bookings on it would also be affected.
          </p>
        )}
      </Modal>
    </div>
  )
}

function PlaceTypeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-colors',
        active
          ? 'border-brand-500 bg-brand-600 text-white shadow-soft'
          : 'border-brand-200 bg-white text-ink-600 hover:border-brand-400',
      )}
    >
      {icon}
      {label}
    </button>
  )
}
