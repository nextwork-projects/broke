import "server-only";
import { createClient } from "@supabase/supabase-js";

// Secret key: bypasses RLS. Server routes only (Plaid tokens, sync writes).
export const createAdminClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
