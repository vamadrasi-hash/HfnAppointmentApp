import { Outlet, useNavigate } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { useAuth } from '../context/AuthContext'
import { Avatar } from './ui'
import { HeartfulnessMark, HeartfulnessWordmark } from './Logo'

export function Layout() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col">
      {/* Slim top bar */}
      <header className="safe-top sticky top-0 z-20 border-b border-brand-100 bg-white/85 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2.5"
            aria-label="Home"
          >
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-brand-50" />
              <HeartfulnessMark className="relative h-[1.45rem] w-[1.45rem]" />
            </span>
            <HeartfulnessWordmark compact className="w-[5.6rem]" />
            <span className="h-4 w-px bg-brand-200" />
            <span className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-brand-600">
              Sittings
            </span>
          </button>
          {profile && (
            <button onClick={() => navigate('/profile')} aria-label="Your profile">
              <Avatar name={profile.full_name} className="h-9 w-9 text-sm" />
            </button>
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
