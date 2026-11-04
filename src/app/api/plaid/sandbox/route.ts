import { NextResponse } from "next/server";
import { linkProducts, plaid, plaidError, type LinkKind } from "@/lib/plaid";
import { linkItem } from "@/lib/sync";
import { createClient } from "@/utils/supabase/server";

const holding = (ticker: string, name: string, quantity: number, price: number, cost: number) => ({
  institution_price: price, institution_price_as_of: new Date().toISOString().slice(0, 10), cost_basis: cost, quantity, currency: "USD",
  security: { ticker_symbol: ticker, name, currency: "USD" },
});
// A cash row with negative quantity comes back as subtype "contribution". Dates are this year, so the Optimize page has room to show.
const contribution = (month: number, amount: number, ticker: string) => ({
  date: `${new Date().getFullYear()}-${String(month).padStart(2, "0")}-15`, name: "Contribution", quantity: -1, price: amount, fees: 0, type: "cash", currency: "USD",
  security: { ticker_symbol: ticker, currency: "USD" },
});
// Plaid's sandbox copies every investment transaction onto every investment account (holdings stay separate),
// so one small list goes on the first account and reads fine under each limit: $2,300 in, every account.
const CONTRIBUTIONS = [contribution(2, 1150, "VTI"), contribution(6, 1150, "VTI")];
// Plaid "user_custom": a test brokerage with a Roth IRA, a 401(k) and an HSA, each holding real-looking funds and this year's contributions.
const TEST_INVESTMENTS = {
  override_accounts: [
    { type: "investment", subtype: "roth", starting_balance: 18420, meta: { name: "Roth IRA" },
      holdings: [holding("VTI", "Vanguard Total Stock Market ETF", 42, 285.1, 9800), holding("VXUS", "Vanguard Total International Stock ETF", 95, 64.2, 5400)],
      investment_transactions: CONTRIBUTIONS },
    { type: "investment", subtype: "401k", starting_balance: 52310, meta: { name: "401(k)" },
      holdings: [holding("FXAIX", "Fidelity 500 Index Fund", 190, 205.4, 31000), holding("FXNAX", "Fidelity U.S. Bond Index Fund", 1300, 10.2, 13800)] },
    { type: "investment", subtype: "hsa", starting_balance: 6150, meta: { name: "Health Savings Account" },
      holdings: [holding("VFIAX", "Vanguard 500 Index Admiral", 8, 563.8, 3900), holding("CASH", "HSA cash", 1640, 1, 1640)] },
  ],
};

// Sandbox only: links a Plaid test institution without the Link popup.
// bank: "user_transactions_dynamic" (realistic, recurring history). investments: the custom user above.
export async function POST(request: Request) {
  if (process.env.PLAID_ENV !== "sandbox") return NextResponse.json({ error: "Sandbox only" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { kind } = (await request.json().catch(() => ({}))) as { kind?: LinkKind };

  try {
    const { data } = await plaid.sandboxPublicTokenCreate({
      institution_id: "ins_109508",
      initial_products: kind === "investments" ? linkProducts("investments").products : linkProducts("bank").products,
      options: kind === "investments"
        ? { override_username: "user_custom", override_password: JSON.stringify(TEST_INVESTMENTS) }
        : { override_username: "user_transactions_dynamic", override_password: "pass_good" },
    });
    return NextResponse.json({ ok: true, ...(await linkItem(user.id, data.public_token)) });
  } catch (e) {
    console.error("[broke] link:", plaidError(e));
    return NextResponse.json({ error: "Sandbox link failed. Try again in a moment." }, { status: 500 });
  }
}
