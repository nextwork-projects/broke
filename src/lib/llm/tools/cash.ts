import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { cashInsights } from "@/lib/cash";
import { BANK_APY, HYSA_APY, TAKE_HOME } from "@/lib/insights";
import type { Tool } from "@/lib/llm/shared";

const tool = <S extends z.ZodObject>(t: { name: string; description: string; schema: S; run: (input: z.infer<S>) => Promise<string> }) => t as unknown as Tool;
const r2 = (n: number) => Math.round(n * 100) / 100;

// Safe to spend, idle cash and the 401(k) match check, from the same math as the Dashboard and Optimize cards.
export function cashTools(supabase: SupabaseClient, profile?: Record<string, unknown>): Tool[] {
  const load = () => cashInsights(supabase, profile as { match?: string; income?: string });
  return [
    tool({
      name: "safe_to_spend",
      description: "Cash in included checking and savings minus recurring bills due before the next paycheck (or the next 14 days if no paycheck is found). Lists the bills it subtracted.",
      schema: z.object({}),
      run: async () => {
        const { safe: s } = await load();
        return JSON.stringify({ safe_to_spend: r2(s.safe), cash: r2(s.cash), next_payday: s.payday, payday_guessed: s.paydayGuessed, bills_due: r2(s.due), bills: s.bills });
      },
    }),
    tool({
      name: "idle_cash",
      description: `Cash in checking and savings above 3 months of average spending, and what it would earn per year at an assumed ${HYSA_APY * 100}% high-yield rate vs ${BANK_APY * 100}% at a typical bank.`,
      schema: z.object({}),
      run: async () => {
        const { idle, monthlySpend } = await load();
        if (!idle) return JSON.stringify({ note: "Not enough spending history." });
        return JSON.stringify({ avg_monthly_spend: r2(monthlySpend), cash: r2(idle.cash), three_months_spend: r2(idle.cushion), excess: r2(idle.excess), yearly_at_hysa: r2(idle.hysa), yearly_at_bank: r2(idle.bank), hysa_apy: HYSA_APY, bank_apy: BANK_APY, note: "Rates are assumptions, not quotes." });
      },
    }),
    tool({
      name: "match_check",
      description: "Checks the employer 401(k) match from the money profile against estimated yearly pay (from paychecks, else deposits, else the profile income range). Returns the yearly match left unclaimed at the user's contribution if synced, else at common rates. All pay figures are estimates.",
      schema: z.object({}),
      run: async () => {
        const { match: m } = await load();
        if (m.status !== "ok") return JSON.stringify({ status: m.status, note: "Ask the user to set their 401(k) match and income range on the Optimize tab under Plan." });
        return JSON.stringify({
          match_cap_pct: m.cap, estimated_gross_pay: r2(m.gross), pay_source: m.source, take_home_assumed: m.source === "profile" ? null : TAKE_HOME,
          contribution_pct: m.pct == null ? null : r2(m.pct),
          yearly_match_left: m.gaps.map((g) => ({ contribution_pct: r2(g.pct), low: r2(g.gap[0]), high: r2(g.gap[1]) })),
          note: "Estimate. Assumes a dollar-for-dollar match.",
        });
      },
    }),
  ];
}
