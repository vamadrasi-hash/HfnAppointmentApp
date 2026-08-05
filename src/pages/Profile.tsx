import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Check,
  CheckCircle2,
  Clock3,
  LogOut,
  CalendarCog,
  ShieldCheck,
  ChevronRight,
  Mail,
  Lock,
  MessageCircle,
  Copy,
  UserCheck,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { upsertProfile, saveHomePlace } from '../lib/api'
import { buildProfileShareText, copyText, whatsappShareUrl } from '../lib/share'
import {
  isAdmin as isAdminRole,
  isApprovedPreceptor,
  isPendingPreceptor,
  isPreceptorRole,
  isRejectedPreceptor,
  roleLabel,
} from '../lib/roles'
import { Avatar, Badge, Button, Card, Field, Input, Toggle } from '../components/ui'
import { Modal } from '../components/Modal'
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
  // Being open to times outside the schedule is also what puts a preceptor
  // in "near me" on days they hold no slot.
  const [openRequests, setOpenRequests] = useState(profile?.accepts_open_requests ?? false)

  const [copied, setCopied] = useState(false)

  const [saving, setSaving] = useState(false)
  // Every save ends in a word: a confirmation people have to dismiss, so a
  // change is never left in doubt.
  const [savedOpen, setSavedOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Registered as a preceptor — which is what decides whether this screen
  // shows the things preceptors need, like an address abhyasis will be
  // given. Actually *giving* sittings needs an administrator's approval.
  const isPreceptor = isPreceptorRole(profile)
  const canGiveSittings = isApprovedPreceptor(profile)
  const awaitingApproval = isPendingPreceptor(profile)
  const approvalRefused = isRejectedPreceptor(profile)
  const isAdmin = isAdminRole(profile)

  async function save() {
    if (!user) return
    setError(null)
    if (!fullName.trim()) {
      setError('Please enter your name.')
      return
    }
    setSaving(true)
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
        ...(canGiveSittings
          ? { auto_confirm: autoConfirm, accepts_open_requests: openRequests }
          : {}),
      })
      setProfile(updated)
      setSavedOpen(true)
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

  async function copyShareText() {
    if (!(await copyText(shareText))) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

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
            <Badge tone={awaitingApproval || approvalRefused ? 'amber' : isPreceptor ? 'gold' : 'brand'}>
              {roleLabel(profile)}
            </Badge>
          </div>
        </div>
      </Card>

      {/* Waiting on an administrator */}
      {awaitingApproval && (
        <Card className="border-amber-200 bg-amber-50/60">
          <p className="inline-flex items-center gap-2 font-semibold text-amber-800">
            <Clock3 className="h-4 w-4" /> Your preceptor account is awaiting approval
          </p>
          <p className="mt-1 text-sm text-amber-800">
            An administrator has to confirm that you serve as a preceptor before you can publish
            your schedule and receive sitting requests. Until then you can use the app as usual and
            request sittings with others.
          </p>
        </Card>
      )}

      {approvalRefused && (
        <Card className="border-amber-200 bg-amber-50/60">
          <p className="font-semibold text-amber-800">Your preceptor account was not approved</p>
          <p className="mt-1 text-sm text-amber-800">
            You can still request sittings with preceptors. If you believe this is a mistake, speak
            to your center's coordinator.
          </p>
        </Card>
      )}

      {/* Share my details on WhatsApp — a preceptor's details are meant to
          reach the abhyasis coming to them; an abhyasi's are their own. */}
      {isPreceptor && (
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

          <div className="flex gap-2">
            <Button
              onClick={shareOnWhatsApp}
              className="flex-1 border-transparent bg-[#25D366] text-white shadow-soft hover:bg-[#1da851] active:bg-[#128C7E]"
            >
              <MessageCircle className="h-4 w-4" /> Share on WhatsApp
            </Button>
            <Button variant="secondary" onClick={copyShareText}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>

          {!home.address.trim() && !home.latitude && !home.map_url && (
            <p className="text-xs text-amber-700">
              Add your home address and Google location below to include them.
            </p>
          )}
        </Card>
      )}

      {/* Quick links */}
      <div className="space-y-2">
        {canGiveSittings && (
          <Link to="/availability">
            <Card className="flex items-center gap-3 py-3">
              <CalendarCog className="h-5 w-5 text-brand-600" />
              <span className="flex-1 font-medium text-ink-800">Manage my schedule</span>
              <ChevronRight className="h-4 w-4 text-ink-300" />
            </Card>
          </Link>
        )}
        {isAdmin && (
          <>
            <Link to="/admin/preceptors">
              <Card className="flex items-center gap-3 py-3">
                <UserCheck className="h-5 w-5 text-brand-600" />
                <span className="flex-1 font-medium text-ink-800">Preceptor approvals</span>
                <ChevronRight className="h-4 w-4 text-ink-300" />
              </Card>
            </Link>
            <Link to="/admin">
              <Card className="flex items-center gap-3 py-3">
                <ShieldCheck className="h-5 w-5 text-brand-600" />
                <span className="flex-1 font-medium text-ink-800">Master data</span>
                <ChevronRight className="h-4 w-4 text-ink-300" />
              </Card>
            </Link>
          </>
        )}
      </div>

      {/* Preceptor: how requests reach you */}
      {canGiveSittings && (
        <Card className="space-y-4">
          <p className="text-sm font-semibold text-ink-700">Requests</p>

          <Toggle
            checked={autoConfirm}
            onChange={setAutoConfirm}
            label="Auto-confirm requests"
            hint="When on, sitting requests on your published times are confirmed instantly instead of waiting for you to approve each one."
          />

          <div className="border-t border-brand-50 pt-4">
            <Toggle
              checked={openRequests}
              onChange={setOpenRequests}
              label="Accept requests outside my schedule"
              hint="When on, abhyasis can ask you for a time you haven’t published — and you appear in “near me” even on days you hold no slot. These always wait for you to accept; auto-confirm does not apply to them."
            />
          </div>

          <p className="text-xs text-ink-400">
            Both take effect when you save, below.
          </p>
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
              : 'Yours alone. Nobody is ever sent here — “near me” uses your phone’s location when you turn it on.'}
          </p>

          {/* An abhyasi never has to be found: no map pin, no Maps link. A
              preceptor does, so theirs stays. */}
          <LocationPicker
            value={home}
            onChange={setHome}
            showGoogleLocation={isPreceptor}
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
          Save changes
        </Button>
      </Card>

      <Button variant="danger" full onClick={handleSignOut}>
        <LogOut className="h-4 w-4" /> Sign out
      </Button>

      {/* Save confirmation — shown to everyone, every time */}
      <Modal
        open={savedOpen}
        onClose={() => setSavedOpen(false)}
        title="Profile saved"
        footer={
          <Button full onClick={() => setSavedOpen(false)}>
            Done
          </Button>
        }
      >
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <p className="text-sm text-ink-600">Your changes have been saved.</p>
        </div>
      </Modal>
    </div>
  )
}
