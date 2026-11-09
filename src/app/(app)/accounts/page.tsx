import { Banknote, BarChart3, Bitcoin, Car, CreditCard, Gem, HandCoins, House, Landmark, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { AccountToggle } from "@/components/AccountToggle";
import { HoldingFee } from "@/components/HoldingFee";
import { CardArt } from "@/components/CardArt";
import { Merchant } from "@/components/Merchant";
import { ownedCards } from "@/lib/cards";
import { ConnectionActions, SyncButton } from "@/components/PlaidButtons";
import { getUser } from "@/lib/data";
import { money, money0, plural } from "@/lib/format";

type Holding = { id: string; name: string | null; ticker: string | null; type: string | null; quantity: number | null; value: number | null; cost_basis: number | null };
type Account = { id: string; name: string; official_name?: string | null; custom_name: string | null; mask: string | null; type: string; subtype: string | null; current_balance: number | null; currency: string | null; home: number | null; included: boolean; holdings: Holding[] };
type Item = {
  id: string;
  institution_name: string | null;
  institution_logo: string | null;
  institution_color: string | null;
  last_synced_at: string | null;
  status?: string;
  error?: string | null;
  provider?: string;
  accounts: Account[];
};

const GROUPS: { type: string; label: string; icon: LucideIcon; debt: boolean }[] = [
  { type: "depository", label: "Cash", icon: Landmark, debt: false },
  { type: "investment", label: "Investments", icon: BarChart3, debt: false },
  { type: "other", label: "Property and other", icon: Gem, debt: false }, // manual cars, homes, valuables (Add accounts)
  { type: "credit", label: "Credit cards", icon: CreditCard, debt: true },
  { type: "loan", label: "Loans", icon: HandCoins, debt: true },
];

// Plaid subtypes are lowercase codes ("hsa", "401k", "roth"); everything else just gets capitalised.
const SUBTYPES: Record<string, string> = { hsa: "HSA", "401k": "401(k)", "403b": "403(b)", "457b": "457(b)", ira: "IRA", roth: "Roth IRA", "roth 401k": "Roth 401(k)", "529": "529", sep: "SEP IRA", "simple ira": "SIMPLE IRA", brokerage: "Brokerage", cd: "CD" };
// Manual accounts keep the kind picked on Add accounts as their subtype.
const MANUAL_ICON: Record<string, LucideIcon> = { vehicle: Car, property: House, crypto: Bitcoin, cash: Banknote, other: Gem };
// Plaid's cash position inside a brokerage ("CUR:USD U S Dollar").
const isCash = (h: Holding) => h.type === "cash" || /^(CASH|CUR:)/.test(h.ticker ?? "");
// What a connection holds, so two from the same bank read apart: "Cash, credit cards and loans".
const holds = (accounts: Account[]) => {
  const ls = GROUPS.filter((g) => accounts.some((a) => a.type === g.type)).map((g, i) => (i ? g.label.toLowerCase() : g.label));
  return ls.length > 1 ? `${ls.slice(0, -1).join(", ")} and ${ls.at(-1)}` : ls[0] ?? "";
};
const subtypeLabel = (s: string) => SUBTYPES[s] ?? s.charAt(0).toUpperCase() + s.slice(1);

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

export default async function Accounts() {
  const { supabase, user } = await getUser();
  // Manual accounts (from "Add transaction") have no Plaid item; balance (migration 0014) is the starting balance less what went out.
  const [{ data }, { data: manual }] = await Promise.all([
    supabase
      .from("plaid_items")
      .select("id, institution_name, institution_logo, institution_color, last_synced_at, status, error, provider, accounts(id, name, official_name, custom_name, mask, type, subtype, current_balance, currency, home:home_balance, included, holdings(id, name, ticker, type, quantity, value, cost_basis))")
      .order("created_at"),
    supabase.from("accounts").select("id, name, custom_name, mask, type, subtype, current_balance:balance, currency, home:home_balance, included").eq("manual", true).eq("user_id", user!.id),
  ]);
  const items = (data ?? []) as unknown as Item[];
  // How far back each bank's transactions go, so a short history doesn't read as a strange month.
  const since = new Map(await Promise.all(items.map(async (i) => {
    const ids = i.accounts.map((a) => a.id);
    const { data: first } = ids.length ? await supabase.from("transactions").select("date").in("account_id", ids).order("date").limit(1) : { data: [] };
    return [i.id, (first?.[0]?.date as string | undefined) ?? null] as const;
  })));
  const manualItem = { id: "manual", institution_name: "Added by you", institution_logo: null, institution_color: null, last_synced_at: null, accounts: [] };
  const all = [
    ...items.flatMap((i) => i.accounts.map((a) => ({ ...a, item: i }))),
    ...((manual ?? []) as unknown as Account[]).map((a) => ({ ...a, holdings: [], item: manualItem })),
  ];
  const sum = (debt: boolean) =>
    all.filter((a) => a.included && GROUPS.find((g) => g.type === a.type)?.debt === debt).reduce((s, a) => s + Number(a.home ?? 0), 0);
  const assets = sum(false);
  const debts = sum(true);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex gap-2 items-start flex-wrap">
        <Link href="/accounts/add" className="btn-primary">Add account</Link>
        {!!items.length && <SyncButton />}
      </div>

      {!!all.length && (
        <section className="card grid grid-cols-1 @md:grid-cols-3 divide-y @md:divide-y-0 @md:divide-x divide-line">
          {[
            ["Assets", assets, ""],
            ["Debts", debts, "text-bad"],
            ["Net worth", assets - debts, ""],
          ].map(([label, v, cls]) => (
            <div key={label as string} className="px-6 py-4 @md:py-6">
              <div className="section-label">{label}</div>
              <div className={`text-2xl font-semibold tracking-[-0.02em] tabular mt-1 ${cls}`}>{money0(v as number)}</div>
            </div>
          ))}
        </section>
      )}

      {GROUPS.map(({ type, label, icon: Icon, debt }) => {
        const rows = all.filter((a) => a.type === type);
        if (!rows.length) return null;
        const total = rows.filter((a) => a.included).reduce((s, a) => s + Number(a.home ?? 0), 0);
        return (
          <div key={type} className="space-y-3">
            <div className="flex justify-between px-1">
              <span className="section-label">{label}</span>
              <span className={`text-sm tabular font-medium ${debt ? "text-bad" : ""}`}>{money(total)}</span>
            </div>
            <section className="card overflow-hidden">
              {rows.map((a) => (
                <div key={a.id} className={`border-b border-line last:border-0 ${a.included ? "" : "opacity-50"}`}>
                <div className="row-hover flex items-center gap-4 px-6 py-4">
                  {(() => {
                    const card = a.type === "credit" ? ownedCards([a])[0] : undefined;
                    if (card) return <CardArt card={card} w="w-14" />;
                    const RowIcon = (a.item.id === "manual" && a.subtype && MANUAL_ICON[a.subtype]) || Icon;
                    return <span className="size-9 rounded-full bg-canvas grid place-items-center shrink-0"><RowIcon size={17} strokeWidth={1.6} aria-hidden /></span>;
                  })()}
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{a.custom_name || a.name} <span className="text-muted">{a.mask ? `··${a.mask}` : ""}</span></div>
                    <div className="text-xs text-muted">{a.item.institution_name}{a.subtype ? ` · ${subtypeLabel(a.subtype)}` : ""}</div>
                  </div>
                  <span className="tabular font-medium">{money(a.current_balance, a.currency)}</span>
                  <AccountToggle id={a.id} included={a.included} name={a.custom_name || a.name} />
                </div>
                {!!a.holdings?.length && (
                  <ul className="pl-6 @md:pl-[4.75rem] pr-6 pb-3 space-y-2.5">
                    {[...a.holdings].sort((x, y) => Number(y.value ?? 0) - Number(x.value ?? 0)).map((h) => {
                      const cash = isCash(h);
                      const gain = !cash && h.cost_basis != null && h.value != null ? Number(h.value) - Number(h.cost_basis) : null;
                      return (
                        <li key={h.id} className="text-sm">
                          <div className="flex items-baseline gap-3">
                            <span className="w-14 shrink-0 text-xs font-medium tabular text-muted truncate">{cash ? "" : h.ticker ?? ""}</span>
                            <span className="flex-1 min-w-0 truncate">{cash ? "Cash" : h.name}</span>
                            <span className="shrink-0 text-right tabular">{money(h.value, a.currency)}</span>
                          </div>
                          {!cash && (
                            <div className="pl-[4.25rem] flex flex-wrap gap-x-3 text-xs text-muted tabular">
                              {gain != null && <span className={gain < 0 ? "text-bad" : ""}>{gain < 0 ? "down " : "up "}{money0(Math.abs(gain), a.currency)}</span>}
                              <HoldingFee ticker={h.ticker} type={h.type} value={h.value} />
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                </div>
              ))}
            </section>
          </div>
        );
      })}

      {!!items.length && (
        <div className="space-y-3">
          <div className="section-label px-1">Connections</div>
          <section className="card overflow-hidden">
            {items.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center gap-4 px-6 py-4 border-b border-line last:border-0">
                <Merchant name={item.institution_name ?? "Bank"} logo={item.institution_logo} color={item.institution_color} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {item.institution_name ?? "Bank"}
                    {item.status && item.status !== "ok" && <span className="text-xs font-medium text-bad border border-bad rounded-full px-2 py-0.5">Needs attention</span>}
                  </div>
                  <div className="text-xs text-muted">
                    {item.status && item.status !== "ok"
                      ? item.status === "ITEM_LOGIN_REQUIRED" ? "Sign in to your bank again to keep syncing." : (item.error ?? "This connection stopped syncing.")
                      : `${holds(item.accounts) ? `${holds(item.accounts)} · ` : ""}${plural(item.accounts.length, "account")}${since.get(item.id) ? ` · history from ${new Date(`${since.get(item.id)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}` : ""} · synced ${item.last_synced_at ? ago(item.last_synced_at) : "never"}`}
                  </div>
                </div>
                <ConnectionActions itemId={item.id} broken={item.provider === "plaid" && !!item.status && item.status !== "ok"} name={item.institution_name ?? "this bank"} />
              </div>
            ))}
          </section>
        </div>
      )}

      {!all.length && (
        <section className="card p-10 text-center space-y-2">
          <div className="card-title">No accounts yet</div>
          <p className="text-sm text-muted">Link a bank to see balances, transactions and recurring charges, and a brokerage, 401(k) or HSA to see what you hold.</p>
        </section>
      )}
    </div>
  );
}
