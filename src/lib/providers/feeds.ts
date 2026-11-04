// Bank connections through a hosted consent page: the user approves at the vendor or their bank, then broke reads accounts
// and settled transactions. Pure mapping plus fetch, no "@/" imports, so feeds.test.ts runs with plain node.
// Built from the vendors' public docs on 2026-11-02 and tested against stand-ins, not their live APIs: check field names
// against one real sandbox response before trusting a new connector.
//   Enable Banking: https://enablebanking.com/docs/api/reference/
//   Basiq: https://api.basiq.io/reference/gettransactions.md
//   Belvo: https://developers.belvo.com/products/aggregation_brazil/aggregation-brazil-integration-widget
import { createPrivateKey, createSign, randomBytes } from "node:crypto";

export type FeedId = "enablebanking" | "basiq" | "belvo";
export type FeedAccount = { plaid_account_id: string; name: string; official_name: string | null; mask: string | null; type: string; subtype: string; current_balance: number | null; available_balance: number | null; credit_limit: number | null; currency: string | null };
// amount: broke's sign, positive = money out. account_ref: the plaid_account_id it belongs to.
export type FeedTxn = { plaid_transaction_id: string; account_ref: string; date: string; amount: number; name: string; merchant_name: string | null; logo_url: string | null; pending: boolean; plaid_category: string | null };
export type Env = Record<string, string | undefined>;
type Fetch = typeof fetch;

const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const owed = (type: string, n: number | null) => (n != null && (type === "credit" || type === "loan") ? Math.abs(n) : n);
const last4 = (s?: string | null) => (s ? s.replace(/\W/g, "").slice(-4) || null : null);

async function call<T>(f: Fetch, label: string, url: string, init?: RequestInit): Promise<T> {
  const res = await f(url, { ...init, signal: AbortSignal.timeout(30000) });
  const text = await res.text();
  if (!res.ok) throw Object.assign(new Error(`${label} said ${res.status}: ${text.slice(0, 200)}`), { code: `${label.toUpperCase().replace(/\W/g, "")}_${res.status}`, status: res.status });
  return (text ? JSON.parse(text) : {}) as T;
}

// ---- Enable Banking (UK and Europe) ----
// A pasted key loses its line breaks in a one-line box: rebuild the PEM from whatever came in.
export function pemFrom(raw: string) {
  const body = raw.replace(/\\n/g, "\n").replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return `-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g)?.join("\n") ?? ""}\n-----END PRIVATE KEY-----\n`;
}
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
export function ebJwt(env: Env, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const head = `${b64({ typ: "JWT", alg: "RS256", kid: env.ENABLE_BANKING_APP_ID })}.${b64({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat, exp: iat + 3600 })}`;
  return `${head}.${createSign("RSA-SHA256").update(head).sign(createPrivateKey(pemFrom(env.ENABLE_BANKING_PRIVATE_KEY ?? ""))).toString("base64url")}`;
}
const ebBase = (env: Env) => env.ENABLE_BANKING_BASE || "https://api.enablebanking.com";
const eb = <T>(env: Env, path: string, init: RequestInit = {}, f: Fetch = fetch) =>
  call<T>(f, "Enable Banking", `${ebBase(env)}${path}`, { ...init, headers: { Authorization: `Bearer ${ebJwt(env)}`, "content-type": "application/json" } });

type Aspsp = { name: string; country: string; maximum_consent_validity?: number };
export const ebBanks = async (env: Env, country: string, f?: Fetch) => (await eb<{ aspsps: Aspsp[] }>(env, `/aspsps?country=${encodeURIComponent(country)}`, {}, f)).aspsps.map((a) => ({ name: a.name, maxSeconds: a.maximum_consent_validity ?? null }));

