import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Search,
  CalendarClock,
  CalendarCog,
  ShieldCheck,
  ArrowRight,
  CalendarCheck,
  Clock3,
  UserCheck,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getMyBookings } from '../lib/api'
import type { BookingDetail } from '../lib/types'
import {
  isAdmin as isAdminRole,
  isApprovedPreceptor,
  isPendingPreceptor,
  roleLabel,
} from '../lib/roles'
import { Badge, Card, SectionTitle } from '../components/ui'
import { PlaceLine } from '../components/PlaceLine'
import { formatTimeRange, prettyDate, isPastDate } from '../lib/utils'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function QuickAction({
  to,
  icon,
  title,
  subtitle,
}: {
  to: string
  icon: ReactNode
  title: string
  subtitle: string
}) {
  return (
    <Link to={to}>
      <Card className="flex items-center gap-3 transition-shadow hover:shadow-lift">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink-900">{title}</p>
          <p className="truncate text-sm text-ink-500">{subtitle}</p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-ink-300" />
      </Card>
    </Link>
  )
}

export default function Dashboard() {
  const { user, profile } = useAuth()
  const canGiveSittings = isApprovedPreceptor(profile)
  const awaitingApproval = isPendingPreceptor(profile)
  const isAdmin = isAdminRole(profile)

  const [next, setNext] = useState<BookingDetail | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!user) return
    getMyBookings(user.id)
      .then((all) => {
        const upcoming = all
          .filter(
            (b) =>
              (b.status === 'confirmed' || b.status === 'reminded') && !isPastDate(b.booking_date),
          )
          .sort((a, b) => a.booking_date.localeCompare(b.booking_date))
        setNext(upcoming[0] ?? null)
      })
      .catch(() => setNext(null))
      .finally(() => setLoaded(true))
  }, [user])

  const firstName = profile?.full_name?.split(' ')[0] ?? ''

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-ink-500">{greeting()},</p>
        <h1 className="font-serif text-2xl text-ink-900">{firstName} 🙏</h1>
        <div className="mt-2">
          <Badge tone={awaitingApproval ? 'amber' : canGiveSittings ? 'gold' : 'brand'}>
            {roleLabel(profile)}
          </Badge>
        </div>
      </div>

      {/* Signed up as a preceptor, still waiting on an administrator */}
      {awaitingApproval && (
        <Card className="border-amber-200 bg-amber-50/60">
          <p className="inline-flex items-center gap-2 font-semibold text-amber-800">
            <Clock3 className="h-4 w-4" /> Awaiting approval
          </p>
          <p className="mt-1 text-sm text-amber-800">
            An administrator is reviewing your preceptor account. Once it is approved you can
            publish your schedule and take sitting requests. In the meantime you can request
            sittings with other preceptors.
          </p>
        </Card>
      )}

      {/* Next sitting */}
      {loaded && next && (
        <div>
          <SectionTitle hint="Upcoming">Your next sitting</SectionTitle>
          <Link to="/bookings">
            <Card className="border-brand-200 bg-brand-50/40">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-ink-900">
                    {next.preceptor?.full_name ?? 'Preceptor'}
                  </p>
                  <PlaceLine place={next.place} className="mt-0.5" />
                </div>
                <CalendarCheck className="h-5 w-5 text-brand-500" />
              </div>
              <div className="mt-3 flex items-center gap-2 text-sm text-ink-700">
                <Badge tone="brand">{prettyDate(next.booking_date)}</Badge>
                {next.slot && (
                  <span className="text-ink-500">
                    {formatTimeRange(next.slot.start_time, next.slot.end_time)}
                  </span>
                )}
              </div>
            </Card>
          </Link>
        </div>
      )}

      {/* Quick actions */}
      <div>
        <SectionTitle>What would you like to do?</SectionTitle>
        <div className="space-y-3">
          <QuickAction
            to="/find"
            icon={<Search className="h-5 w-5" />}
            title="Find a sitting"
            subtitle="Browse preceptors and request a time"
          />

          {canGiveSittings && (
            <>
              <QuickAction
                to="/availability"
                icon={<CalendarCog className="h-5 w-5" />}
                title="Manage my schedule"
                subtitle="Set the times you can give sittings"
              />
              <QuickAction
                to="/sittings"
                icon={<CalendarClock className="h-5 w-5" />}
                title="Incoming sittings"
                subtitle="Confirm and manage requests"
              />
            </>
          )}

          {isAdmin && (
            <>
              <QuickAction
                to="/admin/preceptors"
                icon={<UserCheck className="h-5 w-5" />}
                title="Preceptor approvals"
                subtitle="Approve who may give sittings"
              />
              <QuickAction
                to="/admin"
                icon={<ShieldCheck className="h-5 w-5" />}
                title="Master data"
                subtitle="Zones, centers and heartspots"
              />
            </>
          )}
        </div>
      </div>

      {canGiveSittings && (
        <p className="px-1 text-center text-xs text-ink-400">
          As a preceptor you can both give sittings and book sittings with others.
        </p>
      )}
    </div>
  )
}
