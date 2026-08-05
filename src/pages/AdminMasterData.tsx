import { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Layers,
  Building2,
  MapPin,
  Info,
  Search,
  Plus,
  Pencil,
  Trash2,
  Sparkles,
} from 'lucide-react'
import type { Center, Heartspot, SessionType } from '../lib/types'
import {
  NO_CITY_GROUP,
  centerFullLabel,
  centerGroup,
  centersInCity,
  cityGroups,
  compareCenters,
  countCities,
  heartspotsInCenter,
  useMasterData,
} from '../lib/masterData'
import {
  createCenter,
  updateCenter,
  deleteCenter,
  createHeartspot,
  updateHeartspot,
  deleteHeartspot,
  createSessionType,
  updateSessionType,
  deleteSessionType,
} from '../lib/api'
import { Badge, Button, Card, Field, Input, PageLoader, Select } from '../components/ui'
import { Combobox, type ComboOption } from '../components/Combobox'
import { Modal } from '../components/Modal'
import {
  LocationPicker,
  emptyPlaceValue,
  toPlaceValue,
  type PlaceValue,
} from '../components/LocationPicker'

interface CenterForm {
  zone_id: string
  name: string
  city: string
  place: PlaceValue
}

interface HeartspotForm {
  /** Chosen first: it narrows the centers you can file the heartspot under. */
  city: string
  center_id: string
  name: string
  is_active: boolean
  place: PlaceValue
}

interface SessionTypeForm {
  name: string
  name_hi: string
  description: string
  sort_order: number
  is_active: boolean
}

