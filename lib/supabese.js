import { createClient } from "@supabase/supabase-js";

// Cliente do Supabase usado pelo CRM.
// As duas variáveis são configuradas no painel da Vercel (Settings → Environment Variables).
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