const DEFAULT_CONSENT_S = 90 * 864e2;
export async function ebStart(env: Env, o: { bank: string; country: string; state: string; redirect: string }, f?: Fetch, now = Date.now()) {
  const max = (await ebBanks(env, o.country, f)).find((b) => b.name === o.bank)?.maxSeconds ?? DEFAULT_CONSENT_S;
  const r = await eb<{ url: string }>(env, "/auth", {
    method: "POST",
    body: JSON.stringify({ access: { valid_until: new Date(now + max * 1000).toISOString() }, aspsp: { name: o.bank, country: o.country }, state: o.state, redirect_url: o.redirect, psu_type: "personal" }),
  }, f);
  return r.url;
}
type EbAccount = { uid: string; name?: string; product?: string; details?: string; cash_account_type?: string; currency?: string; account_id?: { iban?: string; other?: { identification?: string } } };
export async function ebFinish(env: Env, code: string, f?: Fetch) {
  const s = await eb<{ session_id: string; accounts: EbAccount[]; aspsp?: { name?: string } }>(env, "/sessions", { method: "POST", body: JSON.stringify({ code }) }, f);
  return { ref: s.session_id, institution: s.aspsp?.name ?? "Bank", token: JSON.stringify({ session_id: s.session_id, accounts: s.accounts }) };
}
const EB_TYPES: Record<string, [string, string]> = { CACC: ["depository", "checking"], CASH: ["depository", "checking"], SVGS: ["depository", "savings"], CARD: ["credit", "credit card"], LOAN: ["loan", "loan"] };
type EbBalance = { balance_amount?: { amount?: string | number; currency?: string }; balance_type?: string };
// Booked balances first: the closing or interim figure on the account, then whatever the bank sends.
const ebBalance = (bs: EbBalance[]) => ["CLBD", "ITBD", "XPCD", "ITAV", "CLAV"].map((t) => bs.find((b) => b.balance_type === t)).find(Boolean) ?? bs[0];
export function ebAccount(a: EbAccount, bs: EbBalance[], bank: string): FeedAccount {
  const [type, subtype] = EB_TYPES[a.cash_account_type ?? ""] ?? ["other", (a.cash_account_type ?? "other").toLowerCase()];
  const b = ebBalance(bs);
  return {
    plaid_account_id: `enablebanking:${a.uid}`, name: a.product || a.details || a.name || bank, official_name: bank,
    mask: last4(a.account_id?.iban ?? a.account_id?.other?.identification), type, subtype,
    current_balance: owed(type, num(b?.balance_amount?.amount)), available_balance: null, credit_limit: null, currency: b?.balance_amount?.currency ?? a.currency ?? null,
  };
}
export type EbTxn = {
  transaction_id?: string | null; entry_reference?: string | null; booking_date?: string | null; value_date?: string | null; transaction_date?: string | null;
  transaction_amount?: { amount?: string | number }; credit_debit_indicator?: string; status?: string; remittance_information?: string[] | string | null; note?: string | null;
  creditor?: { name?: string | null } | null; debtor?: { name?: string | null } | null; bank_transaction_code?: { code?: string } | null;
};
/** Settled rows only: pending ones get new ids when they book, which would double them up. Direction comes from the indicator. */
export function ebTxn(t: EbTxn, uid: string): FeedTxn | null {
  const date = t.booking_date ?? t.value_date ?? t.transaction_date;
  const n = num(t.transaction_amount?.amount);
  if (t.status !== "BOOK" || !date || n == null || !t.credit_debit_indicator) return null;
  const out = t.credit_debit_indicator === "DBIT";
  const text = (Array.isArray(t.remittance_information) ? t.remittance_information.join(" ") : t.remittance_information) || t.note || "";
  const other = (out ? t.creditor?.name : t.debtor?.name) ?? null;
  const id = t.transaction_id || t.entry_reference || `${date}|${n}|${text}`; // no id from the bank: same day, amount and text is the same row
  return { plaid_transaction_id: `enablebanking:${uid}:${id}`, account_ref: `enablebanking:${uid}`, date: date.slice(0, 10), amount: out ? Math.abs(n) : -Math.abs(n), name: text || other || "Transaction", merchant_name: other, logo_url: null, pending: false, plaid_category: t.bank_transaction_code?.code ?? null };
}
async function ebFeed(env: Env, token: string, since: string, f?: Fetch) {
  const s = JSON.parse(token) as { accounts: EbAccount[]; institution?: string };
  const accounts: FeedAccount[] = [], txns: FeedTxn[] = [];
  for (const a of s.accounts) {
    const { balances } = await eb<{ balances: EbBalance[] }>(env, `/accounts/${a.uid}/balances`, {}, f);
    accounts.push(ebAccount(a, balances ?? [], s.institution ?? "Bank"));
    for (let key: string | null = null, first = true; first || key; first = false) {
      const q = new URLSearchParams({ date_from: since.slice(0, 10), ...(key ? { continuation_key: key } : {}) });
      const page: { transactions?: EbTxn[]; continuation_key?: string | null } = await eb(env, `/accounts/${a.uid}/transactions?${q}`, {}, f);
      for (const t of page.transactions ?? []) {
        const row = ebTxn(t, a.uid);
        if (row) txns.push(row);
      }
      key = page.continuation_key ?? null;
    }
  }
  return { accounts, txns };
}

