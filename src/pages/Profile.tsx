import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  MapPin,
  Loader2,
  Check,
  LogOut,
  CalendarCog,
  ShieldCheck,
  ChevronRight,
  Mail,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getZones, getCenters, getAreas, upsertProfile } from '../lib/api'
import type { Zone, Center, Area } from '../lib/types'
import { Avatar, Badge, Button, Card, Field, Input, Select } from '../components/ui'

export default function Profile() {
  const { user, profile, setProfile, signOut } = useAuth()
  const navigate = useNavigate()

  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')

  const [zones, setZones] = useState<Zone[]>([])
  const [centers, setCenters] = useState<Center[]>([])
  const [areas, setAreas] = useState<Area[]>([])

  const [zoneId, setZoneId] = useState(profile?.zone_id ?? '')
  const [centerId, setCenterId] = useState(profile?.center_id ?? '')
  const [areaId, setAreaId] = useState(profile?.area_id ?? '')

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    profile?.home_latitude != null && profile?.home_longitude != null
      ? { lat: profile.home_latitude, lng: profile.home_longitude }
      : null,
  )
  const [geoState, setGeoState] = useState<'idle' | 'loading' | 'error'>('idle')

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isPreceptor = profile?.role === 'preceptor' || profile?.role === 'admin'
  const isAdmin = profile?.role === 'admin'

  // Initial hydrate: load zones, plus centers/areas for the saved selections.
  useEffect(() => {
    getZones().then(setZones).catch(() => {})
    if (profile?.zone_id) getCenters(profile.zone_id).then(setCenters).catch(() => {})
    if (profile?.center_id) getAreas(profile.center_id).then(setAreas).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onZoneChange(z: string) {
    setZoneId(z)
    setCenterId('')
    setAreaId('')
    setCenters([])
    setAreas([])
    if (z) getCenters(z).then(setCenters).catch(() => {})
  }

  function onCenterChange(c: string) {
    setCenterId(c)
    setAreaId('')
    setAreas([])
    if (c) getAreas(c).then(setAreas).catch(() => {})
  }

  function useMyLocation() {
    if (!('geolocation' in navigator)) {
      setGeoState('error')
      return
    }
    setGeoState('loading')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGeoState('idle')
      },
      () => setGeoState('error'),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  async function save() {
    if (!user) return
    setError(null)
    if (!fullName.trim()) {
      setError('Please enter your name.')
      return
    }
    setSaving(true)
    setSaved(false)
    try {
      const selectedCenter = centers.find((c) => c.id === centerId)
      const updated = await upsertProfile({
        id: user.id,
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        zone_id: zoneId || null,
        center_id: centerId || null,
        area_id: areaId || null,
        city: selectedCenter?.city ?? profile?.city ?? null,
        home_latitude: coords?.lat ?? null,
        home_longitude: coords?.lng ?? null,
      })
      setProfile(updated)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 3000)
    } catch (e: any) {
      setError(e.message ?? 'Could not save your profile.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  const roleLabel =
    profile?.role === 'admin'
      ? 'Administrator'
      : profile?.role === 'preceptor'
        ? 'Preceptor'
        : 'Abhyasi'

  return (
    <div className="space-y-5">
      <h1 className="font-serif text-2xl text-ink-900">Profile</h1>

      {/* Identity card */}
      <Card className="flex items-center gap-4">
        <Avatar name={profile?.full_name ?? '?'} className="h-14 w-14 text-lg" />
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink-900">{profile?.full_name}</p>
          {profile?.email && (
            <p className="mt-0.5 inline-flex items-center gap-1 truncate text-sm text-ink-500">
              <Mail className="h-3.5 w-3.5" /> {profile.email}
            </p>
          )}
          <div className="mt-1.5">
            <Badge tone={isPreceptor ? 'gold' : 'brand'}>{roleLabel}</Badge>
          </div>
        </div>
      </Card>

      {/* Quick links */}
      <div className="space-y-2">
        {isPreceptor && (
          <Link to="/availability">
            <Card className="flex items-center gap-3 py-3">
              <CalendarCog className="h-5 w-5 text-brand-600" />
              <span className="flex-1 font-medium text-ink-800">Manage my schedule</span>
              <ChevronRight className="h-4 w-4 text-ink-300" />
            </Card>
          </Link>
        )}
        {isAdmin && (
          <Link to="/admin">
            <Card className="flex items-center gap-3 py-3">
              <ShieldCheck className="h-5 w-5 text-brand-600" />
              <span className="flex-1 font-medium text-ink-800">Master data</span>
              <ChevronRight className="h-4 w-4 text-ink-300" />
            </Card>
          </Link>
        )}
      </div>

      {/* Editable details */}
      <Card className="space-y-4">
        <p className="text-sm font-semibold text-ink-700">Your details</p>

        <Field label="Name">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>

        <Field label="Phone number">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            placeholder="e.g. 98xxxxxxxx"
          />
        </Field>

        <Field label="Zone">
          <Select value={zoneId} onChange={(e) => onZoneChange(e.target.value)}>
            <option value="">Select your zone</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Center">
          <Select
            value={centerId}
            onChange={(e) => onCenterChange(e.target.value)}
            disabled={!zoneId}
          >
            <option value="">{zoneId ? 'Select your center' : 'Choose a zone first'}</option>
            {centers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.city}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Area" hint="Optional">
          <Select value={areaId} onChange={(e) => setAreaId(e.target.value)} disabled={!centerId}>
            <option value="">{centerId ? 'Select your area' : 'Choose a center first'}</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>

        <div>
          <p className="mb-2 text-sm font-medium text-ink-700">Home location</p>
          {coords ? (
            <div className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">
              <span className="inline-flex items-center gap-2">
                <Check className="h-4 w-4" /> Saved for “near me” search
              </span>
              <button
                onClick={() => setCoords(null)}
                className="text-xs font-medium text-emerald-700 underline"
              >
                Remove
              </button>
            </div>
          ) : (
            <Button variant="secondary" full onClick={useMyLocation} disabled={geoState === 'loading'}>
              {geoState === 'loading' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MapPin className="h-4 w-4" />
              )}
              {geoState === 'loading' ? 'Getting location…' : 'Use my current location'}
            </Button>
          )}
          {geoState === 'error' && (
            <p className="mt-2 text-xs text-amber-700">Couldn’t get your location.</p>
          )}
        </div>

        {error && (
          <p className="rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
            {error}
          </p>
        )}

        <Button full onClick={save} loading={saving}>
          {saved ? (
            <>
              <Check className="h-4 w-4" /> Saved
            </>
          ) : (
            'Save changes'
          )}
        </Button>
      </Card>

      <Button variant="danger" full onClick={handleSignOut}>
        <LogOut className="h-4 w-4" /> Sign out
      </Button>
    </div>
  )
}
