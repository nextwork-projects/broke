import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CHECKED } from "@/lib/cards";
import { cardMatches } from "@/lib/cards-data";
import type { Band } from "@/lib/credit";
import type { Tool } from "@/lib/llm/shared";

const tool = <S extends z.ZodObject>(t: { name: string; description: string; schema: S; run: (input: z.infer<S>) => Promise<string> }) => t as unknown as Tool;
const r0 = Math.round;

// Same ranking as the Cards page.
export function cardTools(supabase: SupabaseClient, userId: string, band?: Band | null): Tool[] {
  return [
    tool({
      name: "card_recommendations",
      description: `Credit cards ranked by estimated value on the user's last 12 months of spending (earn minus annual fee, plus first-year bonus if their usual spending reaches the minimum in time). Leaves out cards they already hold. With a credit range in the profile, cards that fit it come first (fits_credit_range); recommend only those, and say "fits your credit range", never that approval is likely. Terms checked ${CHECKED}; null means not confirmed, tell the user to check the issuer's page. Point to the Cards page to apply.`,
      schema: z.object({ filter: z.enum(["all", "no_annual_fee", "travel", "cash_back"]).optional(), limit: z.number().int().min(1).max(14).optional() }),
      run: async ({ filter = "all", limit = 5 }) => {
        const m = await cardMatches(supabase, userId, band);
        const fits = m.fits.filter((f) => filter === "all" || (filter === "no_annual_fee" ? f.card.fee === 0 : f.card.kind === (filter === "travel" ? "travel" : "cash")));
        return JSON.stringify({
          yearly_spend_by_category: Object.fromEntries(Object.entries(m.spend).map(([k, v]) => [k, r0(v)])),
          cards_held: m.owned.map((c) => `${c.issuer} ${c.name}`),
          current_cards_earn_per_year: m.ownedEarn == null ? null : r0(m.ownedEarn),
          cards: fits.slice(0, limit).map((f) => ({
            card: `${f.card.issuer} ${f.card.name}`, annual_fee: f.card.fee, first_year_fee: f.card.feeYear1 ?? f.card.fee,
            yearly_value_after_fee: r0(f.ongoing), year_one_value: r0(f.yearOne), bonus_value: f.bonus == null ? null : r0(f.bonus),
            bonus: f.card.bonus, bonus_reachable: f.bonusReachable, fits_credit_range: f.fitsCredit ?? null, notes: f.card.notes, referral_link: !!f.card.referral,
          })),
          note: `Estimates, 1 point = 1 cent. Not financial advice; approval depends on credit.${band && band !== "unsure" ? "" : " No credit range set: fits_credit_range is null; suggest adding it on the Cards page."}`,
        });
      },
    }),
  ];
}
