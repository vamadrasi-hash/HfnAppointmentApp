import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Trash2, Clock, Users, Info, CalendarPlus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getMySlots, createSlot, updateSlot, deleteSlot, getCenters } from '../lib/api'
import type { AvailabilitySlot, Center } from '../lib/types'
import { Badge, Button, Card, EmptyState, Field, Input, PageLoader, Select } from '../components/ui'
import { Modal } from '../components/Modal'
import { WEEK_DAYS, dayLabel, formatTimeRange, formatTime } from '../lib/utils'

interface FormState {
  day_of_week: number
  start_time: string // 'HH:MM'
  end_time: string
  capacity: number
  center_id: string
  note: string
  is_active: boolean
}

const emptyForm = (centerId: string): FormState => ({
  day_of_week: 1,
  start_time: '07:00',
  end_time: '08:00',
  capacity: 1,
  center_id: centerId,
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
      const [mySlots, allCenters] = await Promise.all([getMySlots(user.id), getCenters()])
      setSlots(mySlots)
      setCenters(allCenters)
    } catch (e: any) {
      setError(e.message ?? 'Could not load your schedule.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (isPreceptor) load()
    else setLoading(false)
  }, [isPreceptor, load])

  function openAdd() {
    setEditing(null)
    setForm(emptyForm(profile?.center_id ?? centers[0]?.id ?? ''))
    setFormError(null)
    setOpen(true)
  }

  function openEdit(s: AvailabilitySlot) {
    setEditing(s)
    setForm({
      day_of_week: s.day_of_week,
      start_time: s.start_time.slice(0, 5),
      end_time: s.end_time.slice(0, 5),
      capacity: s.capacity,
      center_id: s.center_id ?? '',
      note: s.note ?? '',
      is_active: s.is_active,
    })
    setFormError(null)
    setOpen(true)
  }

  async function save() {
    if (!user) return
    setFormError(null)
    if (form.end_time <= form.start_time) {
      setFormError('End time must be after the start time.')
      return
    }
    if (form.capacity < 1) {
      setFormError('Capacity must be at least 1.')
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await updateSlot(editing.id, {
          day_of_week: form.day_of_week,
          start_time: withSeconds(form.start_time),
          end_time: withSeconds(form.end_time),
          capacity: form.capacity,
          center_id: form.center_id || null,
          note: form.note.trim() || null,
          is_active: form.is_active,
        })
      } else {
        await createSlot({
          preceptor_id: user.id,
          day_of_week: form.day_of_week,
          start_time: withSeconds(form.start_time),
          end_time: withSeconds(form.end_time),
          capacity: form.capacity,
          center_id: form.center_id || null,
          note: form.note.trim() || null,
          is_active: form.is_active,
        })
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
            Set the weekly times you can give individual sittings.
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
                  const center = centers.find((c) => c.id === s.center_id)
                  return (
                    <Card key={s.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 shrink-0 text-brand-500" />
                          <span className="font-semibold text-ink-900">
                            {formatTimeRange(s.start_time, s.end_time)}
                          </span>
                          {!s.is_active && <Badge tone="neutral">Paused</Badge>}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-500">
                          <span className="inline-flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            {s.capacity} {s.capacity > 1 ? 'places' : 'place'}
                          </span>
                          {center && <span>{center.name}</span>}
                        </div>
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
              {editing ? 'Save changes' : 'Add slot'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Day of week">
            <Select
              value={String(form.day_of_week)}
              onChange={(e) => setForm({ ...form, day_of_week: Number(e.target.value) })}
            >
              {WEEK_DAYS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start time">
              <Input
                type="time"
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
              />
            </Field>
            <Field label="End time">
              <Input
                type="time"
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
              />
            </Field>
          </div>

          <Field label="How many can come?" hint="Number of abhyasis you can take in this slot.">
            <Input
              type="number"
              min={1}
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
            />
          </Field>

          <Field label="Center">
            <Select
              value={form.center_id}
              onChange={(e) => setForm({ ...form, center_id: e.target.value })}
            >
              <option value="">Not specified</option>
              {centers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.city}
                </option>
              ))}
            </Select>
          </Field>

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
