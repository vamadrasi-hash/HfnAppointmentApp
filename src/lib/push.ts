// Pop-up notifications.
//
// Two things wear the same name here, and it is worth keeping them apart.
//
//  - **Pop-ups while the app is running.** The database already writes a
//    row for everything a person should hear about; when one arrives the
//    app raises a system notification for it. This needs nothing but the
//    person's permission, and covers the ordinary case: the app open, or
//    sitting in another tab.
//
//  - **Pop-ups when the app is closed.** That is Web Push proper: the
//    browser holds a subscription with its own push service, and a server
//    sends to it. It needs a VAPID key pair — the public half here as
//    `VITE_VAPID_PUBLIC_KEY`, the private half with the `send-push` edge
//    function (see supabase/functions/send-push). Without the key the app
//    quietly does the first thing only.
//
// Everything below is best-effort: a browser without notifications, a
// person who says no, an expired subscription — none of them are errors
// worth putting in front of anyone.

import { supabase } from './supabase'

export type PushPermission = 'unsupported' | 'default' | 'granted' | 'denied'

const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim()

/** Whether a server can reach this device with the app closed. */
export const backgroundPushConfigured = !!VAPID_PUBLIC_KEY

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function pushPermission(): PushPermission {
  if (!pushSupported()) return 'unsupported'
  return Notification.permission as PushPermission
}

/**
 * Ask, if we have not already been told. Browsers only allow this from a
 * gesture, so it is called from a button and never on load.
 */
export async function askForPushPermission(): Promise<PushPermission> {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission as PushPermission
  try {
    return (await Notification.requestPermission()) as PushPermission
  } catch {
    return pushPermission()
  }
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? null
  } catch {
    return null
  }
}

export interface Popup {
  title: string
  body?: string | null
  /** Where tapping it should land. */
  url: string
  /** The notification's id, so the same one never stacks up twice. */
  tag: string
}

/**
 * Raise one. Through the service worker where there is one — that is the
 * only way that works on Android, and it is what makes the pop-up outlive
 * the tab — and through the page's own Notification otherwise.
 */
export async function showPopup(p: Popup): Promise<void> {
  if (pushPermission() !== 'granted') return

  const options: NotificationOptions = {
    body: p.body ?? undefined,
    icon: '/pwa-192x192.png',
    badge: '/favicon-64.png',
    tag: p.tag,
    data: { url: p.url },
  }

  const reg = await registration()
  if (reg) {
    try {
      await reg.showNotification(p.title, options)
      return
    } catch {
      /* fall through to the page's own notification */
    }
  }

  try {
    const notification = new Notification(p.title, options)
    notification.onclick = () => {
      window.focus()
      window.location.assign(p.url)
      notification.close()
    }
  } catch {
    // Android refuses this one outright, and there is no third way.
  }
}

// ------------------------------------------------------------------
// Web Push — reaching a device with the app closed
// ------------------------------------------------------------------

// A VAPID key travels as base64url text and has to be handed to the
// browser as bytes.
function urlBase64ToBytes(base64: string): ArrayBuffer {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const raw = atob(padded)
  const buffer = new ArrayBuffer(raw.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return buffer
}

/**
 * Take out (or renew) this device's push subscription and record it
 * against the profile, so `send-push` knows where to send. Safe to call
 * on every sign-in: the browser hands back the existing subscription and
 * the row is upserted on its endpoint.
 */
export async function registerForBackgroundPush(profileId: string): Promise<boolean> {
  if (!backgroundPushConfigured || pushPermission() !== 'granted') return false
  const reg = await registration()
  if (!reg?.pushManager) return false

  try {
    const existing = await reg.pushManager.getSubscription()
    const subscription =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBytes(VAPID_PUBLIC_KEY!),
      }))

    const json = subscription.toJSON()
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        profile_id: profileId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent.slice(0, 300),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    )
    if (error) throw error
    return true
  } catch {
    // A refused subscription, a browser without push, an offline device:
    // pop-ups while the app is open still work.
    return false
  }
}
