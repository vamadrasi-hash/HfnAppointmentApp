# Heartfulness Sittings — Appointment Management System

A simple, mobile-first web app for the Heartfulness community in South Gujarat. **Preceptors** (trainers) publish the weekly times when they can give individual meditation sittings, and **abhyasis** (practitioners) browse those preceptors by zone and by city/center and book an open slot. The app shows how many places are left in each slot and hides a slot once it is full.

This guide assumes **no prior experience** with coding tools, command lines, or dashboards. Follow it from top to bottom and you will have the app running on your computer, and then live on the internet.

---

## Table of contents

1. [What the app does](#1-what-the-app-does)
2. [What you will need](#2-what-you-will-need)
3. [Step A — Install Node.js](#step-a--install-nodejs)
4. [Step B — Open the project](#step-b--open-the-project)
5. [Step C — Create your Supabase project (the database)](#step-c--create-your-supabase-project-the-database)
6. [Step D — Create the database tables](#step-d--create-the-database-tables)
7. [Step E — Load the sample data](#step-e--load-the-sample-data)
8. [Step F — Turn on Google (Gmail) login](#step-f--turn-on-google-gmail-login)
9. [Step G — Make email sign-up easy for testing](#step-g--make-email-sign-up-easy-for-testing)
10. [Step H — Connect the app to Supabase (the .env file)](#step-h--connect-the-app-to-supabase-the-env-file)
11. [Step I — Install and run the app on your computer](#step-i--install-and-run-the-app-on-your-computer)
12. [Step J — Make yourself an admin](#step-j--make-yourself-an-admin)
13. [Understanding roles (abhyasi, preceptor, admin)](#understanding-roles)
14. [Replacing the sample data with your real zones and centers](#replacing-the-sample-data)
15. [Installing the app on a phone (PWA)](#installing-the-app-on-a-phone-pwa)
16. [Putting the app online with Vercel](#putting-the-app-online-with-vercel)
17. [Project structure](#project-structure)
18. [Troubleshooting](#troubleshooting)

---

## 1. What the app does

**For abhyasis (practitioners):**
- Sign in with Google or email — nothing to approve, they can start requesting sittings right away.
- Pick a day, then filter preceptors by zone, by city/center, or by time of day.
- See each preceptor's open times and how many places remain (for example, "1 of 4 left").
- See **where** each sitting happens — the heartspot or the preceptor's home — with the address and a **Directions** link. A preceptor's home address appears only once they have confirmed your sitting.
- Be shown the **next available time** and whose it is, without having to tap through the days one by one.
- When nobody is free nearby, see **everyone else who is free**, grouped by area and then by center.
- Ask a preceptor for a time they haven't published, where that preceptor allows it.
- Say **what kind of sitting** it is (a regular individual sitting, an introductory one, or whatever else an admin has added) and **how many people are coming along** — and be told, before the request goes, when that is more than the sitting has room for.
- Book a sitting, add an optional note, and later cancel it.
- Optionally use "Near me" to sort preceptors by distance from your location.
- Be **notified** when a request is confirmed, declined, cancelled, or answered with another time.

**For preceptors (trainers):**
- Everything an abhyasi can do (preceptors can also book sittings with others), **plus**, once an admin has approved the account:
- Set their weekly availability — day, start and end time, **how many people can join**, and where the sitting happens. A time that repeats can be set for **several days at once**, and the end time follows the start by 30 minutes.
- Choose the place per slot: a **heartspot** of their center, or **their own home**. The home address is entered once on the Profile screen (with a Google location they pin on a map) and stays private until they confirm a sitting.
- Optionally **accept requests outside their schedule** — which also puts them in "Near me" on days they hold no slot.
- Pause a slot without deleting it.
- Be **notified** whenever someone requests a sitting, from their schedule or outside it.
- See who has booked (with the person's phone number) and mark a sitting as completed or cancelled.
- Decide when someone asks to bring **more people than the sitting holds** — let them all come, or approve only the number the slot was opened for.
- **Cancel a confirmed sitting with a message of their own**, which the abhyasi is shown word for word, in English and Hindi — and send that same message straight to their WhatsApp, with their number already filled in.

**For admins:**
- **Approve preceptors.** Anyone can sign up as one; nothing they publish reaches an abhyasi until an admin says yes.
- An overview of all zones, cities, centers and heartspots — and the ability to **add, edit and delete centers and their heartspots**, including each one's address and map location.
- Maintain the **types of session** a seeker can choose from.

---

## 2. What you will need

- A computer (Windows, Mac, or Linux).
- A free **Supabase** account — this is the online database the app uses. (https://supabase.com)
- A free **Google Cloud** account — only needed for the "Sign in with Google" button. (https://console.cloud.google.com)
- About 30–40 minutes the first time.

You do **not** need to be a programmer. You will mostly be copying and pasting.

---

## Step A — Install Node.js

Node.js is the engine that runs the app on your computer.

1. Go to **https://nodejs.org**.
2. Click the big button that says **"LTS"** (Long Term Support). This downloads an installer.
3. Open the downloaded file and click **Next → Next → Install**, accepting the default options. (On Mac, keep clicking **Continue** and then **Install**.)
4. To confirm it worked, open the **Terminal**:
   - **Windows:** press the Start button, type `cmd`, and open **Command Prompt**.
   - **Mac:** press `Cmd + Space`, type `Terminal`, and press Enter.
5. In that black window, type the following and press Enter:
   ```
   node -v
   ```
   You should see a version number like `v20.x.x` or `v22.x.x`. If you do, Node.js is installed correctly.

> Keep this Terminal window handy — you will use it again in Step I.

---

## Step B — Open the project

1. Unzip the project folder you received (right-click the `.zip` file → **Extract All** on Windows, or double-click on Mac). You now have a folder called **`heartfulness-ams`**.
2. (Recommended) Install **Visual Studio Code**, a free, friendly code editor, from **https://code.visualstudio.com**. Install it with the default options.
3. Open VS Code, then choose **File → Open Folder…** and select the `heartfulness-ams` folder.

You will see all the project files on the left. You do not need to understand them; this guide tells you exactly which few files to touch.

---

## Step C — Create your Supabase project (the database)

Supabase stores all the data — users, preceptors, slots and bookings.

1. Go to **https://supabase.com** and click **Start your project**. Sign in (you can use your Google account).
2. Click **New project**.
3. Fill in:
   - **Name:** anything, e.g. `heartfulness-sittings`.
   - **Database Password:** click **Generate a password** and **copy it somewhere safe** (you may need it later).
   - **Region:** choose the one closest to you. For India, pick **South Asia (Mumbai)** — `ap-south-1`.
4. Click **Create new project** and wait a minute or two while it sets up.

---

## Step D — Create the database tables

1. In your Supabase project, look at the left sidebar and click **SQL Editor** (the icon looks like a database/terminal).
2. Click **+ New query**.
3. In VS Code (or any text editor), open the file **`supabase/schema.sql`** from the project. Select **all** of its contents (`Ctrl + A`, then `Ctrl + C` to copy). On Mac use `Cmd` instead of `Ctrl`.
4. Go back to the Supabase SQL Editor, click inside the empty query box, and paste (`Ctrl + V`).
5. Click the green **Run** button (bottom right).
6. You should see **"Success. No rows returned."** This means all the tables, security rules, and the booking logic were created.

> This file is safe to run again later if you ever want to start fresh — it clears and rebuilds everything.

---

## Step E — Load the sample data

This loads the Gujarat master data — 5 zones and 142 centers, each tagged with its city. See [this section](#replacing-the-sample-data) if you need to change it.

1. Still in the **SQL Editor**, click **+ New query** again.
2. Open **`supabase/seed.sql`** from the project, copy all of it.
3. Paste it into the new query box and click **Run**.
4. You should again see a success message.

---

## Step F — Turn on Google (Gmail) login

This makes the **"Continue with Google"** button work. If you only want to use email/password for now, you can skip this step and come back to it later.

### F.1 — Create Google credentials

1. Go to **https://console.cloud.google.com** and sign in.
2. At the top, click the project dropdown and **New Project**. Name it `Heartfulness Sittings` and click **Create**, then select it.
3. In the left menu, go to **APIs & Services → OAuth consent screen**.
   - Choose **External**, click **Create**.
   - Fill in an **App name** (e.g. *Heartfulness Sittings*), your **support email**, and a **developer contact email**. Leave the rest as default, click **Save and Continue** through the screens, then **Back to Dashboard**.
   - Under **Test users**, you can add your own Gmail address so you can sign in while testing.
4. In the left menu, go to **APIs & Services → Credentials**.
   - Click **+ Create Credentials → OAuth client ID**.
   - **Application type:** *Web application*.
   - **Name:** anything.
   - Under **Authorized redirect URIs**, click **Add URI** and paste your Supabase callback URL. It looks like this (replace the middle part with your own project — see below):
     ```
     https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback
     ```
     **Where to find `YOUR-PROJECT-REF`:** in Supabase, go to **Project Settings → API**; the **Project URL** shown there (e.g. `https://abcd1234.supabase.co`) contains it.
   - Click **Create**. A popup shows your **Client ID** and **Client Secret**. Keep this open.

### F.2 — Give those credentials to Supabase

1. In **Supabase**, go to **Authentication → Sign In / Providers** (or **Providers**).
2. Find **Google** in the list and turn it **on**.
3. Paste the **Client ID** and **Client Secret** from Google into the matching boxes.
4. Click **Save**.

### F.3 — Tell Supabase which web addresses are allowed

1. In Supabase, go to **Authentication → URL Configuration**.
2. Set the **Site URL** to:
   ```
   http://localhost:5173
   ```
3. Under **Redirect URLs**, click **Add URL** and add the same address:
   ```
   http://localhost:5173
   ```
4. Click **Save**.

> Later, when your app is live on Vercel, come back here and add your real website address (for example `https://your-app.vercel.app`) to both the Site URL and the Redirect URLs.

---

## Step G — Make email sign-up easy for testing

By default, Supabase emails a confirmation link when someone signs up with email/password. While you are testing, it is easier to switch this off so accounts work immediately.

1. In Supabase, go to **Authentication → Sign In / Providers → Email**.
2. Turn **off** **"Confirm email"**.
3. Click **Save**.

> For a real launch you may prefer to keep email confirmation **on**. The app already handles both cases (it shows a "please check your email" message when confirmation is required).

---

## Step H — Connect the app to Supabase (the .env file)

The app needs two values to talk to your database.

1. In Supabase, go to **Project Settings → API**. You will see:
   - **Project URL** (e.g. `https://abcd1234.supabase.co`)
   - **Project API keys → `anon` `public`** (a long string starting with `eyJ...`)
2. In the project folder, find the file **`.env.example`**. Make a **copy** of it and rename the copy to exactly **`.env`** (just `.env`, nothing before the dot).
   - In VS Code: right-click `.env.example` → **Copy**, right-click in the file list → **Paste**, then rename the new file to `.env`.
3. Open the `.env` file and fill in your two values so it looks like this (use **your own** URL and key):
   ```
   VITE_SUPABASE_URL=https://abcd1234.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...your-long-key...
   ```
4. Save the file.

> The `anon public` key is safe to use in a web app — your data is protected by the security rules created in Step D. Do **not** paste the `service_role` key here.

### Optional — the in-app map (`VITE_GOOGLE_MAPS_API_KEY`)

When a preceptor gives their home address, or an admin gives a heartspot's, the app can show a map so they can **search for the place and drop a pin** on it. That map comes from Google and needs a key of your own.

**You can skip this.** Without a key, the same screens still offer:
- **"I am here now"** — uses the phone's own location, which is the easiest way when you are standing at the place; and
- **paste a Google Maps link** — find the place in Google Maps, copy the link from the address bar, paste it in. The app reads the coordinates out of it.

To turn the map on:
1. Go to https://console.cloud.google.com → **APIs & Services → Library** and enable **Maps JavaScript API**, **Places API** and **Geocoding API**.
2. Go to **Credentials → Create credentials → API key**.
3. Restrict the key: **Application restrictions → Websites**, and list your app's address (e.g. `https://your-app.vercel.app/*`). An unrestricted key can be used by anyone and billed to you.
4. Add it to `.env`:
   ```
   VITE_GOOGLE_MAPS_API_KEY=AIza...your-key...
   ```
5. If the app is already live on Vercel, add the same value there too (see the Vercel section) and redeploy.

> Short Google Maps links (`maps.app.goo.gl/…`) hide their coordinates behind a redirect the browser will not follow, so the app asks for the full link instead. Open the short link first, then copy what the address bar shows.

---

## Step I — Install and run the app on your computer

1. Open the **Terminal** again (see Step A, point 4).
2. You need to move the Terminal **into your project folder**. Type `cd ` (the letters c, d, then a space), then drag the `heartfulness-ams` folder from your file explorer onto the Terminal window and press Enter. The command will look something like:
   ```
   cd C:\Users\You\Downloads\heartfulness-ams
   ```
   (On Mac it will look like `cd /Users/You/Downloads/heartfulness-ams`.)
3. Install the app's building blocks by typing this and pressing Enter (this downloads everything it needs and may take a few minutes):
   ```
   npm install
   ```
4. Start the app:
   ```
   npm run dev
   ```
5. You will see a message with a local address, usually:
   ```
   ➜  Local:   http://localhost:5173/
   ```
6. Hold **Ctrl** and click that link, or copy it into your web browser. **The app is now running!**

To **stop** the app later, click the Terminal window and press `Ctrl + C`. To start it again, repeat steps 4–6.

### First run

- Click **Continue with Google** (if you set it up) or create an account with email and password.
- You will be taken to a short **welcome screen** to enter your name, phone, and choose your **zone** and your **city / center**. Choose **Abhyasi** or **Preceptor**.
- After that you land on the home screen.

> Choosing **Preceptor** creates an account that waits for an administrator's approval before it can publish a schedule — see [Understanding roles](#understanding-roles). Choosing **Abhyasi** needs no approval at all. On your very first sign-in there is no admin yet to do the approving, so do Step J next.

---

## Step J — Make yourself an admin

The very first admin must be set by hand (this is a one-time security step). **Do this after you have signed in at least once**, so your account already exists.

1. In Supabase, open the **SQL Editor → + New query**.
2. Paste the following, replacing the email with the one you signed in with:
   ```sql
   update profiles set role = 'admin' where email = 'you@example.com';
   ```
3. Click **Run**.
4. Refresh the app. You are now an admin and will see the **Master data** and **Preceptor approvals** screens.

> An admin is always treated as an approved preceptor, so this also clears your own account if you signed up as one. Everyone else who signs up as a preceptor now goes into your approvals queue.

---

## Understanding roles

There are three roles:

| Role | Can book sittings | Can give sittings | Can edit Master data |
|------|:---:|:---:|:---:|
| **Abhyasi** (practitioner) | ✅ | — | — |
| **Preceptor** (trainer) | ✅ | ✅ *(once approved)* | — |
| **Admin** | ✅ | ✅ | ✅ |

On the welcome screen a person chooses **Abhyasi** or **Preceptor** for themselves. What happens next is different for each.

### An abhyasi is ready straight away

Nothing to approve, nothing to wait for. They sign in, find preceptors, and start requesting sittings.

### A preceptor waits for an admin

Saying "I am a preceptor" is a claim about someone's role in the sangha, and the app has no way to check it — so a preceptor account is created **pending** and an administrator approves it.

While an account is pending, the person can use the app like anyone else — they can find preceptors and request sittings — but they **cannot** publish a weekly schedule, and **no abhyasi sees them** in search. The app tells them so on the home screen and on their profile.

**To approve someone:** open **Preceptor approvals** (on the home screen and on your profile, admins only). It opens on the **Waiting** list. Each person shows their name, email, phone and center, with three choices:

| Choice | What it does |
|---|---|
| **Approve** | They can publish a schedule and take requests, and abhyasis find them in search. |
| **Not a preceptor** | They keep their account and can still request sittings, but publish nothing. |
| **Back to waiting** | Undoes either of the above. |

Withdrawing an approval leaves sittings already confirmed alone — it only stops new requests and hides the preceptor from search.

This is enforced by the database, not just by the screens: an unapproved preceptor's attempt to publish a slot is refused by a security rule, the search function never returns them, and a booking against an old slot of theirs is rejected. A signed-in person also cannot approve themselves — the same guard that stops them making themselves an admin ignores any approval they try to write.

Administrators are always approved and are not listed on that screen.

### Adding more admins

The first admin is made by hand (Step J). After that, the same SQL adds more (replace the email):

```sql
update profiles set role = 'admin' where email = 'someone@example.com';
```

---

## Replacing the sample data

The app asks each person for exactly two things about place:

1. **Zone** — a short list (Zone 6A, 6B, 6C, 6D, plus a bucket for centers that don't carry a zone yet).
2. **City / Center** — one searchable list where each city is a heading and its centers sit underneath it. Typing "Surat" brings up every Surat center; typing a center name finds it directly. Centers that have no city yet are still listed, at the end under **Other centers**.

Picking a city/center first is fine — the zone fills itself in.

`supabase/seed.sql` already holds the Gujarat master data: **5 zones and 142 centers**. Districts and talukas from the master sheet are deliberately not imported, because the app does not use them.

### Option 1 — Edit the seed file and re-run it (good for a full replacement)

1. Open **`supabase/seed.sql`** in VS Code.
2. You will see two clearly labelled blocks: **zones** and **centers**. Each center row is `('<zone name>', '<center name>', '<city>')` — use `null` for the city if you don't know it yet. Follow the pattern already there.
3. To apply your changes cleanly, first **re-run `schema.sql`** (Step D) to clear old data, then **run your edited `seed.sql`** (Step E).
   - Latitude/longitude on a center are only used for the "Near me" distance feature. Leave them out if you don't have them.

### Option 2 — Use the Master data screen in the app (easiest for small changes)

Sign in as an admin and open **Master data**. You can add, rename and delete **centers** and their **heartspots** there, and give each one an address and a map location — no SQL and no Supabase dashboard needed. Zones are the one thing still set up in Supabase, because they change once a year at most.

### Option 3 — Use the Supabase Table Editor

1. In Supabase, open **Table Editor** in the left sidebar.
2. Choose the **zones** table and add your zones (click **Insert → Insert row**).
3. Then open **centers**, add each center, pick its **zone_id** from the dropdown, and type its **city** (leave city blank if unknown — the center still appears, under "Other centers").
4. Then open **heartspots** and add each one, picking its **center_id**.

> The order matters: zones first, then centers, then heartspots — each one points at the level above it.

### Already have the app running with the old sample data?

Run the files in **`supabase/migrations/`** in the SQL Editor, in number order, instead of re-running `schema.sql`:

| Migration | What it does |
|---|---|
| `002_zone_city_center_master_data.sql` | Makes `city` optional and swaps the old placeholder zones/centers for the Gujarat data. **Heads up:** it clears the old zones and centers, so preceptors will need to re-pick their center once. |
| `003_security_hardening.sql` | Stops a user from making themselves an admin, and takes the internal trigger functions off the public API. |
| `004_fix_capacity_guard.sql` | Fixes the over-booking bug described below. |
| `005_sitting_place_and_heartspots.sql` | Adds **heartspots** (a center's meditation places) and lets a slot say where the sitting happens — a heartspot or the preceptor's home, with an address and map location. Existing slots become heartspot sittings at the center they already had, and every center gets one starting heartspot named after it. |
| `006_private_home_address.sql` | Moves a preceptor's **home address into its own table**, so it is readable only after they confirm a sitting (see below). Run it right after 005. |
| `007_home_address_on_profile.sql` | Moves that address from the slot to the **profile** — a preceptor has one home, not one per weekly slot. Also takes `home_latitude` / `home_longitude` off `profiles`, closing a hole where any signed-in user could read where anyone else lived. |
| `008_preceptor_approval.sql` | Makes a **preceptor account wait for an admin's approval** before it can publish a schedule or take requests (see below). Everyone already registered as a preceptor is marked approved, so nothing in a running app stops working — only new sign-ups have to wait. |
| `009_open_requests_and_notifications.sql` | Lets a preceptor **accept requests outside their schedule**, adds the **notifications** inbox, and adds the look-ahead search behind "next available time" and the by-area list. |
| `010_cancellation_message_and_session_types.sql` | Adds the **types of session** master list, lets a booking say **how many people are coming** (so places are counted by people, not bookings), and carries a preceptor's **cancellation message in both languages** through to the abhyasi's notification. |

A fresh `schema.sql` already includes 003–010 — the migrations are only for a database that already exists.

### Being asked for a time outside the schedule

A preceptor's schedule is the times they have published. Some are happy to be asked for others; the toggle **"Accept requests outside my schedule"** — on the Profile screen, and on the dashboard where it is easier to change week to week — is that choice.

When it is on, two things follow. The preceptor is listed in search, and in **Near me**, even on a day they hold no slot; and an abhyasi can name a day and time themselves. Such a request has no slot behind it, so it carries its own time and no place — the preceptor settles where to meet when they confirm.

These requests are **never auto-confirmed**, even for a preceptor who has auto-confirm on. Auto-confirm is a promise about times you published; a time nobody published is always yours to accept by hand.

An **unapproved** preceptor is not listed and cannot be asked, switch or no switch: approval comes first, everywhere.

The rules are enforced in the database, not on the screen: a request with no slot is refused unless that preceptor has opted in and been approved.

### What kind of sitting, and how many are coming

Requesting a sitting asks two more things.

**Type of session.** A dropdown filled from the `session_types` table — master data, like zones and centers. It starts with **Regular individual sitting** and **Introductory sitting**; admins add, rename, reorder or hide others on the **Master data** screen. Hiding one (unchecking *Active*) takes it out of the dropdown while sittings already booked as that type keep their name.

**How many people are accompanying you.** The seeker counts themselves, so "2 people with me" is a party of three, and a booking now takes **1 + accompanying** places in the slot rather than always one. "3 of 4 left" therefore means three more *people*.

**Asking for more than the slot holds.** A preceptor who opened a sitting for four has said what they can manage, but a fifth person arriving is theirs to allow — so the app neither refuses it silently nor lets it through unnoticed:

1. The seeker is told before the request goes: *"…allows 4 people at this sitting. You have chosen 5. We will ask them for 5. If they agree, all 5 of you can come. If not, 4 will be approved."* They can change the number or ask anyway.
2. The preceptor sees the request with both numbers and two buttons — **Confirm all 5** or **Confirm 4 only**.
3. Whatever they choose, the abhyasi is told: a trimmed party reads *"4 of the 5 you asked for"* on the booking and in the notification.

Such a request is **never auto-confirmed**, even for a preceptor who has auto-confirm on: that promise is about the sitting as they published it. A slot with no free place at all is still full, and the database says so.

Only the preceptor (or an admin) can change how many people are approved, and what the seeker originally asked for can never be rewritten — both are enforced in the database, not on the screen.

### Cancelling a sitting, in the preceptor's own words

A confirmed sitting can be called off, and when it is, the reason matters more than the fact. **Cancel** on an incoming sitting opens a message box rather than cancelling straight away.

**One message, three places.** What the preceptor types is what the abhyasi reads — in their notification, on their booking, and in the WhatsApp message. Nothing is paraphrased.

**English and Hindi.** There are two boxes. Tapping one of the common reasons ("I am unwell…", "I am travelling…") fills both at once, already translated; anything typed by hand can be given its own Hindi. The frame around the message — the greeting, the date, the place, the kind of sitting — is written out in both languages either way. Left empty, the English words are repeated under the Hindi heading rather than machine-translated into something the preceptor did not say.

**Then WhatsApp.** Once the sitting is cancelled the app offers the finished message with a **Send on WhatsApp** button. If the abhyasi has a phone number on their profile, the link opens **their** chat with the message ready to send — nothing to look up or paste. A bare ten-digit number is read as Indian (`+91`); anything already carrying a country code is left alone. The text is copied to the clipboard at the same time, so a phone that opens WhatsApp without the draft still has it to paste, and there is a **Copy** button for sending it anywhere else.

### Notifications

The database writes a notification whenever something happens that someone should hear about:

| Who hears | When |
|---|---|
| The preceptor | Someone requests a sitting — from their schedule or outside it |
| The preceptor | An abhyasi cancels a sitting |
| The abhyasi | Their request is confirmed, declined, or cancelled — a cancellation carrying the preceptor's own message, in English and Hindi |
| The abhyasi | The preceptor proposes another time |

They appear under the **bell** in the top bar, with a count of the unread ones. The count is refreshed when a screen is opened, when the tab regains focus, and once a minute — so it is never more than a minute stale, without holding a connection open.

Nobody can write into anyone's inbox: the rows are written by a database trigger, and no one is granted permission to insert them.

### Finding a time when nothing is free today

Two things stop a search from ending in a dead end.

**Next available.** The search reads the whole fortnight in one go, so when the day being looked at has nothing, the app can still say when the next free time is and whose — with a button to request it there and then.

**By area.** When nobody is available near the seeker, the results are replaced by every available preceptor grouped by **area** (the center's city) and then by **center**, each with their soonest free time. With "Near me" on, the closest area comes first.

### A preceptor's home address is private

A preceptor who gives sittings at home is sharing where they live, so the app treats that address differently from a heartspot's.

It is entered **once, on the Profile screen** — not on each weekly slot. A slot set to "My home" simply points at it.

**Who can read it:** the person themselves, an admin, and an abhyasi whose booking on one of that preceptor's home slots has been **confirmed**. A request that is still waiting does not count — asking is not the same as being invited.

**What everyone else sees:** the city and center, and the words "Preceptor's home". No address, no map link, and no Directions button.

This is enforced by the database, not by the screens. The address lives in its own table (`home_places`) with a security rule on it, because `profiles` is readable by every signed-in user — the app needs names on booking cards — and Postgres security rules work row by row, so an address kept there would be readable by all of them. Hiding it only in the app would leave it one API call away.

The same table holds the home location an **abhyasi** saves for "near me". That used to sit on `profiles` in the clear, where anyone signed in could read it; now nobody but its owner can.

**"Near me" still works.** The search runs through a database function that can read the private row and hands back a coordinate rounded to two decimal places — about a kilometre. That is enough to sort preceptors by distance and not enough to find a house, so home sittings show an approximate distance (`~3 km`) rather than a precise one.

A heartspot's address is public, as it should be — it is a place the whole centre already knows.

### An abhyasi's profile asks for less

A preceptor's details are meant to travel: abhyasis have to reach them, so their profile has a **Google location** picker (map, pin and Maps link) and a **Share on WhatsApp** button that sends their name, phone, address and map link to any chat.

An abhyasi is never the destination of a sitting, so neither is on their profile. They see a plain address box and nothing else. "Near me" is unaffected — it asks the phone for its location when you tap it.

### Every profile save says so

Saving on the Profile screen ends in a confirmation you have to dismiss, for every role. A change is never left in doubt about whether it took.

### Zones, centers and heartspots

The place a sitting happens is three levels deep:

```
Zone  ->  Center (grouped by city)  ->  Heartspot
```

A **center** is the administrative unit preceptors and abhyasis file themselves under; a **heartspot** is an actual room people walk into. A center usually has one, sometimes several.

Admins maintain both on the **Master data** screen. It opens **by city**, since that is how people look for a heartspot — open a city, open one of its centers, and add or edit its heartspots there. **Add heartspot** at the top starts the other way round: pick the city, then the center in it, then the details. Switch to **by zone** for the administrative view.

Each level can carry an address, a map location and a Google Maps link. The most specific one wins — a sitting shows the heartspot's address, or falls back to the center's if the heartspot has none. A preceptor giving sittings at home enters their own address on the slot itself.

---

## Installing the app on a phone (PWA)

This app is a **Progressive Web App**, so it can be added to a phone's home screen and opened like a normal app (no app store needed). This works best once the app is live online (see the next section).

- **On Android (Chrome):** open the website, tap the **⋮** menu, then **Add to Home screen / Install app**.
- **On iPhone (Safari):** open the website, tap the **Share** button, then **Add to Home Screen**.

---

## Putting the app online with Vercel

Vercel hosts your app on the internet for free.

1. Put your project on **GitHub**:
   - Create a free account at **https://github.com**.
   - The simplest no-typing way is to install **GitHub Desktop** (https://desktop.github.com), choose **File → Add Local Repository**, select the `heartfulness-ams` folder, then **Publish repository**. (Keep it private if you wish.)
2. Go to **https://vercel.com** and sign in with your GitHub account.
3. Click **Add New… → Project**, find your `heartfulness-ams` repository, and click **Import**.
4. Vercel will detect it is a **Vite** app automatically. Before deploying, open **Environment Variables** and add the same two values from your `.env` file:
   - `VITE_SUPABASE_URL` → your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` → your `anon public` key
   - `VITE_GOOGLE_MAPS_API_KEY` → only if you set up the optional in-app map
5. Click **Deploy**. After a minute you will get a live web address like `https://heartfulness-ams.vercel.app`.
6. **Important final step:** go back to **Supabase → Authentication → URL Configuration** and add your new Vercel address to both the **Site URL** and the **Redirect URLs** (in addition to `http://localhost:5173`). If you use Google login, also add the Vercel address is **not** needed in Google (Google only needs the Supabase callback URL from Step F.1).

Your app is now live and installable on any phone.

---

## Project structure

You don't need to read the code, but here is a map in case you're curious:

```
heartfulness-ams/
├── assets/brand/           The Heartfulness artwork, as supplied            ← the originals
├── public/                 Logo files and app icons, generated from it
│                           (scripts/prepare_logos.py, then scripts/make_icons.py)
├── supabase/
│   ├── schema.sql          Creates all tables, security rules, booking logic   ← run first
│   ├── seed.sql            Gujarat zones, centers & their heartspots            ← run second
│   └── migrations/         Changes to apply if your database already exists
├── src/
│   ├── components/         Reusable pieces (buttons, cards, navigation, modals)
│   ├── context/            Sign-in / sign-out handling
│   ├── lib/                Talks to Supabase; helper functions
│   ├── pages/              Each screen (Find, My sittings, Schedule, Profile…)
│   ├── App.tsx             Decides which screen to show
│   └── main.tsx            Starts the app
├── .env                    Your secret connection values (you create this)
└── package.json            The list of building blocks
```

How the **"places left"** count stays correct: the database itself counts the people already coming — each booking and everyone it brings — and refuses a request for a slot with none left, even if two people tap **Book** at the exact same moment. A party larger than the places left is the one thing it lets through, because that is a question for the preceptor; they are asked, and they answer.

> This guard was broken until `004_fix_capacity_guard.sql`. The check counted the bookings already on a slot, but it ran with the booking person's own permissions — and those only let you see *your own* bookings. So the second person to book counted zero and was let in, and a one-place slot could take any number of people. If your database predates that migration, run it.

---

## Troubleshooting

**The "Continue with Google" button does nothing or shows an error.**
- Re-check Step F. The most common mistake is a missing or mistyped **redirect URL**. The URL in Google must be exactly `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`, and your app's address must be listed under **Redirect URLs** in Supabase.

**After signing in, I'm stuck or see a blank screen.**
- Make sure you ran **both** `schema.sql` and `seed.sql` (Steps D and E).
- Check that your `.env` file has the correct **Project URL** and **anon key**, with no extra spaces, and that the file is named exactly `.env`.
- Stop the app (`Ctrl + C`) and run `npm run dev` again — changes to `.env` are only picked up on restart.

**"No open sittings" even though I expect some.**
- Slots are weekly. A preceptor's Monday slot only appears on dates that fall on a Monday. Pick the matching day in the date strip.
- A slot only shows if it is **Active** and not already full.

**Email sign-up says "check your email" but I got nothing.**
- Turn off **Confirm email** as described in Step G while testing, or check your spam folder.

**`npm install` fails.**
- Make sure Node.js installed correctly (`node -v` should show a version). Close and reopen the Terminal, navigate back into the folder (Step I, point 2), and try again.

**I want to wipe everything and start over.**
- Re-run `schema.sql` in the SQL Editor — it safely clears and recreates all tables. Then re-run `seed.sql`.

---

*Built with care for the Heartfulness community. 🙏*
