# Phase 1 — Confirmation workflow

This phase upgrades the app from **"book = instantly confirmed"** to the full
**request → preceptor confirms** flow described in the project spec.

You don't need to understand the code. This page tells you *what changed* and
*the one thing you need to do* to switch your existing database over.

---

## What changed, in plain words

**Before:** an abhyasi tapped a slot and the sitting was immediately booked.

**Now:**

1. The abhyasi **requests** a slot → it shows as **"Awaiting confirmation"**.
2. The preceptor sees it under **"Needs your response"** and can:
   - **Confirm** it,
   - **Decline** it (with an optional reason), or
   - **Propose a different time** (a new date/time the abhyasi can accept or decline).
3. On the day, the preceptor marks the sitting **Done**, **No-show**, or **Cancel**.
4. Either side can **cancel** a live sitting, with a reason.

The seat is **held from the moment of request**, so two people can't grab the
last place while the preceptor is deciding. Declined / cancelled / expired
requests release the seat again automatically.

### New preceptor option: Auto-confirm

On the **Profile** screen a preceptor now has an **"Auto-confirm requests"**
switch. Turn it on and requests are confirmed instantly (the old behaviour) —
useful for preceptors who don't want to approve each one by hand.

---

## The one thing you must do — update the database

Your app already talks to a Supabase database. This phase adds new booking
statuses and columns, so you need to run **one migration** once.

1. Open your project on **https://supabase.com** → **SQL Editor** → **+ New query**.
2. In the project, open **`supabase/migrations/001_confirmation_workflow.sql`**,
   select all of it, and copy.
3. Paste it into the SQL Editor and click **Run**.
4. You should see **"Success. No rows returned."**

That's it. Your existing bookings keep their current status; new bookings now
start as **requested**.

> This migration is safe: it keeps your data and can be run again without harm.
> (If you were setting up a **brand-new** database instead, the updated
> `supabase/schema.sql` already includes everything — you would not run the
> migration separately.)

---

## The full lifecycle (for reference)

```
requested ─┬─► confirmed ─► reminded ─┬─► completed
           │                          └─► no_show
           ├─► declined
           ├─► alternate_proposed ─┬─► confirmed (abhyasi accepts)
           │                       └─► cancelled (abhyasi declines)
           └─► expired (went stale — Phase 5 will auto-expire these)

confirmed / reminded / requested / alternate_proposed ─► cancelled (either party)
```

Terminal states (completed, no_show, declined, expired, cancelled) can't change
again — the database enforces this, and it also enforces **who** may make each
move (only the preceptor can confirm; only the abhyasi can accept an alternate;
either can cancel).

---

## How to check it works

1. `npm run dev` and open the app.
2. As an **abhyasi**, find a slot and **Send request**. It shows
   "Awaiting confirmation" under *My sittings*.
3. As that slot's **preceptor** (sign in as them, or promote a test account),
   open *Incoming sittings* → **Confirm**. 
4. Back as the abhyasi, the sitting now shows **Confirmed**.
5. Try **Propose a different time** and accept it from the abhyasi side.

> The confirmation currently changes on-screen only. **Sending the abhyasi a
> WhatsApp/email on confirm is Phase 3–4** — that's the next build step.

---

## What's next

- **Phase 2 — Trilingual** (English / हिन्दी / ગુજરાતી).
- **Phase 3 — Email notifications** on confirm/decline/cancel (Resend + `.ics`).
- **Phase 4 — WhatsApp** (BSP + approved templates + opt-in).
- **Phase 5 — Reminders, auto-expiry, no-show reports, recurring, admin dashboard.**
