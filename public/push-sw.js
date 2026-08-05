/* eslint-disable no-undef */
// Background pop-ups — the part that runs with the app closed.
//
// Folded into the generated service worker by `workbox.importScripts` in
// vite.config.ts. It handles two events and nothing else: a push arriving
// from the browser's push service, and a tap on the notification it
// showed. The payload is what supabase/functions/send-push sends:
//
//   { "title": "...", "body": "...", "url": "/sittings", "tag": "<id>" }
//
// Without a VAPID key configured nothing ever pushes here, and the app
// still raises its own pop-ups while it is open.

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch (e) {
    payload = { body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || 'Heartfulness Sittings'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/pwa-192x192.png',
      badge: '/favicon-64.png',
      tag: payload.tag || 'hfn-sitting',
      data: { url: payload.url || '/notifications' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/notifications'

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // An app already open is brought forward and sent to the right
      // screen, rather than opened a second time.
      for (const client of windows) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client) {
            try {
              await client.navigate(url)
            } catch (e) {
              /* a cross-origin tab; focusing it is enough */
            }
          }
          return
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(url)
    })(),
  )
})
