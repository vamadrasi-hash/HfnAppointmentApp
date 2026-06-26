import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Search,
  CalendarClock,
  CalendarCog,
  ShieldCheck,
  ArrowRight,
  CalendarCheck,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getMyBookings } from '../lib/api'
import type { BookingDetail } from '../lib/types'
import { Badge, Card, SectionTitle } from '../components/ui'
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
  const isPreceptor = profile?.role === 'preceptor' || profile?.role === 'admin'
  const isAdmin = profile?.role === 'admin'

  const [next, setNext] = useState<BookingDetail | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!user) return
    getMyBookings(user.id)
      .then((all) => {
        const upcoming = all
          .filter((b) => b.status !== 'cancelled' && !isPastDate(b.booking_date))
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
          <Badge tone={isPreceptor ? 'gold' : 'brand'}>
            {profile?.role === 'admin'
              ? 'Administrator'
              : profile?.role === 'preceptor'
                ? 'Preceptor'
                : 'Abhyasi'}
          </Badge>
        </div>
      </div>

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
                  <p className="mt-0.5 text-sm text-ink-500">
                    {next.center?.name}
                    {next.center?.city ? `, ${next.center.city}` : ''}
                  </p>
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
            subtitle="Browse preceptors and book a time"
          />

          {isPreceptor && (
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
                subtitle="See who has booked with you"
              />
            </>
          )}

          {isAdmin && (
            <QuickAction
              to="/admin"
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Master data"
              subtitle="Zones, centers and areas"
            />
          )}
        </div>
      </div>

      {isPreceptor && (
        <p className="px-1 text-center text-xs text-ink-400">
          As a preceptor you can both give sittings and book sittings with others.
        </p>
      )}
    </div>
  )
}
