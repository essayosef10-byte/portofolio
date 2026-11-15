import { createClient } from '@supabase/supabase-js';
import { createMockSupabase } from './mockSupabase';
import { DEMO_DATA, DEMO_USER } from './demoData';

export const DEMO_MODE = process.env.REACT_APP_DEMO_MODE === 'true';

// خد الـ URL والـ Anon Key من متغيرات البيئة (.env)
// REACT_APP_SUPABASE_URL=...
// REACT_APP_SUPABASE_ANON_KEY=...
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = DEMO_MODE
  ? createMockSupabase(DEMO_DATA, DEMO_USER)
  : createClient(supabaseUrl, supabaseAnonKey);

/**
 * بيحول اسم المستخدم لإيميل وهمي عشان نقدر نستخدم
 * signInWithPassword بتسجيل دخول (يوزر + باسورد) بدل الإيميل الحقيقي.
 * مثال: "ahmed" => "ahmed@pharmacrm.local"
 */
export function usernameToEmail(username) {
  const clean = (username || '').trim().toLowerCase();
  return `${clean}@pharmacrm.local`;
}
