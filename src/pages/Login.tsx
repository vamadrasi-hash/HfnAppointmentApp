import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Button, Field, Input } from '../components/ui'
import { cx } from '../lib/utils'

export default function Login() {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function google() {
    setError(null)
    setBusy(true)
    try {
      await signInWithGoogle()
      // The browser is redirected to Google, so nothing runs after this.
    } catch (e: any) {
      setError(e.message ?? 'Could not start Google sign-in.')
      setBusy(false)
    }
  }

  async function emailSubmit() {
    setError(null)
    setInfo(null)
    if (!email || !password) {
      setError('Please enter your email and password.')
      return
    }
    if (mode === 'signup' && !fullName.trim()) {
      setError('Please enter your full name.')
      return
    }
    setBusy(true)
    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password)
      } else {
        const { needsConfirmation } = await signUpWithEmail(email, password, fullName.trim())
        if (needsConfirmation) {
          setInfo('Check your email to confirm your account, then sign in.')
          setMode('signin')
        }
      }
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
      {/* Hero */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center">
          <span className="absolute h-20 w-20 animate-breathe rounded-full bg-brand-100" />
          <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-soft">
            <span className="h-5 w-5 rounded-full bg-brand-600" />
          </span>
        </div>
        <h1 className="font-serif text-3xl text-ink-900">
          Heartfulness <span className="text-brand-600">Sittings</span>
        </h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-ink-500">
          Book individual meditation sittings with a preceptor, or offer your own availability.
        </p>
      </div>

      <Button variant="secondary" full onClick={google} loading={busy} className="py-3">
        <GoogleMark /> Continue with Google
      </Button>

      <div className="my-5 flex items-center gap-3 text-xs text-ink-400">
        <div className="h-px flex-1 bg-brand-100" />
        or use email
        <div className="h-px flex-1 bg-brand-100" />
      </div>

      <div className="space-y-3">
        {mode === 'signup' && (
          <Field label="Full name">
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
            />
          </Field>
        )}
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            onKeyDown={(e) => e.key === 'Enter' && emailSubmit()}
          />
        </Field>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {info && <p className="mt-3 text-sm text-brand-700">{info}</p>}

      <Button full onClick={emailSubmit} loading={busy} className="mt-4 py-3">
        {mode === 'signin' ? 'Sign in' : 'Create account'}
      </Button>

      <p className="mt-5 text-center text-sm text-ink-500">
        {mode === 'signin' ? "New here?" : 'Already have an account?'}{' '}
        <button
          className={cx('font-semibold text-brand-700 underline-offset-2 hover:underline')}
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin')
            setError(null)
            setInfo(null)
          }}
        >
          {mode === 'signin' ? 'Create an account' : 'Sign in'}
        </button>
      </p>
    </div>
  )
}

function GoogleMark() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0012 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 010-4.2V7.06H2.18a11 11 0 000 9.88l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 002.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  )
}