// ---- Basiq (Australia) ----
const basiqBase = (env: Env) => env.BASIQ_BASE || "https://au-api.basiq.io";
async function basiqToken(env: Env, body: string, f: Fetch = fetch) {
  const r = await call<{ access_token: string }>(f, "Basiq", `${basiqBase(env)}/token`, { method: "POST", headers: { Authorization: `Basic ${env.BASIQ_API_KEY}`, "basiq-version": "3.0", "content-type": "application/x-www-form-urlencoded" }, body });
  return r.access_token;
}
const basiq = async <T>(env: Env, path: string, init: RequestInit = {}, f: Fetch = fetch) =>
  call<T>(f, "Basiq", path.startsWith("http") ? path : `${basiqBase(env)}${path}`, { ...init, headers: { Authorization: `Bearer ${await basiqToken(env, "scope=SERVER_ACCESS", f)}`, "basiq-version": "3.0", "content-type": "application/json", accept: "application/json" } });
/** A Basiq user for this person (reused when they have one), and the hosted consent page. The return address is set in Basiq's dashboard. */
export async function basiqStart(env: Env, o: { email: string; state: string; userId?: string | null }, f?: Fetch) {
  const userId = o.userId || (await basiq<{ id: string }>(env, "/users", { method: "POST", body: JSON.stringify({ email: o.email }) }, f)).id;
  const client = await basiqToken(env, `scope=CLIENT_ACCESS&userId=${encodeURIComponent(userId)}`, f);
  const consent = env.BASIQ_CONSENT_URL || "https://consent.basiq.io/home";
  return { userId, url: `${consent}?${new URLSearchParams({ token: client, state: o.state })}` };
}
type BasiqAccount = { id: string; name?: string; displayName?: string; class?: { type?: string; product?: string }; balance?: string | null; availableFunds?: string | null; currency?: string; maskedNumber?: string; accountNo?: string; institution?: string };
export function basiqAccount(a: BasiqAccount): FeedAccount {
  const k = (a.class?.type ?? "").toLowerCase();
  const [type, subtype] = /credit/.test(k) ? ["credit", "credit card"] : /loan|mortgage/.test(k) ? ["loan", k] : /saving|term/.test(k) ? ["depository", "savings"] : /invest/.test(k) ? ["investment", "brokerage"] : /transaction/.test(k) ? ["depository", "checking"] : ["other", k || "other"];
  return { plaid_account_id: `basiq:${a.id}`, name: a.displayName || a.name || "Account", official_name: a.class?.product ?? null, mask: last4(a.maskedNumber ?? a.accountNo), type, subtype, current_balance: owed(type, num(a.balance)), available_balance: num(a.availableFunds), credit_limit: null, currency: a.currency ?? null };
}
export type BasiqTxn = { id: string; account?: string; postDate?: string | null; transactionDate?: string | null; amount?: string | number; description?: string; status?: string; enrich?: { cleanDescription?: string; merchant?: { businessName?: string } | null } | null; class?: string; subClass?: { title?: string } | null };
/** Basiq: money out is negative. Ours: positive. Posted rows only. */
export function basiqTxn(t: BasiqTxn): FeedTxn | null {
  const n = num(t.amount), date = t.postDate ?? t.transactionDate;
  if (t.status !== "posted" || n == null || !date || !t.account) return null;
  return { plaid_transaction_id: `basiq:${t.id}`, account_ref: `basiq:${t.account}`, date: date.slice(0, 10), amount: -n, name: t.enrich?.cleanDescription || t.description || "Transaction", merchant_name: t.enrich?.merchant?.businessName ?? null, logo_url: null, pending: false, plaid_category: t.subClass?.title ?? t.class ?? null };
}
async function basiqFeed(env: Env, token: string, since: string, f?: Fetch) {
  const { userId } = JSON.parse(token) as { userId: string };
  const accts = await basiq<{ data: BasiqAccount[] }>(env, `/users/${userId}/accounts`, {}, f);
  const txns: FeedTxn[] = [];
  let next: string | null = `/users/${userId}/transactions?limit=500`;
  // Newest first, so stop paging once a whole page is older than the window.
  while (next) {
    const page: { data: BasiqTxn[]; links?: { next?: string | null } } = await basiq(env, next, {}, f);
    const rows = page.data.map(basiqTxn).filter((t): t is FeedTxn => !!t);
    txns.push(...rows.filter((t) => t.date >= since.slice(0, 10)));
    next = page.data.length && rows.some((t) => t.date >= since.slice(0, 10)) ? page.links?.next ?? null : null;
  }
  return { accounts: accts.data.map(basiqAccount), txns };
}

