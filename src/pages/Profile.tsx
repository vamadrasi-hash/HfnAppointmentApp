import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Check,
  LogOut,
  CalendarCog,
  ShieldCheck,
  ChevronRight,
  Mail,
  Lock,
  MessageCircle,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { upsertProfile, saveHomePlace } from '../lib/api'
import { buildProfileShareText, whatsappShareUrl } from '../lib/share'
import { Avatar, Badge, Button, Card, Field, Input } from '../components/ui'
import { ZoneCenterPicker, type ZoneCenterValue } from '../components/ZoneCenterPicker'
import { LocationPicker, toPlaceValue, type PlaceValue } from '../components/LocationPicker'

export default function Profile() {
  const { user, profile, setProfile, signOut } = useAuth()
  const navigate = useNavigate()

  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')

  const [place, setPlace] = useState<ZoneCenterValue>({
    zoneId: profile?.zone_id ?? '',
    centerId: profile?.center_id ?? '',
    city: profile?.city ?? null,
  })

  // Where you live: the origin for your own "near me" search, and — if you
  // are a preceptor giving sittings at home — the address abhyasis are
  // given once you confirm their sitting.
  const [home, setHome] = useState<PlaceValue>(toPlaceValue(profile?.home_place ?? {}))

  const [autoConfirm, setAutoConfirm] = useState(profile?.auto_confirm ?? false)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isPreceptor = profile?.role === 'preceptor' || profile?.role === 'admin'
  const isAdmin = profile?.role === 'admin'

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
      // The home address is a table of its own, so it saves separately.
      await saveHomePlace(user.id, {
        address: home.address.trim() || null,
        latitude: home.latitude,
        longitude: home.longitude,
        map_url: home.map_url,
      })
      const updated = await upsertProfile({
        id: user.id,
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        zone_id: place.zoneId || null,
        center_id: place.centerId || null,
        city: place.city,
        ...(isPreceptor ? { auto_confirm: autoConfirm } : {}),
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

  // Built from what is on screen, so edits are shared even before saving.
  const shareText = buildProfileShareText({
    fullName,
    phone,
    address: home.address,
    latitude: home.latitude,
    longitude: home.longitude,
    map_url: home.map_url,
  })

  function shareOnWhatsApp() {
    window.open(whatsappShareUrl(shareText), '_blank', 'noopener,noreferrer')
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

      {/* Share my details on WhatsApp */}
      <Card className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-ink-700">Share my details</p>
          <p className="mt-0.5 text-xs text-ink-500">
            Sends your name, phone, address and map link to any WhatsApp chat.
          </p>
        </div>

        <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-brand-100 bg-brand-50/50 px-3.5 py-2.5 font-sans text-xs leading-relaxed text-ink-600">
          {shareText}
        </pre>

        <Button
          full
          onClick={shareOnWhatsApp}
          className="border-transparent bg-[#25D366] text-white shadow-soft hover:bg-[#1da851] active:bg-[#128C7E]"
        >
          <MessageCircle className="h-4 w-4" /> Share on WhatsApp
        </Button>

        {!home.address.trim() && !home.latitude && !home.map_url && (
          <p className="text-xs text-amber-700">
            Add your home address and Google location below to include them.
          </p>
        )}
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

      {/* Preceptor: auto-confirm preference */}
      {isPreceptor && (
        <Card>
          <label className="flex cursor-pointer items-start justify-between gap-3">
            <span>
              <span className="block font-medium text-ink-800">Auto-confirm requests</span>
              <span className="mt-0.5 block text-sm text-ink-500">
                When on, sitting requests are confirmed instantly instead of waiting for you to
                approve each one.
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={autoConfirm}
              onClick={() => setAutoConfirm((v) => !v)}
              className={
                'relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ' +
                (autoConfirm ? 'bg-brand-600' : 'bg-slate-300')
              }
            >
              <span
                className={
                  'inline-block h-5 w-5 transform rounded-full bg-white transition-transform ' +
                  (autoConfirm ? 'translate-x-5' : 'translate-x-0.5')
                }
              />
            </button>
          </label>
        </Card>
      )}

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

        <ZoneCenterPicker
          zoneId={place.zoneId}
          centerId={place.centerId}
          onChange={setPlace}
        />

        <div className="border-t border-brand-50 pt-4">
          <p className="text-sm font-semibold text-ink-700">Home address</p>
          <p className="mt-0.5 mb-3 text-xs text-ink-500">
            {isPreceptor
              ? 'Sorts “near me” by distance from here — and is the address abhyasis are given when you give a sitting at home.'
              : 'Only used to sort preceptors by distance from you in “near me”.'}
          </p>

          <LocationPicker
            value={home}
            onChange={setHome}
            addressLabel="Address"
            addressHint="Optional. A landmark helps people find the door."
            addressPlaceholder="Flat / house, society, road, area"
          />

          <p className="mt-3 flex items-start gap-2 rounded-xl border border-brand-100 bg-brand-50/60 px-3.5 py-2.5 text-xs text-ink-600">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-500" />
            <span>
              {isPreceptor
                ? 'Nobody sees this until you confirm their sitting at your home. Before that they see only your city and center, and a map pin no closer than about a kilometre.'
                : 'This is yours alone — no other user can read it.'}
            </span>
          </p>
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
