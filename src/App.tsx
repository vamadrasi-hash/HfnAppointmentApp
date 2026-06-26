import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { PageLoader } from './components/ui'

import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import FindPreceptors from './pages/FindPreceptors'
import BookingsList from './pages/BookingsList'
import Availability from './pages/Availability'
import MySittings from './pages/MySittings'
import Profile from './pages/Profile'
import AdminMasterData from './pages/AdminMasterData'

// Onboarding sits between sign-in and the app: it needs a session but
// must run before a profile exists.
function OnboardingRoute() {
  const { user, profile, loading } = useAuth()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace />
  if (profile) return <Navigate to="/dashboard" replace />
  return <Onboarding />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/onboarding" element={<OnboardingRoute />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/find" element={<FindPreceptors />} />
        <Route path="/bookings" element={<BookingsList />} />
        <Route path="/availability" element={<Availability />} />
        <Route path="/sittings" element={<MySittings />} />
        <Route path="/profile" element={<Profile />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute adminOnly>
              <AdminMasterData />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
