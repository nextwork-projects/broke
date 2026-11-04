import "server-only";
import type { CountryCode, InvestmentTransaction, RemovedTransaction, Transaction, TransactionStream } from "plaid";
import { categoryKey, plaid, PLAID_COUNTRIES } from "@/lib/plaid";
import { akahuTokens } from "@/lib/providers";
import { akahuAccounts, akahuTransactions, toAccount, toTxn } from "@/lib/providers/akahu";
import { feedData, isFeed, type FeedAccount, type FeedId, type FeedTxn } from "@/lib/providers/feeds";
import { applyRules, RULE_COLS, type Rule } from "@/lib/rules";
import { pairTransfers } from "@/lib/transfers";
import { createAdminClient } from "@/utils/supabase/admin";

type Item = { id: string; user_id: string; access_token: string | null; cursor: string | null; provider?: string | null };
type PlaidItem = Item & { access_token: string };
export const ITEM_COLS = "id, user_id, access_token, cursor, provider";

// One connection, whichever service it comes through. Each writes the same accounts and transactions tables.
export const syncItem = (item: Item) => (item.provider === "akahu" ? syncAkahu(item) : isFeed(item.provider) ? syncFeed(item, item.provider) : syncPlaid(item as PlaidItem));

// Pulls accounts, transactions (cursor-based), recurring streams and investment holdings for one Plaid item.
async function syncPlaid(item: PlaidItem) {
  const db = createAdminClient();

  const { data: cats } = await db.from("categories").select("id, key").is("user_id", null);
  const catId = new Map((cats ?? []).map((c) => [c.key, c.id]));
  const toCat = (pfc: Transaction["personal_finance_category"]) =>
    catId.get(categoryKey(pfc)) ?? catId.get("OTHER") ?? null;

  const { data: acct } = await plaid.accountsGet({ access_token: item.access_token });
  const { data: savedAccounts, error: acctErr } = await db
    .from("accounts")
    .upsert(
      acct.accounts.map((a) => ({
        user_id: item.user_id,
        item_id: item.id,
        plaid_account_id: a.account_id,
        name: a.name,
        official_name: a.official_name,
        mask: a.mask,
        type: a.type,
        subtype: a.subtype,
        current_balance: a.balances.current,
        available_balance: a.balances.available,
        credit_limit: a.balances.limit,
        currency: a.balances.iso_currency_code,
      })),
      { onConflict: "plaid_account_id" },
    )
    .select("id, plaid_account_id");
  if (acctErr) throw acctErr;
  const accountId = new Map((savedAccounts ?? []).map((a) => [a.plaid_account_id, a.id]));

  // An investments-only item (a brokerage or HSA) has no transactions product to sync.
  const { data: info } = await plaid.itemGet({ access_token: item.access_token });
  const products = new Set<string>([...(info.item.products ?? []), ...(info.item.billed_products ?? [])]);
  if (products.has("investments")) {
    await syncHoldings(item, accountId);
    await syncInvestmentTransactions(item, accountId);
  }
  if (!products.has("transactions")) {
    await db.from("plaid_items").update({ last_synced_at: new Date().toISOString(), status: "ok", error: null }).eq("id", item.id);
    return { added: 0, modified: 0, removed: 0 };
  }

  let cursor = item.cursor ?? undefined;
  const added: Transaction[] = [];
  const modified: Transaction[] = [];
  const removed: RemovedTransaction[] = [];
  let status = "";
  // A brand-new item returns no rows for a few seconds, even after reporting "complete".
  // Retry the first page (max ~30 s) so the first import isn't empty.
  for (let tries = 0, more = true; more; ) {
    const { data } = await plaid.transactionsSync({ access_token: item.access_token, cursor, count: 500 });
    if (!cursor && !data.added.length && tries++ < 15) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    added.push(...data.added);
    modified.push(...data.modified);
    removed.push(...data.removed);
    more = data.has_more;
    cursor = data.next_cursor;
    status = data.transactions_update_status ?? "";
  }

  const row = (t: Transaction) => ({
    user_id: item.user_id,
    account_id: accountId.get(t.account_id)!,
    plaid_transaction_id: t.transaction_id,
    date: t.date,
    amount: t.amount,
    name: t.name,
    merchant_name: t.merchant_name ?? null,
    logo_url: t.logo_url ?? null,
    pending: t.pending,
    plaid_category: t.personal_finance_category?.detailed ?? null,
    plaid_confidence: t.personal_finance_category?.confidence_level ?? null, // migration 0023
  });
  // The user's rules, newest first, applied on top of Plaid's category. Table missing before 0010: no rules.
  const { data: rules } = await db.from("rules").select(RULE_COLS).eq("user_id", item.user_id).order("created_at", { ascending: false });
  // New rows get a category; modified rows leave the user's category/name/note edits alone.
  const chunks = <T,>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / 500) }, (_, i) => xs.slice(i * 500, i * 500 + 500));
  // A posted row replaces its pending one: keep the user's edits from the pending row.
  type Edits = { category_id: string | null; custom_name: string | null; note: string | null; ignored: boolean; tax_deductible: boolean; tags: string[]; checked_at: string | null };
  const pendingIds = added.map((t) => t.pending_transaction_id).filter((id): id is string => !!id);
  const fromPending = new Map<string, Edits>();
  for (const c of chunks(pendingIds)) {
    const { data } = await db.from("transactions").select("plaid_transaction_id, category_id, custom_name, note, ignored, tax_deductible, tags, checked_at").eq("user_id", item.user_id).in("plaid_transaction_id", c);
    for (const { plaid_transaction_id, ...p } of data ?? []) fromPending.set(plaid_transaction_id, { ...p, tags: p.tags ?? [] });
  }
  const carried = added.filter((t) => t.pending_transaction_id && fromPending.has(t.pending_transaction_id));
  const fresh = added.filter((t) => !carried.includes(t));
  for (const c of chunks(carried)) {
    const { error } = await db.from("transactions").upsert(c.map((t) => ({ ...row(t), ...fromPending.get(t.pending_transaction_id!)! })), { onConflict: "plaid_transaction_id" });
    if (error) throw error;
  }
  for (const c of chunks(fresh)) {
    const { error } = await db
      .from("transactions")
      .upsert(c.map((t) => {
        // Every row sets the same columns: a batch with mixed keys would null out "ignored" (NOT NULL).
        // row(t): broke's account id and the date, for account and day rules.
        const r = applyRules((rules ?? []) as Rule[], row(t));
        return { ...row(t), category_id: r.category_id ?? toCat(t.personal_finance_category), custom_name: r.custom_name ?? null, ignored: r.ignored ?? false, tags: r.tags ?? [] };
      }), { onConflict: "plaid_transaction_id" });
    if (error) throw error;
  }
  for (const c of chunks(modified)) {
    const { error } = await db.from("transactions").upsert(c.map(row), { onConflict: "plaid_transaction_id" });
    if (error) throw error;
  }
  if (removed.length) {
    await db.from("transactions").delete().in("plaid_transaction_id", removed.map((r) => r.transaction_id));
  }

  await syncRecurring(item, accountId, toCat);
  await fileTransferPairs(item.user_id);

  await db.from("plaid_items").update({ cursor, last_synced_at: new Date().toISOString(), status: "ok", error: null }).eq("id", item.id);
  if (status !== "HISTORICAL_UPDATE_COMPLETE") syncAgainLater(item);
  else followUps.delete(item.id);
  return { added: added.length, modified: modified.length, removed: removed.length };
}

