// The unread badge in the header.
//
// Notifications are written by the database, so nothing in the app knows
// when one arrives. Rather than hold a socket open, the badge asks for the
// count when the screen is opened, when the tab regains focus, and once a
// minute while it is in view — cheap, and never more than a minute stale.
// Anything that reads or clears notifications calls `notificationsChanged`
// so the badge updates immediately.

import { useCallback, useEffect, useState } from 'react'
import { countUnreadNotifications } from './api'

const REFRESH_MS = 60_000

const listeners = new Set<() => void>()

export function notificationsChanged(): void {
  listeners.forEach((fn) => fn())
}

export function useUnreadNotifications(profileId: string | undefined | null) {
  const [count, setCount] = useState(0)

  const refresh = useCallback(async () => {
    if (!profileId) {
      setCount(0)
      return
    }
    try {
      setCount(await countUnreadNotifications(profileId))
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

  return { count, refresh }
}
