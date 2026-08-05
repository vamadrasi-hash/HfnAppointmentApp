// The unread badge in the header, and the pop-ups that go with it.
//
// Notifications are written by the database. The app hears about a new one
// two ways: a realtime subscription, which arrives at once, and — as a
// safety net for a blocked socket or a sleeping tab — the same count the
// badge asks for when the screen is opened, when the tab regains focus,
// and once a minute while it is in view. Whichever gets there first raises
// the pop-up; the other finds it already shown and does nothing.
//
// Anything that reads or clears notifications calls `notificationsChanged`
// so the badge updates immediately.

import { useCallback, useEffect, useRef, useState } from 'react'
import { countUnreadNotifications, getNotifications } from './api'
import { supabase } from './supabase'
import type { AppNotification, NotificationKind } from './types'
import { showPopup } from './push'

const REFRESH_MS = 60_000

// Where tapping a notification takes you: a request is something the
// preceptor has to answer; everything else is news about your own sitting.
export const NOTIFICATION_DESTINATION: Record<NotificationKind, string> = {
  request: '/sittings',
  open_request: '/sittings',
  confirmed: '/bookings',
  declined: '/bookings',
  alternate_proposed: '/bookings',
  cancelled: '/bookings',
}

const listeners = new Set<() => void>()

export function notificationsChanged(): void {
  listeners.forEach((fn) => fn())
}

// Ids already popped this session, so realtime and the poll cannot both
// show the same one. Bounded, because a long-lived tab should not grow.
const popped = new Set<string>()

function remember(id: string): boolean {
  if (popped.has(id)) return false
  popped.add(id)
  if (popped.size > 200) popped.delete(popped.values().next().value as string)
  return true
}

async function pop(n: Pick<AppNotification, 'id' | 'kind' | 'title' | 'body'>): Promise<void> {
  if (!remember(n.id)) return
  await showPopup({
    title: n.title,
    body: n.body,
    tag: n.id,
    url: NOTIFICATION_DESTINATION[n.kind] ?? '/notifications',
  })
}

export function useUnreadNotifications(profileId: string | undefined | null) {
  const [count, setCount] = useState(0)
  // The count as we last saw it. Null until the first read, because a
  // badge that starts at three is not three pieces of news.
  const lastCount = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    if (!profileId) {
      setCount(0)
      lastCount.current = null
      return
    }
    try {
      const next = await countUnreadNotifications(profileId)
      const before = lastCount.current
      lastCount.current = next
      setCount(next)
      if (before != null && next > before) {
        // Something arrived while we were not looking. Show the newest
        // few; the rest are waiting on the notifications screen.
        const recent = await getNotifications(profileId, 5)
        for (const n of recent.filter((x) => !x.read_at).reverse()) await pop(n)
      }
    } catch {
      // A badge is not worth an error message; keep the last count.
    }
  }, [profileId])

  useEffect(() => {
    refresh()
    const timer = window.setInterval(refresh, REFRESH_MS)
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    listeners.add(refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      listeners.delete(refresh)
    }
  }, [refresh])

  // The instant path. Row level security applies here too, so this only
  // ever carries this person's own notifications.
  useEffect(() => {
    if (!profileId) return
    const channel = supabase
      .channel(`notifications:${profileId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `profile_id=eq.${profileId}`,
        },
        (payload) => {
          const n = payload.new as AppNotification
          void pop(n)
          setCount((c) => c + 1)
          if (lastCount.current != null) lastCount.current += 1
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [profileId])

  return { count, refresh }
}