// A transfer between the user's own accounts where only one side came in as a transfer (a card payment that landed
// as "Other" on the card): the other side takes the same category, so neither shows up as spending or income.
// Only rows with no category or "Other" change; a category the user picked stays. Last 120 days.
export async function fileTransferPairs(userId: string) {
  const db = createAdminClient();
  const since = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);
  const { data } = await db.from("transactions").select("id, date, amount, category_id, category:categories(key, kind), account:accounts(id, name, mask)").eq("user_id", userId).gte("date", since);
  const rows = (data ?? []) as unknown as { id: string; date: string; amount: number; category_id: string | null; category: { key: string; kind: string } | null; account: { id: string; name: string; mask: string | null } | null }[];
  const { pairs } = pairTransfers(rows);
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const [a, b] of pairs) {
    const [x, y] = [byId.get(a)!, byId.get(b)!];
    const [from, to] = x.category?.kind === "transfer" ? [x, y] : [y, x];
    if (from.category?.kind !== "transfer" || to.category?.kind === "transfer" || (to.category && to.category.key !== "OTHER")) continue;
    await db.from("transactions").update({ category_id: from.category_id }).eq("id", to.id);
  }
}

// Plaid sends a new bank's recent weeks first and fetches up to 2 years of history in the background, which takes
// minutes to hours. Until it says the history is in, sync the item again every 10 minutes, for up to 4 hours.
// ponytail: in-process timers, lost on restart (the next Sync now picks it up); swap for Plaid's webhook once deployed.
const g = globalThis as unknown as { __brokeFollowUps?: Map<string, { tries: number; timer: ReturnType<typeof setTimeout> }> };
const followUps = (g.__brokeFollowUps ??= new Map());
function syncAgainLater(item: PlaidItem) {
  const prev = followUps.get(item.id);
  if (prev) clearTimeout(prev.timer);
  const tries = (prev?.tries ?? 0) + 1;
  if (tries > 24) return void followUps.delete(item.id);
  const timer = setTimeout(async () => {
    const { data: fresh } = await createAdminClient().from("plaid_items").select(ITEM_COLS).eq("id", item.id).maybeSingle();
    if (!fresh) return void followUps.delete(item.id); // removed meanwhile
    await syncPlaid(fresh as PlaidItem).catch((e) => console.error("[broke] follow-up sync:", item.id, e?.response?.data ?? e));
  }, 10 * 60_000);
  timer.unref?.();
  followUps.set(item.id, { tries, timer });
}

