#!/usr/bin/env node
/**
 * Does the database have everything this app asks of it?
 *
 * Every "Could not find the 'x' column of 'y' in the schema cache" the app
 * has ever shown meant the same thing: a migration in supabase/migrations
 * was never run against this project. The message names the column but not
 * the file, so the fix is a guess.
 *
 * This script asks the same questions the app asks — every table, column,
 * relationship and function it uses — and, for anything missing, names the
 * migration file that adds it.
 *
 *   npm run check:schema
 *
 * It reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from .env (the same
 * two values the app uses) or from the environment. It only ever reads, and
 * the anon key is enough: a missing column is refused before row level
 * security is consulted, so no sign-in is needed.
 */

import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// ---------------------------------------------------------------------
// What the app needs, and which migration adds it
//
// A column is listed against the migration that introduces it, so the
// report can say "run 010" rather than "something is missing".
// ---------------------------------------------------------------------
const BASE = 'supabase/schema.sql'

/** @type {{table: string, columns: Record<string, string>}[]} */
const TABLES = [
  {
    table: 'zones',
    columns: {
      id: BASE, name: BASE, description: BASE, sort_order: BASE,
    },
  },
  {
    table: 'centers',
    columns: {
      id: BASE, zone_id: BASE, name: BASE, city: BASE, address: BASE,
      latitude: BASE, longitude: BASE,
      map_url: '005_sitting_place_and_heartspots.sql',
    },
  },
  {
    table: 'heartspots',
    columns: {
      id: '005_sitting_place_and_heartspots.sql',
      center_id: '005_sitting_place_and_heartspots.sql',
      name: '005_sitting_place_and_heartspots.sql',
      address: '005_sitting_place_and_heartspots.sql',
      latitude: '005_sitting_place_and_heartspots.sql',
      longitude: '005_sitting_place_and_heartspots.sql',
      map_url: '005_sitting_place_and_heartspots.sql',
      is_active: '005_sitting_place_and_heartspots.sql',
      updated_at: '005_sitting_place_and_heartspots.sql',
    },
  },
  {
    table: 'profiles',
    columns: {
      id: BASE, full_name: BASE, email: BASE, phone: BASE, role: BASE,
      zone_id: BASE, center_id: BASE, city: BASE, auto_confirm: BASE,
      created_at: BASE, updated_at: BASE,
      preceptor_status: '008_preceptor_approval.sql',
      approved_by: '008_preceptor_approval.sql',
      approved_at: '008_preceptor_approval.sql',
      accepts_open_requests: '009_open_requests_and_notifications.sql',
    },
  },
  {
    table: 'home_places',
    columns: {
      profile_id: '006_private_home_address.sql',
      address: '006_private_home_address.sql',
      latitude: '006_private_home_address.sql',
      longitude: '006_private_home_address.sql',
      map_url: '006_private_home_address.sql',
      updated_at: '006_private_home_address.sql',
    },
  },
  {
    table: 'availability_slots',
    columns: {
      id: BASE, preceptor_id: BASE, center_id: BASE, day_of_week: BASE,
      start_time: BASE, end_time: BASE, capacity: BASE, is_active: BASE,
      note: BASE,
      place_type: '005_sitting_place_and_heartspots.sql',
      heartspot_id: '005_sitting_place_and_heartspots.sql',
    },
  },
  {
    table: 'session_types',
    columns: {
      id: '010_cancellation_message_and_session_types.sql',
      name: '010_cancellation_message_and_session_types.sql',
      name_hi: '010_cancellation_message_and_session_types.sql',
      description: '010_cancellation_message_and_session_types.sql',
      sort_order: '010_cancellation_message_and_session_types.sql',
      is_active: '010_cancellation_message_and_session_types.sql',
      updated_at: '010_cancellation_message_and_session_types.sql',
    },
  },
  {
    table: 'bookings',
    columns: {
      id: BASE, slot_id: BASE, abhyasi_id: BASE, preceptor_id: BASE,
      booking_date: BASE, status: BASE, note: BASE, created_at: BASE,
      requested_at: '001_confirmation_workflow.sql',
      confirmed_at: '001_confirmation_workflow.sql',
      decided_at: '001_confirmation_workflow.sql',
      decided_by: '001_confirmation_workflow.sql',
      cancel_reason: '001_confirmation_workflow.sql',
      decline_reason: '001_confirmation_workflow.sql',
      alternate_date: '001_confirmation_workflow.sql',
      alternate_start_time: '001_confirmation_workflow.sql',
      alternate_end_time: '001_confirmation_workflow.sql',
      channel_used: '001_confirmation_workflow.sql',
      requested_start_time: '009_open_requests_and_notifications.sql',
      requested_end_time: '009_open_requests_and_notifications.sql',
      session_type_id: '010_cancellation_message_and_session_types.sql',
      accompanying_count: '010_cancellation_message_and_session_types.sql',
      requested_accompanying_count: '010_cancellation_message_and_session_types.sql',
      cancel_reason_hi: '010_cancellation_message_and_session_types.sql',
    },
  },
  {
    table: 'notifications',
    columns: {
      id: '009_open_requests_and_notifications.sql',
      profile_id: '009_open_requests_and_notifications.sql',
      booking_id: '009_open_requests_and_notifications.sql',
      kind: '009_open_requests_and_notifications.sql',
      title: '009_open_requests_and_notifications.sql',
      body: '009_open_requests_and_notifications.sql',
      read_at: '009_open_requests_and_notifications.sql',
      created_at: '009_open_requests_and_notifications.sql',
    },
  },
]

