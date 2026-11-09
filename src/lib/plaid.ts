import "server-only";
import { Configuration, CountryCode, PlaidApi, PlaidEnvironments, Products } from "plaid";

// Rebuilt whenever PLAID_ENV / PLAID_CLIENT_ID / PLAID_SECRET change, so a mode or key saved in Settings
// (POST /api/setup/env sets process.env) takes effect without restarting broke.
let cached: { key: string; api: PlaidApi } | null = null;
function client() {
  const { PLAID_ENV = "sandbox", PLAID_CLIENT_ID = "", PLAID_SECRET = "" } = process.env;
  const key = `${PLAID_ENV}|${PLAID_CLIENT_ID}|${PLAID_SECRET}`;
  if (cached?.key !== key)
    cached = { key, api: new PlaidApi(new Configuration({ basePath: PlaidEnvironments[PLAID_ENV], baseOptions: { headers: { "PLAID-CLIENT-ID": PLAID_CLIENT_ID, "PLAID-SECRET": PLAID_SECRET } } })) };
  return cached.api;
}
export const plaid = new Proxy({} as PlaidApi, {
  get: (_, prop) => {
    const api = client();
    const v = Reflect.get(api, prop);
    return typeof v === "function" ? v.bind(api) : v;
  },
});

export const PLAID_PRODUCTS = (process.env.PLAID_PRODUCTS ?? "transactions").split(",") as Products[];
// "bank" links checking/cards (investments too when the bank has them); "investments" leads with brokerages, IRAs, 401(k)s and HSAs.
export type LinkKind = "bank" | "investments";
export const linkProducts = (kind: LinkKind) =>
  kind === "investments"
    ? { products: [Products.Investments], optional_products: [Products.Transactions] }
    : { products: PLAID_PRODUCTS, optional_products: PLAID_PRODUCTS.includes(Products.Investments) ? [] : [Products.Investments] };
export const PLAID_COUNTRIES = (process.env.PLAID_COUNTRY_CODES ?? "US").split(",") as CountryCode[];

// Plaid personal_finance_category -> our built-in category key.
export function categoryKey(pfc?: { primary: string; detailed: string } | null): string {
  if (!pfc) return "OTHER";
  if (pfc.detailed === "FOOD_AND_DRINK_GROCERIES") return "GROCERIES";
  if (pfc.detailed === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT") return "CREDIT_CARD_PAYMENT";
  return pfc.primary;
}

/** Plaid's error_code and message from a failed call (axios error), else a generic one. */
export function plaidError(e: unknown): { code: string; message: string } {
  const d = (e as { response?: { data?: { error_code?: string; display_message?: string | null; error_message?: string } } })?.response?.data;
  if (d?.error_code) return { code: d.error_code, message: d.display_message || d.error_message || d.error_code };
  const code = (e as { code?: unknown })?.code; // other providers (src/lib/providers) throw { code: "AKAHU_401", message }
  if (typeof code === "string" && code.startsWith("AKAHU_") && e instanceof Error) return { code, message: e.message };
  return { code: "ERROR", message: e instanceof Error ? e.message : "Plaid request failed" };
}

/** Revokes a bank connection at Plaid. Akahu tokens belong to the server owner, and a test connection can't be revoked
 * from live mode (Plaid's sandbox forgets it anyway), so those are only forgotten. Already gone at Plaid counts as done. */
export async function revokeItem(item: { access_token: string | null; provider: string | null }) {
  const testInLive = item.access_token?.startsWith("access-sandbox-") && process.env.PLAID_ENV !== "sandbox";
  const demo = item.access_token?.startsWith("access-sandbox-demo-"); // the made-up bank: nothing at Plaid
  if (item.provider !== "plaid" || testInLive || demo || !item.access_token) return { ok: true as const };
  try {
    await plaid.itemRemove({ access_token: item.access_token });
    return { ok: true as const };
  } catch (e) {
    const err = plaidError(e);
    if (err.code === "ITEM_NOT_FOUND" || err.code === "INVALID_ACCESS_TOKEN") return { ok: true as const };
    console.error("[broke] item remove:", err);
    return { ok: false as const };
  }
}