/** Item ids whose older history is still coming in from the bank. */
export const historyPending = () => [...followUps.keys()];

async function syncHoldings(item: PlaidItem, accountId: Map<string, string>) {
  const db = createAdminClient();
  let data;
  try {
    ({ data } = await plaid.investmentsHoldingsGet({ access_token: item.access_token }));
  } catch (e) {
    console.error("[broke] holdings:", e instanceof Error ? e.message : e); // PRODUCT_NOT_READY on a fresh item; next sync retries.
    return;
  }
  const security = new Map(data.securities.map((s) => [s.security_id, s]));
  const rows = data.holdings
    .filter((h) => accountId.has(h.account_id))
    .map((h) => {
      const s = security.get(h.security_id);
      return {
        user_id: item.user_id,
        account_id: accountId.get(h.account_id)!,
        security_id: h.security_id,
        name: s?.name ?? null,
        ticker: s?.ticker_symbol ?? null,
        type: s?.type ?? null,
        quantity: h.quantity,
        price: h.institution_price,
        value: h.institution_value,
        cost_basis: h.cost_basis,
        updated_at: new Date().toISOString(),
      };
    });
  // Replace, so sold positions disappear.
  await db.from("holdings").delete().in("account_id", [...accountId.values()]);
  if (rows.length) {
    const { error } = await db.from("holdings").insert(rows);
    if (error) console.error("[broke] holdings:", error.message); // table missing before migration 0006: balances still show.
  }
}

// Since Jan 1 last year: covers this tax year and last year's IRA/HSA window to April 15.
async function syncInvestmentTransactions(item: PlaidItem, accountId: Map<string, string>) {
  const db = createAdminClient();
  const end_date = new Date().toISOString().slice(0, 10);
  const start_date = `${new Date().getUTCFullYear() - 1}-01-01`;
  const txns: InvestmentTransaction[] = [];
  const security = new Map<string, string | null>();
  try {
    for (let total = Infinity; txns.length < total; ) {
      const { data } = await plaid.investmentsTransactionsGet({ access_token: item.access_token, start_date, end_date, options: { offset: txns.length, count: 500 } });
      for (const s of data.securities) security.set(s.security_id, s.ticker_symbol ?? null);
      txns.push(...data.investment_transactions);
      total = data.total_investment_transactions;
      if (!data.investment_transactions.length) break;
    }
  } catch (e) {
    console.error("[broke] investment transactions:", e instanceof Error ? e.message : e); // PRODUCT_NOT_READY on a fresh item; next sync retries.
    return;
  }
  const rows = txns
    .filter((t) => accountId.has(t.account_id))
    .map((t) => ({
      user_id: item.user_id,
      account_id: accountId.get(t.account_id)!,
      plaid_investment_transaction_id: t.investment_transaction_id,
      date: t.date,
      name: t.name,
      type: t.type,
      subtype: t.subtype,
      amount: t.amount,
      ticker: t.security_id ? security.get(t.security_id) ?? null : null,
    }));
  if (!rows.length) return;
  const { error } = await db.from("investment_transactions").upsert(rows, { onConflict: "plaid_investment_transaction_id" });
  if (error) console.error("[broke] investment transactions:", error.message); // table missing before migration 0007.
}

