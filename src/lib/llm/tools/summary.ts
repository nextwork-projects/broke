import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { allRows, displayName, isIncome, isSpend, TXN_SELECT, typicalMonthly, type Txn } from "@/lib/data";
import { namesFor } from "@/lib/llm/gate";
import { fullTools, profileText, type Tool } from "@/lib/llm/shared";
import { loadStreams } from "@/lib/llm/tools/subscriptions";
import { categoryOf } from "@/lib/subscriptions";
import { accountsSummary, holdingsSummary, profileForModel, recurringSummary, roundMoney, scrubJson, searchSummary, spendSummary, unmask, type Kind, type Names, type Row } from "@/lib/privacy";

const tool = <S extends z.ZodObject>(t: { name: string; description: string; schema: S; run: (input: z.infer<S>) => Promise<string> }) => t as unknown as Tool;
const SEES = "You see a summary: rounded amounts, months not days, placeholder names (⟨M1⟩), and bank_event for interest, fees, transfers, payments and tax.";
const toRow = (t: Txn): Row => ({ date: t.date, amount: t.amount, merchant: displayName(t), category: t.category?.label ?? null, spend: isSpend(t), income: isIncome(t) });
const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
const monthEnd = (d: string) => new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 0)).toISOString().slice(0, 10);

// Tools whose results are already totals: run the full tool, then scrub (round, months, placeholders, no links or notes).
const SCRUBBED: Record<string, Kind> = {
  contribution_room: "Merchant", fund_fees: "Holding", safe_to_spend: "Subscription", idle_cash: "Merchant", match_check: "Merchant",
  card_recommendations: "Merchant", subscription_alerts: "Subscription", cancel_info: "Subscription", money_plan: "Merchant",
};

// The same tool names as the full set, returning summaries. What Claude Code, Codex and Gemini get, always.
export function summaryTools(supabase: SupabaseClient, profile: Record<string, unknown> | undefined, userId: string): Tool[] {
  let loading: Promise<Names> | null = null;
  const names = () => (loading ??= namesFor(supabase, userId));
  const currency = profile?.currency as string | undefined;
  const full = new Map(fullTools(supabase, profile, userId).map((t) => [t.name, t]));

  const own: Tool[] = [
    tool({
      name: "spending_summary",
      description: `Spending by month and category, money received, and top merchants, for whole months between two dates. ${SEES}`,
      schema: z.object({ from: z.string().describe("YYYY-MM or YYYY-MM-DD; widened to the whole month"), to: z.string().describe("YYYY-MM or YYYY-MM-DD; widened to the whole month") }),
      run: async ({ from, to }) => {
        const txns = await allRows<Txn>((a, b) => supabase.from("transactions").select(TXN_SELECT).eq("user_id", userId).gte("date", monthStart(from)).lte("date", monthEnd(to)).order("id").range(a, b));
        return JSON.stringify(spendSummary(txns.map(toRow), await names()));
      },
    }),
    tool({
      name: "search_transactions",
      description: `Totals for the transactions that match a merchant (real name or placeholder such as "⟨M1⟩"), a tag and/or months: count, total, by month, by category and by merchant. Never single transactions. ${SEES}`,
      schema: z.object({
        query: z.string().optional().describe('Merchant text or a placeholder like "⟨M1⟩"'),
        tag: z.string().optional().describe("Only transactions with this tag"),
        from: z.string().optional().describe("YYYY-MM or YYYY-MM-DD"),
        to: z.string().optional().describe("YYYY-MM or YYYY-MM-DD"),
      }),
      run: async ({ query, tag, from, to }) => {
        const n = await names();
        const rows = await allRows<Txn>((a, b) => {
          let q = supabase.from("transactions").select(TXN_SELECT).eq("user_id", userId);
          if (query) {
            const s = unmask(query, n).replace(/[%,()]/g, " ");
            q = q.or(`name.ilike.%${s}%,merchant_name.ilike.%${s}%,custom_name.ilike.%${s}%`);
          }
          if (tag) q = q.contains("tags", [tag]);
          if (from) q = q.gte("date", monthStart(from));
          if (to) q = q.lte("date", monthEnd(to));
          return q.order("id").range(a, b);
        });
        return JSON.stringify(searchSummary(rows.filter((t) => !t.ignored).map(toRow), n));
      },
    }),
    tool({
      name: "list_recurring",
      description: `Recurring charges and income: a placeholder name, what kind of charge it is ("a streaming service, about $15 a month"), frequency, rounded average and the month of the next charge. ${SEES}`,
      schema: z.object({}),
      run: async () => {
        const [{ data }, { txns }] = await Promise.all([
          supabase.from("recurring").select("merchant_name, frequency, average_amount, next_date, is_income, active").eq("user_id", userId).neq("status", "TOMBSTONED"),
          loadStreams(supabase, userId),
        ]);
        const streams = (data ?? []).map((s) => ({ ...s, average_amount: Number(s.average_amount), category: categoryOf(s, txns) }));
        return JSON.stringify(recurringSummary(streams, await names(), currency));
      },
    }),
    tool({
      name: "list_accounts",
      description: `Linked accounts as placeholders ("⟨A1⟩") with type, rounded balance, available balance and credit limit. No account names or numbers. ${SEES}`,
      schema: z.object({}),
      run: async () => {
        const { data } = await supabase.from("accounts").select("name, custom_name, type, subtype, current_balance:balance, available_balance, credit_limit, included").eq("user_id", userId);
        return JSON.stringify(accountsSummary((data ?? []).map((a) => ({ ...a, name: a.custom_name || a.name })), await names()));
      },
    }),
    tool({
      name: "list_holdings",
      description: `Investments grouped by account type and holding type: how many, rounded value and gain or loss. ${SEES}`,
      schema: z.object({}),
      run: async () => {
        const { data } = await supabase.from("holdings").select("type, value, cost_basis, account:accounts(subtype)").eq("user_id", userId);
        return JSON.stringify(holdingsSummary((data ?? []).map((h) => ({ type: h.type, value: h.value, cost_basis: h.cost_basis, account_subtype: (h.account as { subtype?: string } | null)?.subtype ?? null }))));
      },
    }),
    tool({
      name: "get_profile",
      description: "The user's money profile: country and currency, state or region, tax filing status, income range, age, work, employer retirement match, health plan, dependents, goals. Their free-text notes are left out.",
      schema: z.object({}),
      // Plus the same typical month every page shows (typicalMonthly), rounded, so the AI and the app agree on income.
      run: async () => {
        const t = await typicalMonthly(supabase, userId, new Date().toISOString().slice(0, 10)).catch(() => null);
        const typical = t ? `\nTypical month (average of recent full months): income about ${roundMoney(t.income)}, spending about ${roundMoney(t.spend)}.` : "";
        return profileText(profileForModel(profile)) + typical;
      },
    }),
  ];

  const scrubbed = Object.entries(SCRUBBED).flatMap(([name, kind]) => {
    const t = full.get(name);
    if (!t) return [];
    return [{
      ...t,
      description: `${t.description} ${SEES}`,
      run: async (input: Record<string, unknown>) => {
        const n = await names();
        const args = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, typeof v === "string" ? unmask(v, n) : v]));
        const out = JSON.parse(await t.run(args));
        if (name === "card_recommendations" && Array.isArray(out.cards_held)) {
          out.cards_held_count = out.cards_held.length;
          delete out.cards_held;
        }
        if (name === "cancel_info") out.cancel_link_known = !!out.cancel_url;
        return JSON.stringify(scrubJson(out, n, kind));
      },
    } satisfies Tool];
  });
  return [...own, ...scrubbed];
}
