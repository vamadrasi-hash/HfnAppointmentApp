// Adding the app to the Home Screen.
//
// This matters more here than it usually does. On an iPhone, Safari only
// allows notifications for a site that has been added to the Home Screen:
// in an ordinary tab the permission question never appears, however well
// the rest of it is wired up. And on every platform, the count badge on
// the icon needs an icon to sit on.
//
// Two paths, because the platforms differ:
//
//  - **Chrome (Android, desktop).** Fires `beforeinstallprompt` when the
//    site qualifies. We keep hold of that event and re-fire it from our
//    own button, so the invitation appears next to the reason for it
//    rather than in a browser bar people have learned to ignore.
//  - **Safari (iPhone, iPad).** No event, no API. All anyone can do is
//    describe the Share menu, which is what we do.

import { useCallback, useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Chrome fires this once, early — often before React has mounted — and
// never again. So it is caught at module load (main.tsx imports this
// file first) and kept until something asks for it.
let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

function announce(): void {
  listeners.forEach((fn) => fn())
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    announce()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    announce()
  })
}

/** Running from the Home Screen icon rather than inside a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const displayMode =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    window.matchMedia?.('(display-mode: minimal-ui)').matches
  // Safari's own, older flag — still the only one it sets on iOS.
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true
  return !!displayMode || iosStandalone
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // An iPad on iPadOS 13+ claims to be a Mac; the touch points give it away.
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
}

/** How this person can install, if they can. */
export type InstallMethod =
  /** Already on the Home Screen — nothing to offer. */
  | 'installed'
  /** Chrome has offered us the prompt; a button is enough. */
  | 'prompt'
  /** iPhone or iPad: Share → Add to Home Screen. */
  | 'ios-share'
  /** Some other browser: the menu, wherever it keeps it. */
  | 'browser-menu'

const DISMISSED_KEY = 'hfn.install-nudge-dismissed'

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    // Private browsing with storage refused: nudge every time rather
    // than not at all.
    return false
  }
}

export function useInstall() {
  const [installed, setInstalled] = useState(isStandalone)
  const [canPrompt, setCanPrompt] = useState(() => !!deferredPrompt)
  const [dismissed, setDismissed] = useState(readDismissed)

  useEffect(() => {
    const sync = () => {
      setCanPrompt(!!deferredPrompt)
      setInstalled(isStandalone())
    }
    listeners.add(sync)

    // Installing from the browser's own bar switches the running window
    // to standalone without any event of ours firing.
    const media = window.matchMedia?.('(display-mode: standalone)')
    media?.addEventListener?.('change', sync)

    return () => {
      listeners.delete(sync)
      media?.removeEventListener?.('change', sync)
    }
  }, [])

  const method: InstallMethod = installed
    ? 'installed'
    : canPrompt
      ? 'prompt'
      : isIos()
        ? 'ios-share'
        : 'browser-menu'

  /**
   * Show Chrome's install sheet. Returns what the person chose, or
   * 'unavailable' where there is no sheet to show — the caller falls
   * back to the written steps.
   */
  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    const event = deferredPrompt
    if (!event) return 'unavailable'
    try {
      await event.prompt()
      const { outcome } = await event.userChoice
      // One shot per event, accepted or not.
      deferredPrompt = null
      announce()
      return outcome
    } catch {
      return 'unavailable'
    }
  }, [])

  const dismiss = useCallback(() => {
    setDismissed(true)
    try {
      window.localStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      /* nothing to remember it with; it will ask again */
    }
  }, [])

  return { method, installed, dismissed, promptInstall, dismiss }
}

/**
 * Whether notifications are out of reach until the app is installed.
 * True only on iPhone and iPad in a browser tab: Safari withholds the
 * whole Notification API there, so there is no permission to ask for.
 */
export function needsInstallForNotifications(): boolean {
  return isIos() && !isStandalone() && !('Notification' in window)
}
