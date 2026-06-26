import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !anonKey) {
  // A friendly nudge in the browser console if the .env file is missing.
  console.error(
    'Supabase is not configured. Copy .env.example to .env and add your ' +
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart "npm run dev".',
  )
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
