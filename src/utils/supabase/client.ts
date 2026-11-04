import { createBrowserClient } from "@supabase/ssr";

export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );

// Saves user_metadata, then refreshes the session so the signed token (which pages read via getClaims) carries the
// new values right away. Use this instead of auth.updateUser for every metadata write.
export async function updateMeta(sb: ReturnType<typeof createClient>, attrs: { data: Record<string, unknown> }) {
  const res = await sb.auth.updateUser(attrs);
  if (!res.error) await sb.auth.refreshSession();
  return res;
}
