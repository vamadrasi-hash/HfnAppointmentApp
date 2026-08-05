# Pop-up notifications with the app closed

The app raises a pop-up for every notification while it is **open** — in a
tab, in the background, or installed on a phone and running. That needs
nothing set up: the person taps **Allow notifications** on the
Notifications screen and it works.

Reaching a phone with the app **closed** is Web Push, and Web Push needs a
key pair and something to send with it. That is what this folder is. It is
entirely optional; skip it and everything else still works.

---

## 1. Make a VAPID key pair

Once, on your own computer:

```bash
npx web-push generate-vapid-keys
```

You get two long strings — a public key and a private key. Keep the
private one to yourself.

## 2. Give the app the public key

In `.env` (and in your Vercel project settings, under Environment
Variables):

```
VITE_VAPID_PUBLIC_KEY=<the public key>
```

Rebuild the app. From now on, anyone who allows notifications also
registers their device in the `push_subscriptions` table.

## 3. Deploy the function

You need the Supabase CLI and to be logged in:

```bash
supabase functions deploy send-push --project-ref <your-project-ref>

supabase secrets set \
  VAPID_PUBLIC_KEY=<the public key> \
  VAPID_PRIVATE_KEY=<the private key> \
  VAPID_SUBJECT=mailto:you@example.org \
  PUSH_HOOK_SECRET=<any long random string> \
  --project-ref <your-project-ref>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already there — Supabase
sets them for every function.

## 4. Tell the database to call it

Supabase dashboard → **Database** → **Webhooks** → **Create a new hook**:

| Field | Value |
| --- | --- |
| Name | `send-push` |
| Table | `notifications` |
| Events | `Insert` |
| Type | `Supabase Edge Functions` |
| Edge Function | `send-push` |
| HTTP Headers | `x-push-secret` : the `PUSH_HOOK_SECRET` you set above |

Save it. Every notification row the database writes now goes out to that
person's devices as well.

## Checking it works

1. Sign in on a phone, open **Notifications**, tap **Allow notifications**.
2. In the SQL editor, confirm the device registered:
   `select endpoint, user_agent from push_subscriptions;`
3. Close the app completely and have someone request a sitting with you.

If nothing arrives, the webhook's own log (Database → Webhooks → the hook →
Logs) says whether it fired, and the function's log (Edge Functions →
send-push → Logs) says what happened when it did.

## Notes

- **iPhone**: Safari only allows Web Push to an app added to the Home
  Screen ("Add to Home Screen" from the share menu), on iOS 16.4 or newer.
  In a plain Safari tab the permission prompt never appears.
- A device that uninstalls the app, or withdraws permission, starts
  failing with 404/410; the function removes those rows itself.
