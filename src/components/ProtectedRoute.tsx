import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { PageLoader } from './ui'

// Requires a signed-in user with a completed profile.
// - No session         -> /login
// - Session, no profile -> /onboarding
// - adminOnly route, non-admin -> /dashboard
export function ProtectedRoute({
  children,
  adminOnly,
}: {
  children: ReactNode
  adminOnly?: boolean
}) {
  const { user, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) return <PageLoader label="Just a moment…" />
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  if (!profile) return <Navigate to="/onboarding" replace />
  if (adminOnly && profile.role !== 'admin') return <Navigate to="/dashboard" replace />

  return <>{children}</>
}