// The joins the app writes as PostgREST embeds. A missing foreign key
// breaks these even when every column is present, so they are asked for
// by name — including the two that have to name the constraint, because
// `bookings` reaches `profiles` twice.
const EMBEDS = [
  {
    what: 'profile → home address',
    table: 'profiles',
    select: 'id,home_place:home_places(address)',
    migration: '006_private_home_address.sql',
  },
  {
    what: 'slot → preceptor, center, heartspot',
    table: 'availability_slots',
    select: 'id,preceptor:profiles(id,home_place:home_places(address)),center:centers(id),heartspot:heartspots(id)',
    migration: '005_sitting_place_and_heartspots.sql',
  },
  {
    what: 'booking → slot, both people, kind of sitting',
    table: 'bookings',
    select:
      'id,slot:availability_slots(id),preceptor:profiles!bookings_preceptor_id_fkey(id),' +
      'abhyasi:profiles!bookings_abhyasi_id_fkey(id),session_type:session_types(id)',
    migration: '010_cancellation_message_and_session_types.sql',
  },
]

// The database functions the search screens call.
const FUNCTIONS = [
  {
    name: 'find_available_slots',
    args: { target_date: '2000-01-01' },
    migration: '010_cancellation_message_and_session_types.sql',
  },
  {
    name: 'find_available_slots_range',
    args: { start_date: '2000-01-01', days: 1 },
    migration: '010_cancellation_message_and_session_types.sql',
  },
  {
    name: 'find_open_request_preceptors',
    args: {},
    migration: '009_open_requests_and_notifications.sql',
  },
  // Not called by the app. It stands in for the guard that refuses a
  // booking in the past, which is a trigger and so cannot be asked for
  // over the API — the two arrive in the same migration, so its absence
  // says the guard is absent too.
  {
    name: 'app_timezone',
    args: {},
    migration: '012_no_bookings_in_the_past.sql',
  },
]

// ---------------------------------------------------------------------
// Reading the two settings
// ---------------------------------------------------------------------
function readEnv() {
  const env = { ...process.env }
  const file = resolve(ROOT, '.env')
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const value = m[2].replace(/^['"]|['"]$/g, '')
      // A real environment variable wins over the file.
      if (!env[m[1]]) env[m[1]] = value
    }
  }
  return env
}

const env = readEnv()
const URL_ = (env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
const KEY = env.VITE_SUPABASE_ANON_KEY || ''

if (!URL_ || !KEY) {
  console.error(
    'Cannot reach the database: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not set.\n' +
      'Copy .env.example to .env and fill in the two values from your Supabase\n' +
      'project (Dashboard -> Project Settings -> API), then run this again.',
  )
  process.exit(2)
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` }

async function get(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { headers })
  let body = null
  try {
    body = await res.json()
  } catch {
    /* an empty body is fine */
  }
  return { status: res.status, body }
}

async function callFunction(name, args) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  let body = null
  try {
    body = await res.json()
  } catch {
    /* an empty body is fine */
  }
  return { status: res.status, body }
}

// PostgREST answers "this is not in my schema cache" with PGRST20x, and
// "you may not read this" with 401/403. Only the first kind is a problem
// here — the second means the thing exists, which is all we asked.
const MISSING = /^PGRST20[0-9]$/

function isMissing(res) {
  return MISSING.test(res.body?.code ?? '')
}

// ---------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------
const problems = []

for (const { table, columns } of TABLES) {
  const names = Object.keys(columns)
  const all = await get(`${table}?select=${names.join(',')}&limit=0`)
  if (all.status < 300) continue

  // PGRST205 is "no such table" — no point asking after its columns.
  if (all.body?.code === 'PGRST205') {
    problems.push({ migration: columns[names[0]], what: `table '${table}' is missing` })
    continue
  }

  // Otherwise ask column by column, so the report names every missing
  // one rather than only the first.
  let named = false
  for (const column of names) {
    const one = await get(`${table}?select=${column}&limit=0`)
    if (one.status < 300) continue
    problems.push({ migration: columns[column], what: `${table}.${column} is missing` })
    named = true
  }
  if (!named) {
    problems.push({
      migration: '(unknown)',
      what: `${table}: ${all.body?.message ?? `HTTP ${all.status}`}`,
    })
  }
}

for (const { what, table, select, migration } of EMBEDS) {
  const res = await get(`${table}?select=${encodeURIComponent(select)}&limit=0`)
  if (res.status < 300) continue
  problems.push({
    migration,
    what: `${what} — ${res.body?.message ?? `HTTP ${res.status}`}`,
  })
}

for (const { name, args, migration } of FUNCTIONS) {
  const res = await callFunction(name, args)
  if (!isMissing(res)) continue
  problems.push({ migration, what: `function ${name}() is missing` })
}

// ---------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------
if (problems.length === 0) {
  console.log(`The database at ${URL_} has everything the app needs.`)
  process.exit(0)
}

const byMigration = new Map()
for (const p of problems) {
  if (!byMigration.has(p.migration)) byMigration.set(p.migration, [])
  byMigration.get(p.migration).push(p.what)
}

console.error(`The database at ${URL_} is behind the app.\n`)
for (const [migration, items] of [...byMigration].sort()) {
  console.error(`  Run  ${migration.startsWith('supabase/') ? migration : `supabase/migrations/${migration}`}`)
  for (const item of items) console.error(`     · ${item}`)
  console.error('')
}
console.error(
  'Open the Supabase dashboard -> SQL Editor -> New query, paste each file\n' +
    'listed above in number order, and run it. Every migration is safe to\n' +
    're-run, so when in doubt run them all from 001 upwards.\n' +
    '\n' +
    'If a column shown here does exist in the dashboard, the schema cache is\n' +
    'simply stale — run  notify pgrst, \'reload schema\';  in the SQL Editor.',
)
process.exit(1)
