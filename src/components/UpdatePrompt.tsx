import { useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { RefreshCw } from 'lucide-react'
import { Button } from './ui'

// A tab left open for days would otherwise never notice a new build, so we ask
// the service worker to look again every so often — and whenever the person
// comes back to the tab.
const CHECK_INTERVAL_MS = 60 * 60 * 1000

export function UpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [reloading, setReloading] = useState(false)
  const updateSW = useRef<((reload?: boolean) => Promise<void>) | null>(null)
  const registration = useRef<ServiceWorkerRegistration | null>(null)

  useEffect(() => {
    updateSW.current = registerSW({
      onNeedRefresh() {
        // A new build is waiting. Show it again even if a previous prompt for
        // an older build was waved away.
        setDismissed(false)
        setNeedRefresh(true)
      },
      onRegisteredSW(_swUrl, r) {
        registration.current = r ?? null
      },
    })

    const check = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return
      registration.current?.update().catch(() => {
        /* offline or the server hiccuped — we'll try again next time */
      })
    }
    const timer = window.setInterval(check, CHECK_INTERVAL_MS)
    document.addEventListener('visibilitychange', check)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])

  if (!needRefresh || dismissed) return null

  // The wrapper spans the screen, so taps fall through everywhere except the
  // card itself.
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(env(safe-area-inset-bottom)+5rem)]"
    >
      <div className="pointer-events-auto mx-auto max-w-md rounded-2xl border border-brand-100 bg-white p-4 shadow-lift animate-fade-up">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <RefreshCw className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-900">A new version is ready</p>
            <p className="mt-0.5 text-xs text-ink-500">Refresh to load the latest updates.</p>
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button
            variant="ghost"
            className="px-3 py-2 text-xs"
            onClick={() => setDismissed(true)}
            disabled={reloading}
          >
            Later
          </Button>
          <Button
            className="px-3 py-2 text-xs"
            loading={reloading}
            onClick={async () => {
              setReloading(true)
              // Handing over to the new worker reloads the page for us. If no
              // worker was controlling this page there is nothing to hand over,
              // so reload anyway rather than leave the button spinning.
              await updateSW.current?.(true)
              window.setTimeout(() => window.location.reload(), 2500)
            }}
          >
            Refresh
          </Button>
        </div>
      </div>
    </div>
  )
}
