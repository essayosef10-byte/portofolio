import { createClient } from '@supabase/supabase-js'
import { createMockSupabase } from './lib/mockSupabase'
import { DEMO_DATA, DEMO_USER } from './demoData'

const url = process.env.REACT_APP_SUPABASE_URL
const key = process.env.REACT_APP_SUPABASE_ANON_KEY
export const DEMO_MODE = process.env.REACT_APP_DEMO_MODE === 'true'

export const isConfigured = Boolean(url && key)

/* null when .env is missing, so the app can show a clear message instead of crashing. */
export const supabase = DEMO_MODE
  ? createMockSupabase(DEMO_DATA, DEMO_USER)
  : isConfigured ? createClient(url, key) : null

export function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Add REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY to .env')
  }
  return supabase
}
