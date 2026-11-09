import "server-only";
import { writeEnvLocal } from "@/lib/envfile";
import { migrate } from "@/lib/migrate";
import { projectKeys } from "@/lib/supabase-mcp";

/** Writes a project's address and publishable key (read through the Supabase sign-in), then creates broke's tables. */
export async function fillFrom(ref: string) {
  const { url, key } = await projectKeys(ref);
  const values = { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key };
  writeEnvLocal(values);
  Object.assign(process.env, values); // usable now; Next's own env reload follows
  const r = await migrate();
  return { ok: true, tables: !r.error };
}
