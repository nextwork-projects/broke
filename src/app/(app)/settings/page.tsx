import { getUser } from "@/lib/data";
import { isHosted } from "@/lib/llm/providers";
import { modeOf } from "@/lib/privacy";
import { currentEnv, fromLocalhost, setupAccess, supabaseReady } from "@/lib/setup";
import { createAdminClient } from "@/utils/supabase/admin";
import { DB_MESSAGES } from "../../setup/messages";
import { Settings } from "./Settings";

export const dynamic = "force-dynamic";

// Keys and statuses load in the browser from /api/setup/status (same as /setup), so no key details land in this payload.
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ db?: string }> }) {
  const [{ user }, access, { db }, local] = await Promise.all([getUser(), setupAccess(), searchParams, fromLocalhost()]);
  const mode = currentEnv().PLAID_ENV === "production" ? "production" : "sandbox";
  // Test connections: Plaid access tokens carry their environment ("access-sandbox-…").
  const { data: testItems } = user && supabaseReady()
    ? await createAdminClient().from("plaid_items").select("id, institution_name").eq("user_id", user.id).eq("provider", "plaid").like("access_token", "access-sandbox-%")
    : { data: [] };
  return (
    <Settings
      signedIn={access.signedIn}
      local={local}
      folder={isHosted() ? "" : process.cwd()}
      repo={process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}` : null}
      email={user?.email ?? ""}
      profile={user?.user_metadata?.profile ?? {}}
      aiMode={modeOf(user?.user_metadata)}
      mode={mode}
      testItems={(testItems ?? []).map((i) => ({ id: i.id as string, name: (i.institution_name as string | null) ?? "Test bank" }))}
      message={db && Object.hasOwn(DB_MESSAGES, db) ? DB_MESSAGES[db] : undefined}
    />
  );
}