// ---- Belvo (Brazil, Open Finance) ----
const belvoBase = (env: Env) => env.BELVO_BASE || (env.BELVO_ENV === "production" ? "https://api.belvo.com" : "https://sandbox.belvo.com");
const belvo = <T>(env: Env, path: string, init: RequestInit = {}, f: Fetch = fetch) =>
  call<T>(f, "Belvo", path.startsWith("http") ? path : `${belvoBase(env)}${path}`, { ...init, headers: { Authorization: `Basic ${Buffer.from(`${env.BELVO_SECRET_ID}:${env.BELVO_SECRET_PASSWORD}`).toString("base64")}`, "content-type": "application/json" } });
/** Brazilian Open Finance needs the person's CPF and full name before the consent page. They go to Belvo only, never stored by broke. */
export const validCpf = (cpf: string) => /^\d{11}$/.test(cpf.replace(/\D/g, ""));
export async function belvoStart(env: Env, o: { cpf: string; name: string; origin: string; callback: string; state: string; externalId: string }, f?: Fetch) {
  const back = (kind: string) => `${o.callback}?${new URLSearchParams({ state: o.state, kind })}`;
  const r = await belvo<{ access: string }>(env, "/api/token/", {
    method: "POST",
    body: JSON.stringify({
      id: env.BELVO_SECRET_ID, password: env.BELVO_SECRET_PASSWORD,
      scopes: "read_institutions,write_links,read_consents,write_consents,write_consent_callback,delete_consents",
      stale_in: "300d", fetch_resources: ["ACCOUNTS", "TRANSACTIONS"],
      widget: {
        purpose: "Organizar suas finanças pessoais, mostrando suas contas e transações em um só lugar.",
        openfinance_feature: "consent_link_creation",
        callback_urls: { success: back("success"), exit: back("exit"), event: back("event") },
        consent: { terms_and_conditions_url: env.BELVO_TERMS_URL, permissions: ["REGISTER", "ACCOUNTS", "CREDIT_CARDS", "CREDIT_OPERATIONS"], identification_info: [{ type: "CPF", number: o.cpf.replace(/\D/g, ""), name: o.name.trim() }] },
        branding: { company_icon: `${o.origin}/icon.svg`, company_logo: `${o.origin}/icon.svg`, company_name: "broke", company_terms_url: env.BELVO_TERMS_URL },
      },
    }),
  }, f);
  return `${env.BELVO_WIDGET_URL || "https://widget.belvo.io/"}?${new URLSearchParams({ access_token: r.access, locale: "pt", access_mode: "recurrent", external_id: o.externalId })}`;
}
type BelvoAccount = { id: string; name?: string; type?: string; subtype?: string; category?: string; balance_type?: string; balance?: { current?: number | string; available?: number | string }; currency?: string; number?: string; public_identification_value?: string; credit_data?: { credit_limit?: number | string; cards?: { identification_number?: string }[] | null } | null; institution?: { name?: string } | string };
export function belvoAccount(a: BelvoAccount): FeedAccount {
  const c = `${a.category ?? ""} ${a.type ?? ""}`.toLowerCase();
  const liability = a.balance_type === "LIABILITY";
  const [type, subtype] = /credit/.test(c) ? ["credit", "credit card"] : liability || /loan/.test(c) ? ["loan", "loan"] : /pension|invest/.test(c) ? ["investment", "brokerage"] : /saving/.test(c) ? ["depository", "savings"] : /check/.test(c) ? ["depository", "checking"] : ["depository", "checking"];
  return { plaid_account_id: `belvo:${a.id}`, name: a.name || "Conta", official_name: typeof a.institution === "object" ? a.institution?.name ?? null : a.institution ?? null, mask: last4(a.credit_data?.cards?.[0]?.identification_number ?? a.number ?? a.public_identification_value), type, subtype, current_balance: owed(type, num(a.balance?.current)), available_balance: num(a.balance?.available), credit_limit: num(a.credit_data?.credit_limit), currency: a.currency ?? null };
}
export type BelvoTxn = { id: string; account?: { id?: string } | string; value_date?: string | null; accounting_date?: string | null; transacted_at?: string | null; amount?: number | string; type?: string | null; status?: string; description?: string; category?: string | null; merchant?: { merchant_name?: string; logo?: string } | null };
/** Belvo: amount is always positive, type says which way. No type: skipped rather than guessed. PROCESSED rows only. */
export function belvoTxn(t: BelvoTxn): FeedTxn | null {
  const n = num(t.amount), date = t.value_date ?? t.accounting_date ?? t.transacted_at;
  const account = typeof t.account === "string" ? t.account : t.account?.id;
  if (n == null || !date || !account || t.status === "PENDING" || (t.type !== "INFLOW" && t.type !== "OUTFLOW")) return null;
  return { plaid_transaction_id: `belvo:${t.id}`, account_ref: `belvo:${account}`, date: date.slice(0, 10), amount: t.type === "OUTFLOW" ? Math.abs(n) : -Math.abs(n), name: t.description || t.merchant?.merchant_name || "Transação", merchant_name: t.merchant?.merchant_name ?? null, logo_url: t.merchant?.logo ?? null, pending: false, plaid_category: t.category ?? null };
}
async function belvoPages<T>(env: Env, first: string, f?: Fetch) {
  const out: T[] = [];
  for (let next: string | null = first; next; ) {
    const page: { results?: T[]; next?: string | null } = await belvo(env, next, {}, f);
    out.push(...(page.results ?? []));
    next = page.next ?? null;
  }
  return out;
}
async function belvoFeed(env: Env, token: string, since: string, f?: Fetch) {
  const { link } = JSON.parse(token) as { link: string };
  const accounts = (await belvoPages<BelvoAccount>(env, `/api/accounts/?link=${encodeURIComponent(link)}&page_size=100`, f)).map(belvoAccount);
  const txns = (await belvoPages<BelvoTxn>(env, `/api/transactions/?link=${encodeURIComponent(link)}&page_size=100`, f)).map(belvoTxn).filter((t): t is FeedTxn => !!t && t.date >= since.slice(0, 10));
  return { accounts, txns };
}

// ---- Shared ----
export const FEEDS: Record<FeedId, { label: string; envKeys: string[]; banksStep: boolean }> = {
  enablebanking: { label: "Enable Banking", envKeys: ["ENABLE_BANKING_APP_ID", "ENABLE_BANKING_PRIVATE_KEY"], banksStep: true },
  basiq: { label: "Basiq", envKeys: ["BASIQ_API_KEY"], banksStep: false },
  belvo: { label: "Belvo", envKeys: ["BELVO_SECRET_ID", "BELVO_SECRET_PASSWORD", "BELVO_TERMS_URL"], banksStep: false },
};
export const isFeed = (p?: string | null): p is FeedId => !!p && p in FEEDS;
export const newState = () => randomBytes(16).toString("base64url");

export function feedData(id: FeedId, env: Env, token: string, since: string, f?: Fetch) {
  return id === "enablebanking" ? ebFeed(env, token, since, f) : id === "basiq" ? basiqFeed(env, token, since, f) : belvoFeed(env, token, since, f);
}
