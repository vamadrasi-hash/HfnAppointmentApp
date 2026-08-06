// Delivers a notification row to that person's devices as a Web Push
// message, so they hear about it with the app closed.
//
// Called by a database webhook on `notifications` (insert), which posts
// the usual Supabase shape:
//
//   { "type": "INSERT", "table": "notifications", "record": { ... } }
//
// See README.md in this folder for deploying it and wiring the webhook.
// Nothing else in the app depends on it: without it, pop-ups still happen
// while the app is open.

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.org'
// Shared with the webhook, so only the database can ask us to send.
const HOOK_SECRET = Deno.env.get('PUSH_HOOK_SECRET') ?? ''

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// Where tapping a notification lands — the same map the app uses.
const DESTINATION: Record<string, string> = {
  request: '/sittings',
  open_request: '/sittings',
  confirmed: '/bookings',
  declined: '/bookings',
  alternate_proposed: '/bookings',
  cancelled: '/bookings',
}

interface NotificationRow {
  id: string
  profile_id: string
  kind: string
  title: string
  body: string | null
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return json({ error: 'VAPID keys are not configured.' }, 500)
  }
  if (HOOK_SECRET && req.headers.get('x-push-secret') !== HOOK_SECRET) {
    return json({ error: 'Not allowed.' }, 401)
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

  let record: NotificationRow | undefined
  try {
    const payload = await req.json()
    record = payload.record ?? payload
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400)
  }
  if (!record?.profile_id || !record?.title) return json({ error: 'Nothing to send.' }, 400)

  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('profile_id', record.profile_id)
  if (error) return json({ error: error.message }, 500)
  if (!subscriptions?.length) return json({ sent: 0, reason: 'no devices' })

  // Everything waiting, not just this one — it is what goes on the app
  // icon, and the device has no way of counting for itself while the app
  // is closed. A failure here is not worth losing the pop-up over.
  const { count: unread } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', record.profile_id)
    .is('read_at', null)

  const message = JSON.stringify({
    title: record.title,
    body: record.body ?? '',
    url: DESTINATION[record.kind] ?? '/notifications',
    tag: record.id,
    unread: unread ?? 1,
  })

  let sent = 0
  const stale: string[] = []

  await Promise.all(
    subscriptions.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          message,
        )
        sent++
      } catch (e) {
        // 404/410 mean the browser has retired this subscription — the
        // app has been uninstalled, or permission withdrawn. Anything
        // else is worth leaving alone and trying again next time.
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) stale.push(s.endpoint)
      }
    }),
  )

  if (stale.length) {
    await supabase.from('push_subscriptions').delete().in('endpoint', stale)
  }

  return json({ sent, removed: stale.length })
})
