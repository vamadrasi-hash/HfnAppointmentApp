import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, Loader2, Check } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getZones, getCenters, getAreas, upsertProfile } from '../lib/api'
import type { Zone, Center, Area, UserRole } from '../lib/types'
import { Button, Card, Field, Input, Select } from '../components/ui'

// First-run screen: collect the details we need before showing the app.
export default function Onboarding() {
  const { user, setProfile } = useAuth()
  const navigate = useNavigate()

  // Prefill the name from the Google / sign-up metadata when we have it.
  const prefillName = useMemo(() => {
    const meta = (user?.user_metadata ?? {}) as Record<string, unknown>
    return (
      (meta.full_name as string) ||
      (meta.name as string) ||
      ''
    )
  }, [user])

  const [fullName, setFullName] = useState(prefillName)
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<UserRole>('abhyasi')

  const [zones, setZones] = useState<Zone[]>([])
  const [centers, setCenters] = useState<Center[]>([])
  const [areas, setAreas] = useState<Area[]>([])

  const [zoneId, setZoneId] = useState('')
  const [centerId, setCenterId] = useState('')
  const [areaId, setAreaId] = useState('')

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [geoState, setGeoState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setFullName((n) => n || prefillName)
  }, [prefillName])

  // Load zones once.
  useEffect(() => {
    getZones().then(setZones).catch((e) => setError(e.message))
  }, [])

  // When the zone changes, load its centers and reset the deeper levels.
  useEffect(() => {
    setCenterId('')
    setAreaId('')
    setCenters([])
    setAreas([])
    if (!zoneId) return
    getCenters(zoneId).then(setCenters).catch((e) => setError(e.message))
  }, [zoneId])

  // When the center changes, load its areas and reset the area.
  useEffect(() => {
    setAreaId('')
    setAreas([])
    if (!centerId) return
    getAreas(centerId).then(setAreas).catch((e) => setError(e.message))
  }, [centerId])

  const selectedCenter = centers.find((c) => c.id === centerId)

  function useMyLocation() {
    if (!('geolocation' in navigator)) {
      setGeoState('error')
      return
    }
    setGeoState('loading')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGeoState('done')
      },
      () => setGeoState('error'),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  async function handleSave() {
    setError(null)
    if (!user) return
    if (!fullName.trim()) {
      setError('Please enter your name.')
      return
    }
    setSaving(true)
    try {
      const saved = await upsertProfile({
        id: user.id,
        full_name: fullName.trim(),
        email: user.email ?? null,
        phone: phone.trim() || null,
        role,
        zone_id: zoneId || null,
        center_id: centerId || null,
        area_id: areaId || null,
        city: selectedCenter?.city ?? null,
        home_latitude: coords?.lat ?? null,
        home_longitude: coords?.lng ?? null,
      })
      setProfile(saved)
      navigate('/dashboard', { replace: true })
    } catch (e: any) {
      setError(e.message ?? 'Could not save your profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto min-h-full max-w-md px-4 py-8">
      <div className="mb-6 text-center">
        <h1 className="font-serif text-2xl text-ink-900">Welcome 🙏</h1>
        <p className="mt-1 text-sm text-ink-500">
          A few details so we can connect you with the right preceptors.
        </p>
      </div>

      <Card className="space-y-4">
        <Field label="Your name">
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name"
            autoComplete="name"
          />
        </Field>

        <Field label="Phone number" hint="Shared with the preceptor for your sitting only.">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. 98xxxxxxxx"
            inputMode="tel"
            autoComplete="tel"
          />
        </Field>

        <Field
          label="I am a…"
          hint={
            role === 'preceptor'
              ? 'Preceptors can give sittings and also book sittings with others.'
              : 'Abhyasis book sittings with preceptors.'
          }
        >
          <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            <option value="abhyasi">Abhyasi (practitioner)</option>
            <option value="preceptor">Preceptor (trainer)</option>
          </Select>
        </Field>

        <div className="border-t border-brand-50 pt-4">
          <p className="mb-3 text-sm font-medium text-ink-700">Where you belong</p>
          <div className="space-y-3">
            <Field label="Zone">
              <Select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
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
                onChange={(e) => setCenterId(e.target.value)}
                disabled={!zoneId}
              >
                <option value="">
                  {zoneId ? 'Select your center' : 'Choose a zone first'}
                </option>
                {centers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.city}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Area" hint="Optional">
              <Select
                value={areaId}
                onChange={(e) => setAreaId(e.target.value)}
                disabled={!centerId}
              >
                <option value="">
                  {centerId ? 'Select your area' : 'Choose a center first'}
                </option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>

        <div className="border-t border-brand-50 pt-4">
          <p className="mb-1 text-sm font-medium text-ink-700">Find sittings near home</p>
          <p className="mb-3 text-xs text-ink-400">
            Optional. Lets you sort preceptors by distance from where you are.
          </p>
          {geoState === 'done' ? (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">
              <Check className="h-4 w-4" /> Location saved
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
            <p className="mt-2 text-xs text-amber-700">
              Couldn't get your location. You can still continue and add it later.
            </p>
          )}
        </div>

        {error && (
          <p className="rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
            {error}
          </p>
        )}

        <Button full onClick={handleSave} loading={saving}>
          Continue
        </Button>
      </Card>
    </div>
  )
}
