import { Outlet, useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { BottomNav } from './BottomNav'
import { useAuth } from '../context/AuthContext'
import { useUnreadNotifications } from '../lib/notifications'
import { Avatar } from './ui'

export function Layout() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const { count: unread } = useUnreadNotifications(user?.id)

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col">
      {/* Slim top bar */}
      <header className="safe-top sticky top-0 z-20 border-b border-brand-100 bg-white/85 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2"
            aria-label="Home"
          >
            <span className="relative flex h-7 w-7 items-center justify-center">
              <span className="absolute h-7 w-7 animate-breathe rounded-full bg-brand-100" />
              <span className="relative h-2.5 w-2.5 rounded-full bg-brand-600" />
            </span>
            <span className="font-serif text-lg leading-none text-ink-900">
              Heartfulness <span className="text-brand-600">Sittings</span>
            </span>
          </button>
          {profile && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => navigate('/notifications')}
                className="relative rounded-lg p-2 text-ink-500 hover:bg-brand-50 hover:text-brand-700"
                aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
              >
                <Bell className="h-5 w-5" />
                {unread > 0 && (
                  <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold leading-none text-white">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>
              <button onClick={() => navigate('/profile')} aria-label="Your profile">
                <Avatar name={profile.full_name} className="h-9 w-9 text-sm" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 px-4 pb-28 pt-4">
        <Outlet />
      </main>

      <BottomNav />
    </div>
  )
}
