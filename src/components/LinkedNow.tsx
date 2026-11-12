import { Merchant } from "@/components/Merchant";
import { RemoveCopy } from "@/components/PlaidButtons";
import { RemoveTest } from "@/components/ClearTestData";
import { duplicateItems } from "@/lib/links";
import { fmtFor, fmtWith } from "@/lib/format";
import { historyPending } from "@/lib/sync";
import { createAdminClient } from "@/utils/supabase/admin";

const ago = (iso: string | null) => {
  if (!iso) return "not synced yet";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  return m < 1 ? "synced just now" : m < 60 ? `synced ${m} min ago` : m < 1440 ? `synced ${Math.round(m / 60)} h ago` : `synced ${Math.round(m / 1440)} d ago`;
};

// Every connection the user has, with its accounts, before the ways to add more. Own connections only
// (a partner's shared accounts live on /accounts). Admin client: test vs real comes from the access token,
// which the browser role can't read (0002); only that one fact leaves this component.
export async function LinkedNow({ userId, profile }: { userId: string; profile?: { country?: string; currency?: string } }) {
  const db = createAdminClient();
  const [{ data: items }, { data: accts }] = await Promise.all([
    db.from("plaid_items").select("id, institution_id, institution_name, institution_logo, institution_color, provider, status, last_synced_at, created_at, access_token").eq("user_id", userId).order("created_at"),
    db.from("accounts").select("id, item_id, name, custom_name, mask, type, current_balance, manual").eq("user_id", userId).order("name"),
  ]);
  const money = fmtWith(fmtFor(profile)).money0;
  const pending = new Set(historyPending());
  const conns = (items ?? []).map((i) => ({
    id: i.id as string, name: (i.institution_name as string | null) ?? "Bank", logo: i.institution_logo as string | null, color: i.institution_color as string | null,
    test: !!(i.access_token as string | null)?.startsWith("access-sandbox-"), broken: i.status !== "ok", synced: i.last_synced_at as string | null,
    institution_id: i.institution_id as string | null, created_at: i.created_at as string,
    accounts: (accts ?? []).filter((a) => a.item_id === i.id && !a.manual),
  }));
  const manual = (accts ?? []).filter((a) => a.manual);
  const copies = duplicateItems(conns.map((c) => ({ id: c.id, institution_id: c.institution_id, created_at: c.created_at, accounts: c.accounts.map((a) => ({ mask: a.mask as string | null, type: a.type as string | null })) })));
  if (!conns.length && !manual.length)
    return <section className="card p-5 text-sm text-muted">Nothing linked yet. Pick a way to add an account below.</section>;
  const label = (a: { custom_name: string | null; name: string; mask: string | null }) => `${a.custom_name || a.name}${a.mask ? ` ··${a.mask}` : ""}`;
  return (
    <section className="card overflow-hidden">
      <div className="p-5 pb-3 flex items-baseline justify-between gap-3">
        <div className="card-title">Linked now</div>
        <span className="text-sm text-muted">{conns.length} {conns.length === 1 ? "bank" : "banks"}, {(accts ?? []).length} accounts</span>
      </div>
      <ul className="divide-y divide-line border-t border-line">
        {conns.map((c) => (
          <li key={c.id} className="p-5 flex gap-3.5">
            <Merchant name={c.name} logo={c.logo} color={c.color} />
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{c.name}</span>
                <span className={`text-sm ${c.test ? "text-bad" : c.broken ? "text-bad" : "text-muted"}`}>
                  {c.test ? "Test bank, not real money" : c.broken ? "Needs you to sign in again" : ago(c.synced)}
                </span>
              </div>
              {copies.has(c.id) && (
                <div className="space-y-1.5 py-1">
                  <p className="text-sm text-bad">Linked twice: these are the same accounts as the {c.name} above, so every transaction shows twice.</p>
                  <RemoveCopy itemId={c.id} name={c.name} />
                </div>
              )}
              {pending.has(c.id) && <p className="text-sm text-muted">Older history is still coming in from the bank. broke checks again every 10 minutes.</p>}
              <ul className="text-sm text-muted">
                {c.accounts.map((a) => (
                  <li key={a.id} className="flex justify-between gap-3 tabular"><span className="truncate">{label(a)}</span><span>{a.current_balance == null ? "" : money(Number(a.current_balance))}</span></li>
                ))}
              </ul>
            </div>
          </li>
        ))}
        {manual.length > 0 && (
          <li className="p-5 space-y-1">
            <span className="font-medium">Added by hand</span>
            <ul className="text-sm text-muted">
              {manual.map((a) => <li key={a.id} className="flex justify-between gap-3 tabular"><span className="truncate">{label(a)}</span><span>{a.current_balance == null ? "" : money(Number(a.current_balance))}</span></li>)}
            </ul>
          </li>
        )}
      </ul>
      {conns.some((c) => c.test) && (
        <div className="px-5 py-3.5 border-t border-line">
          <RemoveTest items={conns.filter((c) => c.test).map((c) => ({ id: c.id, name: c.name }))} intro="Test banks count in your totals." />
        </div>
      )}
    </section>
  );
}
