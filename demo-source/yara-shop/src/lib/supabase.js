import { createClient } from '@supabase/supabase-js';
import { createMockSupabase } from './mockSupabase';
import { DEMO_DATA, DEMO_USER } from './demoData';

export const DEMO_MODE = process.env.REACT_APP_DEMO_MODE === 'true';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = DEMO_MODE
  ? createMockSupabase(DEMO_DATA, DEMO_USER)
  : createClient(supabaseUrl, supabaseKey);
