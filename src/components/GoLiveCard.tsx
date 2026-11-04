import Link from "next/link";
import { duplicateItems } from "@/lib/links";
import { addChoices } from "@/lib/providers";
import { currentEnv, supabaseReady } from "@/lib/setup";
import { createAdminClient } from "@/utils/supabase/admin";

// Home: on Plaid's test banks, the way to real ones; on real banks with test connections still there, the way to clear them.
export async function GoLiveCard({ country, userId }: { country?: string | null; userId?: string }) {
  if (addChoices(country).sandbox) {
    return (
      <Link href="/go-live" className="card-link px-5 py-3.5 flex items-center justify-between gap-3">
        <span className="min-w-0 truncate">You&apos;re looking at test data</span>
        <span className="text-sm shrink-0 underline underline-offset-4">Use your real bank</span>
      </Link>
    );
  }
  if (!userId || !supabaseReady()) return null;
  // A bank linked twice doubles every transaction: say so first.
  const { data: items } = await createAdminClient().from("plaid_items").select("id, institution_id, institution_name, created_at, accounts(mask, type)").eq("user_id", userId);
  const copies = duplicateItems((items ?? []).map((i) => ({ id: i.id, institution_id: i.institution_id, created_at: i.created_at, accounts: (i.accounts ?? []) as { mask: string | null; type: string | null }[] })));
  if (copies.size) {
    const names = [...new Set((items ?? []).filter((i) => copies.has(i.id)).map((i) => i.institution_name ?? "A bank"))];
    return (
      <section className="card p-6 space-y-3">
        <div className="card-title">{names.join(" and ")} {names.length === 1 ? "is" : "are"} linked twice</div>
        <p className="text-sm text-muted">Each copy brings in the same transactions, so they show up twice. Remove the extra copy and everything shows once.</p>
        <Link href="/accounts/add" className="btn-primary inline-block">Fix it</Link>
      </section>
    );
  }
  if (currentEnv().PLAID_ENV !== "production") return null;
  const { count } = await createAdminClient().from("plaid_items").select("id", { count: "exact", head: true }).eq("user_id", userId).like("access_token", "access-sandbox-%");
  if (!count) return null;
  return (
    <section className="card p-6 space-y-3">
      <div className="card-title">Test data is still mixed in</div>
      <p className="text-sm text-muted">{count === 1 ? "A test bank from before" : `${count} test banks from before`} still {count === 1 ? "sits" : "sit"} next to your real money, and every total here counts {count === 1 ? "it" : "them"}.</p>
      <Link href="/settings#banks" className="btn-primary inline-block">Delete test data</Link>
    </section>
  );
}