async function syncRecurring(
  item: PlaidItem,
  accountId: Map<string, string>,
  toCat: (pfc: Transaction["personal_finance_category"]) => string | null,
) {
  const db = createAdminClient();
  let streams: { s: TransactionStream; income: boolean }[];
  try {
    const { data } = await plaid.transactionsRecurringGet({ access_token: item.access_token });
    streams = [
      ...data.outflow_streams.map((s) => ({ s, income: false })),
      ...data.inflow_streams.map((s) => ({ s, income: true })),
    ];
  } catch {
    return; // PRODUCT_NOT_READY on a fresh item; the next sync picks it up.
  }
  if (!streams.length) return;
  await db.from("recurring").upsert(
    streams.map(({ s, income }) => ({
      user_id: item.user_id,
      plaid_stream_id: s.stream_id,
      account_id: accountId.get(s.account_id) ?? null,
      merchant_name: s.merchant_name || s.description,
      frequency: s.frequency,
      average_amount: Math.abs(s.average_amount.amount ?? 0),
      last_amount: Math.abs(s.last_amount.amount ?? 0),
      last_date: s.last_date,
      next_date: s.predicted_next_date ?? null,
      is_income: income,
      status: s.status,
      category_id: toCat(s.personal_finance_category ?? null),
    })),
    { onConflict: "plaid_stream_id" },
  );
}

export async function institutionDetails(institutionId: string, country_codes: CountryCode[] = PLAID_COUNTRIES) {
  const { data } = await plaid.institutionsGetById({
    institution_id: institutionId,
    country_codes,
    options: { include_optional_metadata: true },
  });
  const i = data.institution;
  return {
    institution_name: i.name,
    institution_logo: i.logo ? `data:image/png;base64,${i.logo}` : null,
    institution_color: i.primary_color ?? null,
  };
}

// Exchanges a Link public_token, stores the item, and runs the first sync.
export async function linkItem(userId: string, publicToken: string, countries?: CountryCode[]) {
  const { data: ex } = await plaid.itemPublicTokenExchange({ public_token: publicToken });
  const { data: itemRes } = await plaid.itemGet({ access_token: ex.access_token });
  const institutionId = itemRes.item.institution_id ?? null;
  const details = institutionId ? await institutionDetails(institutionId, countries) : null;

  const db = createAdminClient();
  const { data: item, error } = await db
    .from("plaid_items")
    .insert({ user_id: userId, plaid_item_id: ex.item_id, access_token: ex.access_token, institution_id: institutionId, ...details })
    .select(ITEM_COLS)
    .single();
  if (error) throw error;
  const synced = await syncItem(item);
  // What the "Linked ..." message counts: this connection's accounts and holdings.
  const { data: accts } = await db.from("accounts").select("id").eq("item_id", item.id);
  const ids = (accts ?? []).map((a) => a.id);
  const { count: holdings } = ids.length ? await db.from("holdings").select("id", { count: "exact", head: true }).in("account_id", ids) : { count: 0 };
  return { ...synced, institution: details?.institution_name ?? null, accounts: ids.length, holdings: holdings ?? 0 };
}

// Akahu personal app: the server's two tokens reach one Akahu login (every NZ bank connected to it), so one item per user.
export async function linkAkahu(userId: string) {
  const db = createAdminClient();
  const { data: taken } = await db.from("plaid_items").select("id").eq("provider", "akahu").neq("user_id", userId).limit(1);
  if (taken?.length) throw Object.assign(new Error("These Akahu keys are already linked to another broke login."), { code: "AKAHU_TAKEN" });
  const { data: item, error } = await db
    .from("plaid_items")
    .upsert({ user_id: userId, provider: "akahu", plaid_item_id: `akahu:${userId}`, institution_name: "Akahu", institution_logo: null }, { onConflict: "plaid_item_id" })
    .select(ITEM_COLS)
    .single();
  if (error) throw error;
  return syncAkahu(item);
}