export default function AdminMasterData() {
  const { zones, centers, heartspots, sessionTypes, loading, error, reload } = useMasterData()
  // Cities are how people actually think about heartspots, so that is the
  // way in; zones stay available for the administrative view.
  const [view, setView] = useState<'city' | 'zone'>('city')
  const [openZone, setOpenZone] = useState<string | null>(null)
  const [openCity, setOpenCity] = useState<string | null>(null)
  const [openCenter, setOpenCenter] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)

  // Center add / edit
  const [centerModal, setCenterModal] = useState<{ editing: Center | null } | null>(null)
  const [centerForm, setCenterForm] = useState<CenterForm | null>(null)
  const [centerDel, setCenterDel] = useState<Center | null>(null)

  // Heartspot add / edit
  const [hsModal, setHsModal] = useState<{ editing: Heartspot | null } | null>(null)
  const [hsForm, setHsForm] = useState<HeartspotForm | null>(null)
  const [hsDel, setHsDel] = useState<Heartspot | null>(null)

  // Type of session add / edit
  const [stModal, setStModal] = useState<{ editing: SessionType | null } | null>(null)
  const [stForm, setStForm] = useState<SessionTypeForm | null>(null)
  const [stDel, setStDel] = useState<SessionType | null>(null)

  const [saving, setSaving] = useState(false)

  const q = query.trim().toLowerCase()

  // A heartspot name matches too, so searching "Adajan" finds its center.
  const matched = useMemo(
    () =>
      q
        ? centers.filter(
            (c) =>
              c.name.toLowerCase().includes(q) ||
              (c.city ?? '').toLowerCase().includes(q) ||
              heartspots.some((h) => h.center_id === c.id && h.name.toLowerCase().includes(q)),
          )
        : centers,
    [centers, heartspots, q],
  )

  // Zone -> city -> centers, which is how the app's own picker reads.
  const byZone = useMemo(() => {
    const m = new Map<string, Map<string, Center[]>>()
    for (const c of [...matched].sort(compareCenters)) {
      const cities = m.get(c.zone_id) ?? new Map<string, Center[]>()
      const list = cities.get(centerGroup(c)) ?? []
      list.push(c)
      cities.set(centerGroup(c), list)
      m.set(c.zone_id, cities)
    }
    return m
  }, [matched])

  // City -> centers, for going straight at a city without knowing its zone.
  const byCity = useMemo(() => {
    const m = new Map<string, Center[]>()
    for (const c of [...matched].sort(compareCenters)) {
      const g = centerGroup(c)
      m.set(g, [...(m.get(g) ?? []), c])
    }
    return m
  }, [matched])

  const cityOptions = useMemo<ComboOption[]>(
    () => cityGroups(centers).map((city) => ({ value: city, label: city })),
    [centers],
  )

  // ---- center form ----------------------------------------------------
  function openCenterAdd(zoneId?: string) {
    setSaveError(null)
    setCenterForm({
      zone_id: zoneId ?? zones[0]?.id ?? '',
      name: '',
      city: '',
      place: emptyPlaceValue(),
    })
    setCenterModal({ editing: null })
  }

  function openCenterEdit(c: Center) {
    setSaveError(null)
    setCenterForm({
      zone_id: c.zone_id,
      name: c.name,
      city: c.city ?? '',
      place: toPlaceValue(c),
    })
    setCenterModal({ editing: c })
  }

  async function saveCenter() {
    if (!centerForm || !centerModal) return
    if (!centerForm.name.trim()) {
      setSaveError('Give the center a name.')
      return
    }
    if (!centerForm.zone_id) {
      setSaveError('Pick the zone this center belongs to.')
      return
    }
    setSaving(true)
    setSaveError(null)
    const payload = {
      zone_id: centerForm.zone_id,
      name: centerForm.name.trim(),
      city: centerForm.city.trim() || null,
      address: centerForm.place.address.trim() || null,
      latitude: centerForm.place.latitude,
      longitude: centerForm.place.longitude,
      map_url: centerForm.place.map_url,
    }
    try {
      if (centerModal.editing) await updateCenter(centerModal.editing.id, payload)
      else await createCenter(payload)
      setCenterModal(null)
      reload()
    } catch (e: any) {
      setSaveError(e.message ?? 'Could not save this center.')
    } finally {
      setSaving(false)
    }
  }

  async function confirmCenterDelete() {
    if (!centerDel) return
    setSaving(true)
    try {
      await deleteCenter(centerDel.id)
      setCenterDel(null)
      reload()
    } catch (e: any) {
      setSaveError(e.message ?? 'Could not delete this center.')
      setCenterDel(null)
    } finally {
      setSaving(false)
    }
  }

  // ---- heartspot form -------------------------------------------------
  // A heartspot is reached city-first: pick the city, then which of its
  // centers it belongs to. Opening from a center pre-fills both.
  function openHsAdd(center?: Center) {
    setSaveError(null)
    setHsForm({
      city: center ? centerGroup(center) : '',
      center_id: center?.id ?? '',
      name: '',
      is_active: true,
      place: emptyPlaceValue(),
    })
    setHsModal({ editing: null })
  }

  function openHsEdit(h: Heartspot) {
    const center = centers.find((c) => c.id === h.center_id)
    setSaveError(null)
    setHsForm({
      city: center ? centerGroup(center) : '',
      center_id: h.center_id,
      name: h.name,
      is_active: h.is_active,
      place: toPlaceValue(h),
    })
    setHsModal({ editing: h })
  }

  // Changing the city invalidates a center from the old one.
  function pickHsCity(city: string) {
    setHsForm((f) => {
      if (!f) return f
      const stillThere = centersInCity(centers, city).some((c) => c.id === f.center_id)
      return { ...f, city, center_id: stillThere ? f.center_id : '' }
    })
  }

  async function saveHeartspot() {
    if (!hsForm || !hsModal) return
    if (!hsForm.city) {
      setSaveError('Pick the city this heartspot is in.')
      return
    }
    if (!hsForm.center_id) {
      setSaveError('Pick which center in that city it belongs to.')
      return
    }
    if (!hsForm.name.trim()) {
      setSaveError('Give the heartspot a name.')
      return
    }
    setSaving(true)
    setSaveError(null)
    const payload = {
      center_id: hsForm.center_id,
      name: hsForm.name.trim(),
      is_active: hsForm.is_active,
      address: hsForm.place.address.trim() || null,
      latitude: hsForm.place.latitude,
      longitude: hsForm.place.longitude,
      map_url: hsForm.place.map_url,
    }
    try {
      if (hsModal.editing) await updateHeartspot(hsModal.editing.id, payload)
      else await createHeartspot(payload)
      setHsModal(null)
      reload()
    } catch (e: any) {
      setSaveError(
        e?.code === '23505'
          ? 'This center already has a heartspot with that name.'
          : (e.message ?? 'Could not save this heartspot.'),
      )
    } finally {
      setSaving(false)
    }
  }

  async function confirmHsDelete() {
    if (!hsDel) return
    setSaving(true)
    try {
      await deleteHeartspot(hsDel.id)
      setHsDel(null)
      reload()
    } catch (e: any) {
      setSaveError(e.message ?? 'Could not delete this heartspot.')
      setHsDel(null)
    } finally {
      setSaving(false)
    }
  }

  // ---- type of session form -------------------------------------------
  function openStAdd() {
    setSaveError(null)
    setStForm({
      name: '',
      name_hi: '',
      description: '',
      // Straight after the last one, so a new kind lands at the bottom of
      // the seeker's dropdown rather than the top.
      sort_order: sessionTypes.reduce((n, t) => Math.max(n, t.sort_order), 0) + 1,
      is_active: true,
    })
    setStModal({ editing: null })
  }

  function openStEdit(t: SessionType) {
    setSaveError(null)
    setStForm({
      name: t.name,
      name_hi: t.name_hi ?? '',
      description: t.description ?? '',
      sort_order: t.sort_order,
      is_active: t.is_active,
    })
    setStModal({ editing: t })
  }

  async function saveSessionType() {
    if (!stForm || !stModal) return
    if (!stForm.name.trim()) {
      setSaveError('Give this type of session a name.')
      return
    }
    setSaving(true)
    setSaveError(null)
    const payload = {
      name: stForm.name.trim(),
      name_hi: stForm.name_hi.trim() || null,
      description: stForm.description.trim() || null,
      sort_order: stForm.sort_order,
      is_active: stForm.is_active,
    }
    try {
      if (stModal.editing) await updateSessionType(stModal.editing.id, payload)
      else await createSessionType(payload)
      setStModal(null)
      reload()
    } catch (e: any) {
      setSaveError(
        e?.code === '23505'
          ? 'There is already a type of session with that name.'
          : (e.message ?? 'Could not save this type of session.'),
      )
    } finally {
      setSaving(false)
    }
  }

  async function confirmStDelete() {
    if (!stDel) return
    setSaving(true)
    try {
      await deleteSessionType(stDel.id)
      setStDel(null)
      reload()
    } catch (e: any) {
      setSaveError(e.message ?? 'Could not delete this type of session.')
      setStDel(null)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageLoader label="Loading master data…" />

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl text-ink-900">Master data</h1>
          <p className="mt-1 text-sm text-ink-500">
            The zones, cities, centers and heartspots behind every place dropdown in the app.
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={() => openHsAdd()} className="flex-1">
          <Plus className="h-4 w-4" /> Heartspot
        </Button>
        <Button variant="secondary" onClick={() => openCenterAdd()} className="flex-1">
          <Plus className="h-4 w-4" /> Center
        </Button>
      </div>

      {(error || saveError) && (
        <p className="rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
          {error ?? saveError}
        </p>
      )}

      {/* Summary counts */}
      <div className="grid grid-cols-4 gap-2">
        <Card className="p-3 text-center">
          <Layers className="mx-auto h-5 w-5 text-brand-500" />
          <p className="mt-1 font-serif text-xl text-ink-900">{zones.length}</p>
          <p className="text-xs text-ink-500">Zones</p>
        </Card>
        <Card className="p-3 text-center">
          <MapPin className="mx-auto h-5 w-5 text-brand-500" />
          <p className="mt-1 font-serif text-xl text-ink-900">{countCities(centers)}</p>
          <p className="text-xs text-ink-500">Cities</p>
        </Card>
        <Card className="p-3 text-center">
          <Building2 className="mx-auto h-5 w-5 text-brand-500" />
          <p className="mt-1 font-serif text-xl text-ink-900">{centers.length}</p>
          <p className="text-xs text-ink-500">Centers</p>
        </Card>
        <Card className="p-3 text-center">
          <Sparkles className="mx-auto h-5 w-5 text-brand-500" />
          <p className="mt-1 font-serif text-xl text-ink-900">{heartspots.length}</p>
          <p className="text-xs text-ink-500">Heartspots</p>
        </Card>
      </div>

      {/* Types of session — the dropdown a seeker picks from when they
          request a sitting. */}
      <Card className="space-y-2 p-0">
        <div className="flex items-center justify-between gap-2 px-4 pt-3">
          <div>
            <p className="font-semibold text-ink-900">Types of session</p>
            <p className="mt-0.5 text-xs text-ink-500">
              What a seeker chooses when they request a sitting.
            </p>
          </div>
          <Button variant="secondary" onClick={openStAdd} className="shrink-0">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>

        <div className="space-y-1.5 px-4 pb-4">
          {sessionTypes.length === 0 ? (
            <p className="text-sm text-ink-400">
              None yet. Without one, a seeker is not asked what kind of sitting they want.
            </p>
          ) : (
            sessionTypes.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-1 rounded-xl border border-brand-100 bg-brand-50/30 px-2.5 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink-800">
                    {t.name}
                    {t.name_hi && <span className="ml-1.5 text-ink-400">· {t.name_hi}</span>}
                    {!t.is_active && <span className="ml-1.5 text-xs text-ink-400">(hidden)</span>}
                  </p>
                  {t.description && (
                    <p className="truncate text-xs text-ink-400">{t.description}</p>
                  )}
                </div>
                <button
                  onClick={() => openStEdit(t)}
                  aria-label={`Edit ${t.name}`}
                  className="rounded-lg p-1.5 text-ink-400 hover:bg-white hover:text-brand-600"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setStDel(t)}
                  aria-label={`Delete ${t.name}`}
                  className="rounded-lg p-1.5 text-ink-400 hover:bg-white hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </Card>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a city, center or heartspot…"
          className="pl-10"
        />
      </div>

      {/* How to browse */}
      <div className="flex gap-2">
        {(['city', 'zone'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={
              'flex-1 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors ' +
              (view === v
                ? 'border-brand-500 bg-brand-600 text-white shadow-soft'
                : 'border-brand-200 bg-white text-ink-600 hover:border-brand-400')
            }
          >
            By {v}
          </button>
        ))}
      </div>

      {/* City tree — a city, its centers, and their heartspots */}
      {view === 'city' && (
        <div className="space-y-3">
          {[...byCity.entries()].map(([city, list]) => {
            const spots = list.reduce(
              (n, c) => n + heartspotsInCenter(heartspots, c.id).length,
              0,
            )
            const isOpen = q ? true : openCity === city
            return (
              <Card key={city} className="overflow-hidden p-0">
                <button
                  onClick={() => setOpenCity(isOpen ? null : city)}
                  className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
                >
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0 text-brand-500" />
                    <span
                      className={
                        city === NO_CITY_GROUP
                          ? 'italic text-ink-400'
                          : 'font-semibold text-ink-900'
                      }
                    >
                      {city}
                    </span>
                    <Badge tone="neutral">
                      {list.length} center{list.length === 1 ? '' : 's'}
                    </Badge>
                    <Badge tone="brand">
                      {spots} heartspot{spots === 1 ? '' : 's'}
                    </Badge>
                  </span>
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-ink-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" />
                  )}
                </button>

                {isOpen && (
                  <div className="space-y-1.5 border-t border-brand-50 px-4 py-3">
                    {list.map((c) => (
                      <CenterRow
                        key={c.id}
                        center={c}
                        heartspots={heartspotsInCenter(heartspots, c.id)}
                        expanded={openCenter === c.id}
                        onToggle={() => setOpenCenter(openCenter === c.id ? null : c.id)}
                        onEdit={() => openCenterEdit(c)}
                        onDelete={() => setCenterDel(c)}
                        onAddHeartspot={() => openHsAdd(c)}
                        onEditHeartspot={openHsEdit}
                        onDeleteHeartspot={(h) => setHsDel(h)}
                      />
                    ))}
                  </div>
                )}
              </Card>
            )
          })}
          {byCity.size === 0 && (
            <p className="rounded-xl border border-dashed border-brand-200 bg-white/60 px-4 py-6 text-center text-sm text-ink-500">
              Nothing matches that search.
            </p>
          )}
        </div>
      )}

      {/* Zone tree */}
      {view === 'zone' && (
      <div className="space-y-3">
        {zones.map((z) => {
          const cities = byZone.get(z.id) ?? new Map<string, Center[]>()
          const zCount = [...cities.values()].reduce((n, list) => n + list.length, 0)
          // A search auto-opens the zones that have a hit.
          const isOpen = q ? zCount > 0 : openZone === z.id
          return (
            <Card key={z.id} className="overflow-hidden p-0">
              <button
                onClick={() => setOpenZone(isOpen ? null : z.id)}
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink-900">{z.name}</span>
                  <Badge tone="neutral">
                    {zCount} center{zCount === 1 ? '' : 's'}
                  </Badge>
                </span>
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-ink-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" />
                )}
              </button>

              {isOpen && (
                <div className="space-y-4 border-t border-brand-50 px-4 py-3">
                  {zCount === 0 && (
                    <p className="text-sm text-ink-400">No centers in this zone yet.</p>
                  )}
                  {[...cities.entries()].map(([city, list]) => (
                    <div key={city}>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 shrink-0 text-brand-500" />
                        <span
                          className={
                            city === NO_CITY_GROUP
                              ? 'text-sm italic text-ink-400'
                              : 'font-medium text-ink-800'
                          }
                        >
                          {city}
                        </span>
                      </div>

                      <div className="mt-1.5 space-y-1.5 pl-6">
                        {list.map((c) => (
                          <CenterRow
                            key={c.id}
                            center={c}
                            heartspots={heartspotsInCenter(heartspots, c.id)}
                            expanded={openCenter === c.id}
                            onToggle={() => setOpenCenter(openCenter === c.id ? null : c.id)}
                            onEdit={() => openCenterEdit(c)}
                            onDelete={() => setCenterDel(c)}
                            onAddHeartspot={() => openHsAdd(c)}
                            onEditHeartspot={openHsEdit}
                            onDeleteHeartspot={(h) => setHsDel(h)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}

                  <Button variant="secondary" full onClick={() => openCenterAdd(z.id)}>
                    <Plus className="h-4 w-4" /> Add a center to this zone
                  </Button>
                </div>
              )}
            </Card>
          )
        })}
      </div>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-brand-100 bg-brand-50/50 px-3.5 py-3 text-sm text-ink-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
        <p>
          Preceptors pick a heartspot from the center they choose, so a center with no heartspot
          leaves them only the “at my home” option. A center with no city yet still appears
          everywhere — it is listed under “{NO_CITY_GROUP}”. Zones themselves are set up in the
          Supabase Table Editor.
        </p>
      </div>

      {/* ---- Center add / edit ---- */}
      <Modal
        open={!!centerModal}
        onClose={() => (saving ? null : setCenterModal(null))}
        title={centerModal?.editing ? 'Edit center' : 'Add a center'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCenterModal(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveCenter} loading={saving} className="flex-1">
              {centerModal?.editing ? 'Save changes' : 'Add center'}
            </Button>
          </>
        }
      >
        {centerForm && (
          <div className="space-y-3">
            <Field label="Zone">
              <Select
                value={centerForm.zone_id}
                onChange={(e) => setCenterForm({ ...centerForm, zone_id: e.target.value })}
              >
                <option value="">Select a zone</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Center name">
              <Input
                value={centerForm.name}
                onChange={(e) => setCenterForm({ ...centerForm, name: e.target.value })}
                placeholder="e.g. Surat-West-Adajan"
              />
            </Field>

            <Field
              label="City"
              hint="Groups the center in the “City / Center” picker. Leave blank if unknown."
            >
              <Input
                value={centerForm.city}
                onChange={(e) => setCenterForm({ ...centerForm, city: e.target.value })}
                placeholder="e.g. Surat"
              />
            </Field>

            <LocationPicker
              value={centerForm.place}
              onChange={(place) => setCenterForm({ ...centerForm, place })}
              addressLabel="Center address"
              addressHint="Used when a heartspot of this center has no address of its own."
            />

            {saveError && (
              <p className="rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
                {saveError}
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* ---- Heartspot add / edit ---- */}
      <Modal
        open={!!hsModal}
        onClose={() => (saving ? null : setHsModal(null))}
        title={hsModal?.editing ? 'Edit heartspot' : 'Add a heartspot'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setHsModal(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveHeartspot} loading={saving} className="flex-1">
              {hsModal?.editing ? 'Save changes' : 'Add heartspot'}
            </Button>
          </>
        }
      >
        {hsForm && hsModal && (
          <div className="space-y-3">
            <Field label="City" hint="Every city that has at least one center.">
              <Combobox
                value={hsForm.city}
                options={cityOptions}
                onChange={pickHsCity}
                placeholder="Select a city"
                searchPlaceholder="Type a city…"
                emptyText="No city matches that."
              />
            </Field>

            <Field
              label="Center"
              hint={
                hsForm.city
                  ? 'Which center in that city this heartspot belongs to.'
                  : 'Pick a city first.'
              }
            >
              <Combobox
                value={hsForm.center_id}
                options={centersInCity(centers, hsForm.city).map((c) => ({
                  value: c.id,
                  label: c.name,
                  triggerLabel: centerFullLabel(c),
                }))}
                onChange={(v) => setHsForm({ ...hsForm, center_id: v })}
                disabled={!hsForm.city}
                placeholder={hsForm.city ? 'Select a center' : 'Pick a city first'}
                searchPlaceholder="Type a center…"
                emptyText="No center matches that in this city."
              />
            </Field>

            <Field label="Heartspot name">
              <Input
                value={hsForm.name}
                onChange={(e) => setHsForm({ ...hsForm, name: e.target.value })}
                placeholder="e.g. Adajan Heartspot"
              />
            </Field>

            <LocationPicker
              value={hsForm.place}
              onChange={(place) => setHsForm({ ...hsForm, place })}
              addressLabel="Address"
              addressHint="What abhyasis see when they come for a sitting here."
            />

            <label className="flex items-center gap-3 rounded-xl border border-brand-100 bg-brand-50/40 px-3.5 py-2.5">
              <input
                type="checkbox"
                checked={hsForm.is_active}
                onChange={(e) => setHsForm({ ...hsForm, is_active: e.target.checked })}
                className="h-4 w-4 rounded border-brand-300 text-brand-600 focus:ring-brand-400"
              />
              <span className="text-sm text-ink-700">
                Active{' '}
                <span className="text-ink-400">
                  (uncheck to hide it from preceptors without deleting it)
                </span>
              </span>
            </label>

            {saveError && (
              <p className="rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
                {saveError}
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* ---- Type of session add / edit ---- */}
      <Modal
        open={!!stModal}
        onClose={() => (saving ? null : setStModal(null))}
        title={stModal?.editing ? 'Edit type of session' : 'Add a type of session'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setStModal(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveSessionType} loading={saving} className="flex-1">
              {stModal?.editing ? 'Save changes' : 'Add type'}
            </Button>
          </>
        }
      >
        {stForm && (
          <div className="space-y-3">
            <Field label="Name">
              <Input
                value={stForm.name}
                onChange={(e) => setStForm({ ...stForm, name: e.target.value })}
                placeholder="e.g. Introductory sitting"
              />
            </Field>

            <Field
              label="Name in Hindi"
              hint="Used in the messages that go out in both languages."
            >
              <Input
                value={stForm.name_hi}
                onChange={(e) => setStForm({ ...stForm, name_hi: e.target.value })}
                placeholder="जैसे परिचयात्मक सिटिंग"
              />
            </Field>

            <Field label="Description" hint="Shown under the dropdown while a seeker chooses.">
              <Input
                value={stForm.description}
                onChange={(e) => setStForm({ ...stForm, description: e.target.value })}
                placeholder="e.g. The first sittings for someone new to Heartfulness."
              />
            </Field>

            <Field label="Order" hint="Lower numbers come first in the dropdown.">
              <Input
                type="number"
                value={stForm.sort_order}
                onChange={(e) =>
                  setStForm({ ...stForm, sort_order: Number(e.target.value) || 0 })
                }
              />
            </Field>

            <label className="flex items-center gap-3 rounded-xl border border-brand-100 bg-brand-50/40 px-3.5 py-2.5">
              <input
                type="checkbox"
                checked={stForm.is_active}
                onChange={(e) => setStForm({ ...stForm, is_active: e.target.checked })}
                className="h-4 w-4 rounded border-brand-300 text-brand-600 focus:ring-brand-400"
              />
              <span className="text-sm text-ink-700">
                Active{' '}
                <span className="text-ink-400">
                  (uncheck to take it out of the dropdown without losing past bookings)
                </span>
              </span>
            </label>

            {saveError && (
              <p className="rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
                {saveError}
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* ---- Delete confirmations ---- */}
      <Modal
        open={!!centerDel}
        onClose={() => (saving ? null : setCenterDel(null))}
        title="Delete this center?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCenterDel(null)} disabled={saving}>
              Keep it
            </Button>
            <Button variant="danger" onClick={confirmCenterDelete} loading={saving} className="flex-1">
              Delete
            </Button>
          </>
        }
      >
        {centerDel && (
          <p className="text-sm text-ink-600">
            <span className="font-medium text-ink-900">{centerDel.name}</span> and its{' '}
            {heartspotsInCenter(heartspots, centerDel.id).length} heartspot(s) will be removed.
            Anyone whose profile or schedule points at this center loses that link and will have to
            pick again.
          </p>
        )}
      </Modal>

      <Modal
        open={!!hsDel}
        onClose={() => (saving ? null : setHsDel(null))}
        title="Delete this heartspot?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setHsDel(null)} disabled={saving}>
              Keep it
            </Button>
            <Button variant="danger" onClick={confirmHsDelete} loading={saving} className="flex-1">
              Delete
            </Button>
          </>
        }
      >
        {hsDel && (
          <p className="text-sm text-ink-600">
            <span className="font-medium text-ink-900">{hsDel.name}</span> will be removed. Any slot
            held there falls back to the center’s own address. To keep the history, uncheck
            “Active” instead.
          </p>
        )}
      </Modal>

      <Modal
        open={!!stDel}
        onClose={() => (saving ? null : setStDel(null))}
        title="Delete this type of session?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setStDel(null)} disabled={saving}>
              Keep it
            </Button>
            <Button variant="danger" onClick={confirmStDelete} loading={saving} className="flex-1">
              Delete
            </Button>
          </>
        }
      >
        {stDel && (
          <p className="text-sm text-ink-600">
            <span className="font-medium text-ink-900">{stDel.name}</span> will be removed, and any
            sitting booked as this type is left without one. To take it out of the dropdown while
            keeping that history, uncheck “Active” instead.
          </p>
        )}
      </Modal>
    </div>
  )
}

function CenterRow({
  center,
  heartspots,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  onAddHeartspot,
  onEditHeartspot,
  onDeleteHeartspot,
}: {
  center: Center
  heartspots: Heartspot[]
  expanded: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onAddHeartspot: () => void
  onEditHeartspot: (h: Heartspot) => void
  onDeleteHeartspot: (h: Heartspot) => void
}) {
  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/30">
      <div className="flex items-center gap-1 px-2.5 py-1.5">
        <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-400" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-400" />
          )}
          <span className="truncate text-sm text-ink-800">{center.name}</span>
          <span className="shrink-0 text-xs text-ink-400">
            {heartspots.length} heartspot{heartspots.length === 1 ? '' : 's'}
          </span>
        </button>
        <button
          onClick={onEdit}
          aria-label={`Edit ${center.name}`}
          className="rounded-lg p-1.5 text-ink-400 hover:bg-white hover:text-brand-600"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          aria-label={`Delete ${center.name}`}
          className="rounded-lg p-1.5 text-ink-400 hover:bg-white hover:text-red-600"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="space-y-1.5 border-t border-brand-100 px-2.5 py-2">
          {center.address && <p className="text-xs text-ink-400">{center.address}</p>}

          {heartspots.length === 0 ? (
            <p className="text-xs text-ink-400">
              No heartspots yet. Preceptors here can only offer sittings at their home.
            </p>
          ) : (
            heartspots.map((h) => (
              <div
                key={h.id}
                className="flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink-800">
                    {h.name}
                    {!h.is_active && <span className="ml-1.5 text-xs text-ink-400">(hidden)</span>}
                  </p>
                  {h.address && <p className="truncate text-xs text-ink-400">{h.address}</p>}
                </div>
                <button
                  onClick={() => onEditHeartspot(h)}
                  aria-label={`Edit ${h.name}`}
                  className="rounded-lg p-1.5 text-ink-400 hover:bg-brand-50 hover:text-brand-600"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onDeleteHeartspot(h)}
                  aria-label={`Delete ${h.name}`}
                  className="rounded-lg p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}

          <button
            onClick={onAddHeartspot}
            className="inline-flex items-center gap-1 rounded-lg px-1 py-1 text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            <Plus className="h-3.5 w-3.5" /> Add a heartspot
          </button>
        </div>
      )}
    </div>
  )
}
