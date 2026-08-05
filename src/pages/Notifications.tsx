import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bell,
  BellOff,
  CalendarClock,
  Check,
  CheckCheck,
  CalendarPlus,
  X,
  CalendarX2,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getNotifications, markNotificationsRead } from '../lib/api'
import { NOTIFICATION_DESTINATION as DESTINATION, notificationsChanged } from '../lib/notifications'
import {
  askForPushPermission,
  backgroundPushConfigured,
  pushPermission,
  registerForBackgroundPush,
  type PushPermission,
} from '../lib/push'
import type { AppNotification, NotificationKind } from '../lib/types'
import { Button, Card, EmptyState, PageLoader } from '../components/ui'
import { cx } from '../lib/utils'

function icon(kind: NotificationKind) {
  switch (kind) {
    case 'request':
      return <CalendarClock className="h-4 w-4" />
    case 'open_request':
      return <CalendarPlus className="h-4 w-4" />
    case 'confirmed':
      return <Check className="h-4 w-4" />
    case 'declined':
      return <X className="h-4 w-4" />
    case 'cancelled':
      return <CalendarX2 className="h-4 w-4" />
    default:
      return <CalendarClock className="h-4 w-4" />
  }
}

// 'just now', '5 min ago', '3 h ago', then the date.
function ago(iso: string): string {
  const then = new Date(iso).getTime()
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} d ago`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/**
 * The one place that asks for permission to pop up. Browsers only allow
 * the question from a tap, so it is a button rather than something that
 * happens on load.
 */
function PopupPermissionCard({ profileId }: { profileId: string }) {
  const [permission, setPermission] = useState<PushPermission>(() => pushPermission())
  const [asking, setAsking] = useState(false)

  if (permission === 'unsupported') return null

  if (permission === 'granted') {
    return (
      <Card className="flex items-start gap-3 border-emerald-100 bg-emerald-50/50 py-3">
        <Bell className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <p className="text-sm text-emerald-800">
          Pop-up notifications are on
          {backgroundPushConfigured
            ? ' — you will hear about a request even when the app is closed.'
            : ' while the app is open.'}
        </p>
      </Card>
    )
  }

  if (permission === 'denied') {
    return (
      <Card className="flex items-start gap-3 border-amber-100 bg-amber-50/60 py-3">
        <BellOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <p className="text-sm text-amber-800">
          Pop-up notifications are blocked for this site. Turn them back on in your browser’s site
          settings — the list below stays up to date either way.
        </p>
      </Card>
    )
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <Bell className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
        <div>
          <p className="text-sm font-semibold text-ink-800">Turn on pop-up notifications</p>
          <p className="mt-0.5 text-sm text-ink-500">
            Be told the moment someone requests a sitting with you, or answers one of yours.
          </p>
        </div>
      </div>
      <Button
        full
        loading={asking}
        onClick={async () => {
          setAsking(true)
          const next = await askForPushPermission()
          setPermission(next)
          if (next === 'granted') await registerForBackgroundPush(profileId)
          setAsking(false)
        }}
      >
        <Bell className="h-4 w-4" /> Allow notifications
      </Button>
    </Card>
  )
}

export default function Notifications() {
  const { user } = useAuth()
  const [items, setItems] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      setItems(await getNotifications(user.id))
    } catch (e: any) {
      setError(e.message ?? 'Could not load your notifications.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  async function markAllRead() {
    if (!user) return
    try {
      await markNotificationsRead(user.id)
      setItems((list) =>
        list.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })),
      )
      notificationsChanged()
    } catch (e: any) {
      setError(e.message ?? 'Could not mark them read.')
    }
  }

  async function open(n: AppNotification) {
    if (n.read_at || !user) return
    try {
      await markNotificationsRead(user.id, [n.id])
      notificationsChanged()
    } catch {
      // Following the link matters more than the badge.
    }
  }

  if (loading) return <PageLoader label="Loading notifications…" />

  const unread = items.filter((n) => !n.read_at).length

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl text-ink-900">Notifications</h1>
          <p className="mt-1 text-sm text-ink-500">
            {unread > 0 ? `${unread} unread` : 'You are up to date.'}
          </p>
        </div>
        {unread > 0 && (
          <Button variant="secondary" onClick={markAllRead} className="shrink-0">
            <CheckCheck className="h-4 w-4" /> Mark all read
          </Button>
        )}
      </div>

      {user && <PopupPermissionCard profileId={user.id} />}

      {error && (
        <p className="rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<BellOff className="h-8 w-8" />}
          title="Nothing yet"
          subtitle="You'll hear here when someone requests a sitting with you, and when a request of yours is answered."
        />
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <Link key={n.id} to={DESTINATION[n.kind] ?? '/dashboard'} onClick={() => open(n)}>
              <Card
                className={cx(
                  'flex items-start gap-3 py-3 transition-shadow hover:shadow-lift',
                  !n.read_at && 'border-brand-200 bg-brand-50/40',
                )}
              >
                <span
                  className={cx(
                    'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                    n.read_at ? 'bg-slate-50 text-ink-400' : 'bg-brand-100 text-brand-700',
                  )}
                >
                  {icon(n.kind)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span
                      className={cx(
                        'truncate text-sm',
                        n.read_at ? 'text-ink-700' : 'font-semibold text-ink-900',
                      )}
                    >
                      {n.title}
                    </span>
                    <span className="shrink-0 text-[11px] text-ink-400">{ago(n.created_at)}</span>
                  </span>
                  {/* A cancellation carries the preceptor's own words, in
                      English and Hindi, on their own lines. */}
                  {n.body && (
                    <span className="mt-0.5 block whitespace-pre-line text-sm text-ink-500">
                      {n.body}
                    </span>
                  )}
                </span>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
