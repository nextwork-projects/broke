import Link from "next/link";
import { EmptyBank } from "@/components/EmptyBank";
import { Filters } from "@/components/Filters";
import { ImportStatement } from "@/components/ImportStatement";
import { CategoryCheck, type Checks } from "@/components/CategoryCheck";
import { AddTransaction } from "@/components/ManualTxn";
import { TxnRow } from "@/components/TxnRow";
import { pairTransfers } from "@/lib/transfers";
import { countryOf } from "@/lib/countries";
import { accountName, allTags, categories, getUser, today, TXN_SELECT, withAccountNames, type Txn } from "@/lib/data";
import { money, plural, ymd } from "@/lib/format";
import { fetchChecks } from "@/lib/unsure";

type Search = { q?: string; category?: string; account?: string; range?: string; from?: string; to?: string; tag?: string; limit?: string };
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PAGE = 50;
const MAX = 1000; // ponytail: PostgREST returns 1000 rows per request; past that the list stops growing, page with .range() offsets if anyone scrolls that far.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Transactions({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  // Hand-edited or stale links: a bad param is dropped, never sent to the database.
  const q = sp.q?.replace(/[%,()"\\]/g, " ").trim() || undefined;
  const category = UUID.test(sp.category ?? "") ? sp.category : undefined;
  const account = UUID.test(sp.account ?? "") ? sp.account : undefined;
  const tag = sp.tag && sp.tag.length <= 100 && !/[,{}"\\]/.test(sp.tag) ? sp.tag : undefined;
  const range = /^\d{1,5}$/.test(sp.range ?? "") && Number(sp.range) > 0 ? sp.range : undefined;
  const n = Number.parseInt(sp.limit ?? "", 10);
  const limit = n > 0 ? Math.min(n, MAX) : PAGE;
  const now = await today();
  // Custom dates win over the Last 30 days style presets. Either end can be left open.
  const from = DAY.test(sp.from ?? "") ? sp.from : undefined;
  const to = DAY.test(sp.to ?? "") ? sp.to : undefined;
  const since = from ?? (range && !to ? ymd(new Date(now.getTime() - Number(range) * 864e5)) : undefined);
  const { supabase, user } = await getUser();
  const country = countryOf(user?.user_metadata?.profile?.country);

  let query = supabase.from("transactions").select(TXN_SELECT, { count: "exact" }).order("date", { ascending: false }).order("id").limit(limit);
  if (q) query = query.or(`name.ilike.%${q}%,merchant_name.ilike.%${q}%,custom_name.ilike.%${q}%`);
  if (category) query = query.eq("category_id", category);
  if (account) query = query.eq("account_id", account);
  if (tag) query = query.contains("tags", [tag]);
  if (since) query = query.gte("date", since);
  if (to) query = query.lte("date", to);

  const [{ data, count, error }, cats, { data: accounts, error: acctError }, tags, totals, checks] = await Promise.all([
    query,
    categories(),
    supabase.from("accounts").select("id, name, custom_name, mask, owner_label, manual").order("name"),
    allTags(),
    // Out and in over the whole filter, not just the loaded page: own rows, no transfers, no ignored (migration 0014).
    supabase.rpc("txn_totals", { q: q ?? null, cat: category ?? null, acct: account ?? null, tag: tag ?? null, start_date: since ?? null, end_date: to ?? null }).single<{ money_out: number; money_in: number }>(),
    // "Is this right?" rows at the top, own rows from the last 90 days (lib/unsure.ts).
    fetchChecks(supabase, user!.id, ymd(now)),
  ]);
  if (error || acctError || totals.error) throw new Error((error ?? acctError ?? totals.error)!.message);
  const txns = withAccountNames((data ?? []) as unknown as Txn[]);
  const pairs = pairTransfers(txns); // a card payment shows once, on the account it left
  const out = Number(totals.data?.money_out ?? 0);
  const inn = Number(totals.data?.money_in ?? 0);
  const shared = (accounts ?? []).some((a) => a.owner_label);
  const own = (accounts ?? []).filter((a) => !a.owner_label).map((a) => ({ id: a.id, label: `${accountName(a)}${a.mask ? ` ··${a.mask}` : ""}` }));
  const ownManual = (accounts ?? []).filter((a) => !a.owner_label && a.manual).map((a) => ({ id: a.id, label: accountName(a) }));
  const more = new URLSearchParams(Object.entries({ q: sp.q, category, account, range, from, to, tag, limit: String(limit + PAGE) }).filter(([, v]) => v) as [string, string][]);

  if (!count && !q && !category && !account && !range && !from && !to && !tag)
    return (
      <EmptyBank title="No transactions yet" body="Link a bank and every purchase shows up here, cleaned up and categorised.">
        <AddTransaction accounts={own} cats={cats} allTags={tags} />
        <ImportStatement link accounts={ownManual} locale={country.locale} currency={country.currency} />
      </EmptyBank>
    );

  return (
    <div className="space-y-5">
      {checks.total > 0 && <CategoryCheck initial={checks as Checks} cats={cats} closed />}
      <Filters
        today={ymd(now)}
        categories={cats.map((c) => ({ id: c.id, label: c.label, icon: c.icon, color: c.color }))}
        accounts={(accounts ?? []).map((a) => ({ id: a.id, label: `${accountName(a)}${a.mask ? ` ··${a.mask}` : ""}${a.owner_label ? ` (${a.owner_label})` : ""}` }))}
        tags={tags}
      />

      <div className="flex flex-wrap justify-between gap-2 px-1 text-sm text-muted">
        <span>{plural(count ?? 0, "transaction")}{count && count > txns.length ? `, showing ${txns.length}` : ""}</span>
        <span className="flex items-center gap-4">
          {!!txns.length && <span className="tabular" title="Your own accounts, without transfers and hidden transactions">{shared ? "Yours: " : ""}{money(out)} out · <span className="text-good">{money(inn)} in</span></span>}
          <AddTransaction accounts={own} cats={cats} allTags={tags} />
          <ImportStatement link accounts={ownManual} locale={country.locale} currency={country.currency} />
          <Link href="/transactions/rules" className="text-ink underline underline-offset-2 hover:opacity-70">Rules</Link>
        </span>
      </div>

      <div className="card overflow-clip">
        <table className="w-full text-[15px]">
          <thead className="sticky top-0 bg-surface z-10">
            <tr className="text-left text-xs text-muted border-b border-line">
              <th className="pl-4 @2xl:pl-6 pr-2 py-4 font-medium w-16">Date</th>
              <th className="px-2 py-4 font-medium">Name</th>
              <th className="px-2 py-4 font-medium hidden @2xl:table-cell">Category</th>
              <th className="px-2 py-4 font-medium hidden @2xl:table-cell">Actions</th>
              <th className="pl-2 pr-4 @2xl:pr-6 py-4 font-medium text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {txns.filter((t) => !pairs.hidden.has(t.id)).map((t) => <TxnRow key={t.id} t={t} cats={cats} allTags={tags} to={pairs.to.get(t.id)} />)}
          </tbody>
        </table>
        {!txns.length && (
          <div className="p-10 text-center space-y-1">
            <div className="font-medium">No transactions match</div>
            <p className="text-sm text-muted">Try a different search or clear the filters.</p>
          </div>
        )}
        {!!count && count > txns.length && limit < MAX && (
          <div className="p-4 border-t border-line text-center">
            <Link href={`/transactions?${more}`} scroll={false} className="btn">Show {Math.min(PAGE, count - txns.length)} more</Link>
          </div>
        )}
      </div>
    </div>
  );
}
