import { useState, type ReactNode } from 'react'
import { Plus, Share, MoreVertical, Smartphone } from 'lucide-react'
import { useInstall } from '../lib/install'
import { Button, Card } from './ui'

// The steps, in the words of whichever menu the person is looking at.
function IosSteps() {
  return (
    <ol className="space-y-2 text-sm text-ink-600">
      <Step n={1}>
        Tap{' '}
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-ink-800">
          <Share className="h-3.5 w-3.5" /> Share
        </span>{' '}
        at the bottom of Safari.
      </Step>
      <Step n={2}>
        Scroll down and choose{' '}
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-ink-800">
          <Plus className="h-3.5 w-3.5" /> Add to Home Screen
        </span>
      </Step>
      <Step n={3}>Tap Add, then open Sittings from your Home Screen.</Step>
    </ol>
  )
}

function MenuSteps() {
  return (
    <ol className="space-y-2 text-sm text-ink-600">
      <Step n={1}>
        Open your browser&apos;s menu —{' '}
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-ink-800">
          <MoreVertical className="h-3.5 w-3.5" /> ⋮
        </span>{' '}
        at the top right.
      </Step>
      <Step n={2}>
        Choose <span className="font-medium text-ink-800">Install app</span> or{' '}
        <span className="font-medium text-ink-800">Add to Home screen</span>
      </Step>
      <Step n={3}>Open Sittings from your Home Screen from now on.</Step>
    </ol>
  )
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-700">
        {n}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </li>
  )
}

interface InstallCardProps {
  /**
   * Why we are asking. The notifications screen has a reason worth
   * stating; elsewhere the card speaks for itself.
   */
  reason?: string
  /** Show a "Not now" that remembers the answer. */
  dismissible?: boolean
}

/**
 * Invites the person to put the app on their Home Screen, and shows the
 * steps their own phone needs.
 *
 * Renders nothing once the app is installed — which is also how the
 * notifications screen knows to stop nagging about it.
 */
export function InstallCard({ reason, dismissible = false }: InstallCardProps) {
  const { method, promptInstall } = useInstall()
  const [showSteps, setShowSteps] = useState(false)
  const [dismissedHere, setDismissedHere] = useState(false)

  if (method === 'installed' || dismissedHere) return null

  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <Smartphone className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-800">Add Sittings to your Home Screen</p>
          <p className="mt-0.5 text-sm text-ink-500">
            {reason ??
              'Opens like an app, remembers you, and shows a count on the icon when something needs you.'}
          </p>
        </div>
      </div>

      {method === 'prompt' && !showSteps ? (
        <Button
          full
          onClick={async () => {
            const outcome = await promptInstall()
            // The sheet has gone for good either way. If it never
            // appeared, fall back to telling them where to look.
            if (outcome === 'unavailable') setShowSteps(true)
          }}
        >
          <Plus className="h-4 w-4" /> Add to Home Screen
        </Button>
      ) : (
        <div className="rounded-xl bg-slate-50/80 p-3">
          {method === 'ios-share' ? <IosSteps /> : <MenuSteps />}
        </div>
      )}

      {dismissible && (
        <button
          onClick={() => setDismissedHere(true)}
          className="w-full text-center text-xs font-medium text-ink-400 hover:text-ink-600"
        >
          Not now
        </button>
      )}
    </Card>
  )
}

/**
 * The same invitation as a banner for the dashboard — quieter, and it
 * stays gone once waved away.
 */
export function InstallNudge() {
  const { method, dismissed, dismiss, promptInstall } = useInstall()
  const [showSteps, setShowSteps] = useState(false)

  if (method === 'installed' || dismissed) return null

  if (showSteps) return <InstallCard dismissible />

  // Text above, buttons below. Side by side they fight for room on a
  // narrow phone, and the sentence is the part that loses.
  return (
    <Card className="space-y-3 py-3">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <Smartphone className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-800">Add to your Home Screen</p>
          <p className="mt-0.5 text-xs text-ink-500">
            One tap to open, and a count on the icon when a request arrives.
          </p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" className="px-3 py-2 text-xs" onClick={dismiss}>
          Not now
        </Button>
        <Button
          className="px-3 py-2 text-xs"
          onClick={async () => {
            if (method === 'prompt') {
              const outcome = await promptInstall()
              if (outcome === 'accepted') return
              if (outcome === 'dismissed') {
                dismiss()
                return
              }
            }
            // No sheet to show — unfold the written steps instead.
            setShowSteps(true)
          }}
        >
          {method === 'prompt' ? (
            <>
              <Plus className="h-3.5 w-3.5" /> Add
            </>
          ) : (
            'Show me how'
          )}
        </Button>
      </div>
    </Card>
  )
}
