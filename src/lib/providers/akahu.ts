// Akahu (New Zealand open banking), personal app: one App ID Token + one User Access Token, both from
// my.akahu.nz → Developers, and they only reach the Akahu account that made them (one person; a full app for
// many users needs Akahu's approval and OAuth). Docs read 2026-10-22:
//   https://developers.akahu.nz/docs/personal-apps (headers, single user)
//   https://developers.akahu.nz/docs/accessing-account-data, /docs/the-account-model (account fields, types, signs)
//   https://developers.akahu.nz/docs/accessing-transactional-data (start exclusive, cursor.next, 100 a page, 730 days)
//   https://developers.akahu.nz/docs/reference-rate-limits (429, back off)
// Pure mapping plus fetch, no "@/" imports, so akahu.test.ts runs with plain node.

export const AKAHU_API = "https://api.akahu.io/v1";

export type AkahuAccount = {
  _id: string; name: string; status?: string; type: string; formatted_account?: string;
  connection?: { _id?: string; name?: string; logo?: string };
  balance?: { current?: number; available?: number; limit?: number; currency?: string };
};
export type AkahuTxn = {
  _id: string; _account: string; date: string; description: string; amount: number; type?: string;
  merchant?: { name?: string }; category?: { name?: string }; meta?: { logo?: string };
};
export type Tokens = { app: string; user: string };

// Akahu type -> our accounts.type / subtype. Rewards are points, not money: kept out of totals as "other".
const TYPES: Record<string, [string, string]> = {
  CHECKING: ["depository", "checking"], SAVINGS: ["depository", "savings"], TERMDEPOSIT: ["depository", "term deposit"],
  FOREIGN: ["depository", "foreign currency"], WALLET: ["depository", "wallet"], TAX: ["depository", "tax"],
  CREDITCARD: ["credit", "credit card"], LOAN: ["loan", "loan"],
  KIWISAVER: ["investment", "kiwisaver"], INVESTMENT: ["investment", "brokerage"], REWARDS: ["other", "rewards"],
};

export function toAccount(a: AkahuAccount) {
  const [type, subtype] = TYPES[a.type] ?? ["other", a.type.toLowerCase()];
  // Akahu: negative = owed on cards and loans. Ours (Plaid's): debt is a positive balance.
  const flip = type === "credit" || type === "loan" ? -1 : 1;
  const n = (v?: number) => (v == null ? null : v * flip);
  return {
    plaid_account_id: `akahu:${a._id}`,
    name: a.name,
    official_name: a.connection?.name ?? null,
    // NZ accounts read bank-branch-account-suffix (38-9000-0123456-00): the mask is the account part.
    mask: (a.formatted_account?.match(/^\d{2}-\d{4}-(\d+)-\d+$/)?.[1] ?? a.formatted_account?.replace(/\D/g, ""))?.slice(-4) || null,
    type, subtype,
    current_balance: n(a.balance?.current),
    available_balance: a.balance?.available ?? null,
    credit_limit: a.balance?.limit ?? null,
    currency: a.balance?.currency ?? null,
  };
}

// Akahu amounts are negative for money out; ours are positive.
export const toTxn = (t: AkahuTxn) => ({
  plaid_transaction_id: `akahu:${t._id}`,
  akahu_account: t._account,
  date: t.date.slice(0, 10),
  amount: -t.amount,
  name: t.description,
  merchant_name: t.merchant?.name ?? null,
  logo_url: t.meta?.logo ?? null,
  pending: false,
  plaid_category: t.category?.name ?? null,
});

export async function akahuGet<T>(tok: Tokens, path: string, f: typeof fetch = fetch): Promise<T> {
  const res = await f(`${AKAHU_API}${path}`, { headers: { Authorization: `Bearer ${tok.user}`, "X-Akahu-Id": tok.app }, signal: AbortSignal.timeout(20000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    const message = res.status === 401 || res.status === 403 ? "Akahu didn't accept the keys. Check them on the Setup page."
      : res.status === 429 ? "Akahu is busy. Sync again in a minute." : "Akahu couldn't be reached. Sync again later.";
    throw Object.assign(new Error(message), { code: `AKAHU_${res.status}` });
  }
  return body as T;
}

export const akahuAccounts = async (tok: Tokens, f?: typeof fetch) => (await akahuGet<{ items: AkahuAccount[] }>(tok, "/accounts", f)).items;

// Settled transactions after `start` (exclusive), every page.
export async function akahuTransactions(tok: Tokens, start: string, f?: typeof fetch) {
  const out: AkahuTxn[] = [];
  for (let cursor: string | null = null, first = true; first || cursor; first = false) {
    const q = new URLSearchParams({ start, ...(cursor ? { cursor } : {}) });
    const page: { items: AkahuTxn[]; cursor?: { next: string | null } } = await akahuGet(tok, `/transactions?${q}`, f);
    out.push(...page.items);
    cursor = page.cursor?.next ?? null;
  }
  return out;
}
