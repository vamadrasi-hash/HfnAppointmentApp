# Heartfulness Sittings — Appointment Management System

A simple, mobile-first web app for the Heartfulness community in South Gujarat. **Preceptors** (trainers) publish the weekly times when they can give individual meditation sittings, and **abhyasis** (practitioners) browse those preceptors by zone, center, area or city and book an open slot. The app shows how many places are left in each slot and hides a slot once it is full.

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
- Sign in with Google or email.
- Pick a day, then filter preceptors by zone, center, area, city or time of day.
- See each preceptor's open times and how many places remain (for example, "1 of 4 left").
- Book a sitting, add an optional note, and later cancel it.
- Optionally use "Near me" to sort preceptors by distance from your location.

**For preceptors (trainers):**
- Everything an abhyasi can do (preceptors can also book sittings with others), **plus**:
- Set their weekly availability — day, start and end time, how many people can come, and which center.
- Pause a slot without deleting it.
- See who has booked (with the person's phone number) and mark a sitting as completed or cancelled.

**For admins:**
- A read-only overview of all zones, centers and areas.

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

This loads example zones, centers and areas so you can see the app working immediately. You will replace these with your real data later (see [this section](#replacing-the-sample-data)).

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
- You will be taken to a short **welcome screen** to enter your name, phone, and choose your zone/center. Choose **Abhyasi** or **Preceptor**.
- After that you land on the home screen.

---

## Step J — Make yourself an admin

The very first admin must be set by hand (this is a one-time security step). **Do this after you have signed in at least once**, so your account already exists.

1. In Supabase, open the **SQL Editor → + New query**.
2. Paste the following, replacing the email with the one you signed in with:
   ```sql
   update profiles set role = 'admin' where email = 'you@example.com';
   ```
3. Click **Run**.
4. Refresh the app. You are now an admin and will see the **Master data** screen.

---

## Understanding roles

There are three roles:

| Role | Can book sittings | Can give sittings | Sees Master data |
|------|:---:|:---:|:---:|
| **Abhyasi** (practitioner) | ✅ | — | — |
| **Preceptor** (trainer) | ✅ | ✅ | — |
| **Admin** | ✅ | ✅ | ✅ |

- During the welcome screen, a person can choose **Abhyasi** or **Preceptor** themselves so they can start using the app right away.
- If you would rather **approve** preceptors yourself, ask everyone to sign up as **Abhyasi**, and then promote the real preceptors by running this in the SQL Editor (replace the email):
  ```sql
  update profiles set role = 'preceptor' where email = 'trainer@example.com';
  ```
- The same idea is used to add more admins.

---

## Replacing the sample data

The app ships with example zones, centers and areas for South Gujarat. There are two easy ways to put in your **real** master data.

### Option 1 — Edit the seed file and re-run it (good for a full replacement)

1. Open **`supabase/seed.sql`** in VS Code.
2. You will see three clearly labelled blocks: **zones**, **centers**, and **areas**. Edit the names, cities, pincodes and (optionally) latitude/longitude to match your real data, following the same pattern that is already there.
3. To apply your changes cleanly, first **re-run `schema.sql`** (Step D) to clear old data, then **run your edited `seed.sql`** (Step E).
   - The latitude/longitude values are only used for the "Near me" distance feature. If you don't have them, you can leave them as `null`.

### Option 2 — Use the Supabase Table Editor (good for small additions)

1. In Supabase, open **Table Editor** in the left sidebar.
2. Choose the **zones** table and add your zones (click **Insert → Insert row**).
3. Then open **centers**, add each center, and pick its **zone_id** from the dropdown.
4. Then open **areas**, add each area, and pick its **center_id** from the dropdown.

> The order matters: zones first, then centers, then areas, because each one points to the level above it.

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
5. Click **Deploy**. After a minute you will get a live web address like `https://heartfulness-ams.vercel.app`.
6. **Important final step:** go back to **Supabase → Authentication → URL Configuration** and add your new Vercel address to both the **Site URL** and the **Redirect URLs** (in addition to `http://localhost:5173`). If you use Google login, also add the Vercel address is **not** needed in Google (Google only needs the Supabase callback URL from Step F.1).

Your app is now live and installable on any phone.

---

## Project structure

You don't need to read the code, but here is a map in case you're curious:

```
heartfulness-ams/
├── public/                 App icons (the teal lotus)
├── supabase/
│   ├── schema.sql          Creates all tables, security rules, booking logic   ← run first
│   └── seed.sql            Sample zones / centers / areas                       ← run second
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

How the **"places left"** count stays correct: the database itself refuses any booking that would over-fill a slot, even if two people tap **Book** at the exact same moment. So a slot can never be double-booked beyond its capacity.

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
