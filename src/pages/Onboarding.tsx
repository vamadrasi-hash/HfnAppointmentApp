import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, Loader2, Check } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { upsertProfile, saveHomePlace } from '../lib/api'
import type { UserRole } from '../lib/types'
import { Button, Card, Field, Input, Select } from '../components/ui'
import { ZoneCenterPicker, type ZoneCenterValue } from '../components/ZoneCenterPicker'

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

  // Zone + the searchable City / Center list. `city` rides along so we can
  // stamp it onto the profile without another lookup.
  const [place, setPlace] = useState<ZoneCenterValue>({ zoneId: '', centerId: '', city: null })

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [geoState, setGeoState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setFullName((n) => n || prefillName)
  }, [prefillName])

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
        zone_id: place.zoneId || null,
        center_id: place.centerId || null,
        city: place.city,
      })
      // Where you live is a table of its own, so it saves separately. The
      // full address comes later, on the profile screen.
      if (coords) {
        await saveHomePlace(user.id, {
          address: null,
          latitude: coords.lat,
          longitude: coords.lng,
          map_url: null,
        })
      }
      setProfile({ ...saved, home_place: coords ? { address: null, latitude: coords.lat, longitude: coords.lng, map_url: null } : null })
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
          <ZoneCenterPicker
            zoneId={place.zoneId}
            centerId={place.centerId}
            onChange={setPlace}
          />
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
