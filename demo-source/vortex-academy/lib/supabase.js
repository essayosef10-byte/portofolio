import { createClient } from "@supabase/supabase-js";
import { createMockSupabase } from "@/lib/mockSupabase";
import { DEMO_DATA, DEMO_USER } from "@/lib/demoData";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

/**
 * Validates if the Supabase environment variables are properly configured.
 */
export const isSupabaseConfigured = () => {
  if (DEMO_MODE) return true;
  return Boolean(
    supabaseUrl &&
      supabaseAnonKey &&
      !supabaseUrl.includes("your-project.supabase.co") &&
      !supabaseAnonKey.includes("your-anon-key-here")
  );
};

/**
 * Singleton Supabase Browser Client.
 * Safe fallback client to prevent app crash if environment variables are not yet provided.
 */
export const supabase = DEMO_MODE ? createMockSupabase(DEMO_DATA, DEMO_USER) : createClient(
  supabaseUrl || "https://placeholder-vortex.supabase.co",
  supabaseAnonKey || "placeholder-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

export default supabase;
