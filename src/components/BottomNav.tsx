import { NavLink } from 'react-router-dom'
import { Home, Search, CalendarCheck, CalendarClock, UserRound, type LucideIcon } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { cx } from '../lib/utils'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

export function BottomNav() {
  const { profile } = useAuth()
  const isPreceptor = profile?.role === 'preceptor' || profile?.role === 'admin'

  const items: NavItem[] = [
    { to: '/dashboard', label: 'Home', icon: Home },
    { to: '/find', label: 'Find', icon: Search },
    { to: '/bookings', label: 'My sittings', icon: CalendarCheck },
  ]
  if (isPreceptor) {
    items.push({ to: '/sittings', label: 'Incoming', icon: CalendarClock })
    items.push({ to: '/availability', label: 'Schedule', icon: UserRound })
  } else {
    items.push({ to: '/profile', label: 'Profile', icon: UserRound })
  }

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-brand-100 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-md items-stretch justify-around px-1 pt-1.5">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cx(
                'flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium transition-colors',
                isActive ? 'text-brand-700' : 'text-ink-400 hover:text-ink-700',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cx('h-5 w-5', isActive && 'stroke-[2.4]')} />
                <span className="leading-none">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
