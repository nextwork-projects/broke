import { getUser } from "@/lib/data";
import { addChoices } from "@/lib/providers";
import { canWriteEnv, currentEnv, setupAccess, supabaseReady } from "@/lib/setup";
import { createAdminClient } from "@/utils/supabase/admin";
import { GoLive } from "./GoLive";

export const dynamic = "force-dynamic";

// "Use your real bank": the steps from Plaid's test banks to real ones, in order, one at a time.
export default async function GoLivePage() {
  const [{ user }, access] = await Promise.all([getUser(), setupAccess()]);
  const live = currentEnv().PLAID_ENV === "production";
  const { data: items } = user && supabaseReady()
    ? await createAdminClient().from("plaid_items").select("id, institution_name, access_token").eq("user_id", user.id).eq("provider", "plaid")
    : { data: [] };
  const rows = (items ?? []) as { id: string; institution_name: string | null; access_token: string | null }[];
  const test = rows.filter((i) => i.access_token?.startsWith("access-sandbox-")).map((i) => ({ id: i.id, name: i.institution_name ?? "Test bank" }));
  return (
    <GoLive
      live={live}
      canWrite={canWriteEnv()}
      testItems={test}
      realLinked={rows.length - test.length}
      plaidCountry={addChoices(user?.user_metadata?.profile?.country).bank === "plaid"}
    />
  );
}
