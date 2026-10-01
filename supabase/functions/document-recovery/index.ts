import { createClient } from '@supabase/supabase-js';
import { recoveryHandler } from './reconcile.mjs';

Deno.serve(recoveryHandler({
  getEnv: (name: string) => Deno.env.get(name) || '',
  createService: () => createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}));