// Akahu: accounts and settled transactions since two weeks before the last sync (late-posting rows), first time 2 years.
// ponytail: settled only. Akahu's pending rows have no stable id; add them when someone misses them.
async function syncAkahu(item: Item) {
  const tok = akahuTokens();
  if (!tok) throw Object.assign(new Error("Akahu keys are missing. Add them on the Setup page."), { code: "AKAHU_KEYS" });
  const accounts = (await akahuAccounts(tok)).map(toAccount);
  const txns = (await akahuTransactions(tok, syncSince(item))).map(toTxn).map(({ akahu_account, ...t }) => ({ ...t, account_ref: `akahu:${akahu_account}` }));
  return saveFeed(item, accounts, txns);
}

// A hosted-consent connection: the vendor's reference is in access_token.
async function syncFeed(item: Item, id: FeedId) {
  if (!item.access_token) throw Object.assign(new Error("This connection has no consent. Link the bank again."), { code: "FEED_CONSENT" });
  const { accounts, txns } = await feedData(id, process.env, item.access_token, syncSince(item));
  return saveFeed(item, accounts, txns);
}

const syncSince = (item: Item) => (item.cursor ? new Date(new Date(item.cursor).getTime() - 14 * 864e5) : new Date(Date.now() - 730 * 864e5)).toISOString();

/** One hosted-consent connection for this user. The first sync runs in the same step. */
export async function linkFeed(userId: string, id: FeedId, ref: string, institution: string, token: string) {
  const db = createAdminClient();
  const { data: item, error } = await db.from("plaid_items")
    .upsert({ user_id: userId, provider: id, plaid_item_id: `${id}:${ref}`, access_token: token, institution_name: institution, institution_logo: null }, { onConflict: "plaid_item_id" })
    .select(ITEM_COLS).single();
  if (error) throw error;
  return syncFeed(item as Item, id);
}

// Writes any provider's accounts and rows the same way: new rows get the user's rules, seen rows keep their edits.
async function saveFeed(item: Item, accounts: FeedAccount[] | ReturnType<typeof toAccount>[], feed: FeedTxn[]) {
  const db = createAdminClient();
  const { data: saved, error: acctErr } = await db
    .from("accounts")
    .upsert((accounts as FeedAccount[]).map((a) => ({ ...a, user_id: item.user_id, item_id: item.id })), { onConflict: "plaid_account_id" })
    .select("id, plaid_account_id");
  if (acctErr) throw acctErr;
  const accountId = new Map((saved ?? []).map((a) => [a.plaid_account_id, a.id]));
  const txns = feed.filter((t) => accountId.has(t.account_ref));
  const row = ({ account_ref, ...t }: FeedTxn) => ({ ...t, user_id: item.user_id, account_id: accountId.get(account_ref)! });

  const chunks = <T,>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / 500) }, (_, i) => xs.slice(i * 500, i * 500 + 500));
  const known = new Set<string>();
  for (const c of chunks(txns.map((t) => t.plaid_transaction_id))) {
    const { data } = await db.from("transactions").select("plaid_transaction_id").eq("user_id", item.user_id).in("plaid_transaction_id", c);
    for (const r of data ?? []) known.add(r.plaid_transaction_id);
  }
  const fresh = txns.filter((t) => !known.has(t.plaid_transaction_id));
  const seen = txns.filter((t) => known.has(t.plaid_transaction_id));
  const { data: rules } = await db.from("rules").select(RULE_COLS).eq("user_id", item.user_id).order("created_at", { ascending: false });
  const { data: other } = await db.from("categories").select("id").is("user_id", null).eq("key", "OTHER").maybeSingle();
  for (const c of chunks(fresh)) {
    const { error } = await db.from("transactions").insert(c.map((t) => {
      const r = applyRules((rules ?? []) as Rule[], row(t));
      // No category we can map with confidence: money out is Other, money in stays blank (counts as income).
      return { ...row(t), category_id: r.category_id ?? (t.amount > 0 ? other?.id ?? null : null), custom_name: r.custom_name ?? null, ignored: r.ignored ?? false, tags: r.tags ?? [] };
    }));
    if (error) throw error;
  }
  // Seen rows: refresh what the provider owns; the user's category, name, note and tags stay.
  for (const c of chunks(seen)) {
    const { error } = await db.from("transactions").upsert(c.map(row), { onConflict: "plaid_transaction_id" });
    if (error) throw error;
  }
  await db.from("plaid_items").update({ cursor: new Date().toISOString(), last_synced_at: new Date().toISOString(), status: "ok", error: null }).eq("id", item.id);
  return { added: fresh.length, modified: seen.length, removed: 0 };
}
