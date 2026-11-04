import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { countryOf } from "@/lib/countries";
import { todayIn } from "@/lib/format";
import { contributionRoom, EXPENSE_RATIO, feeCost30, INDEX_RATIO } from "@/lib/invest";
import type { Tool } from "@/lib/llm/shared";

const tool = <S extends z.ZodObject>(t: { name: string; description: string; schema: S; run: (input: z.infer<S>) => Promise<string> }) => t as unknown as Tool;

// Contribution room and fund fees. Runs as the signed-in user, so RLS limits it to their rows.
export function investmentTools(supabase: SupabaseClient, profile: Record<string, unknown> | undefined, userId: string): Tool[] {
  return [
    tool({
      name: "contribution_room",
      description: "Contributions so far this tax year against the limits for the user's country, room left and the deadline. US: HSA, 401(k)/403(b)/457(b), IRA (IRS limits, catch-up from age; linked accounts only). NZ KiwiSaver, AU super, UK ISA and pension, CA RRSP and TFSA, IN PPF and NPS, IE pension: every account type, contributed from linked accounts or what the user typed in (null = unknown). limit null = depends on earnings, see note. Other countries: empty, so say you don't have their limits.",
      schema: z.object({}),
      run: async () => {
        const c = countryOf(profile?.country as string | undefined);
        const { data } = await supabase.auth.getUser();
        return JSON.stringify({ country: c.name, currency: c.currency, rows: await contributionRoom(supabase, profile, { tax: c.tax, today: todayIn(), locale: c.locale, mine: data.user?.user_metadata?.contributed }) });
      },
    }),
    tool({
      name: "fund_fees",
      description: `Each holding's expense ratio and the extra fees over 30 years versus a ${INDEX_RATIO}% index fund, on today's value at 7% growth. expense_ratio null = fund not in our table; don't guess it.`,
      schema: z.object({}),
      run: async () => {
        const { data } = await supabase.from("holdings").select("name, ticker, type, value, account:accounts(name)").eq("user_id", userId).neq("type", "cash").order("value", { ascending: false });
        return JSON.stringify((data ?? []).map((h) => {
          const ratio = h.ticker ? EXPENSE_RATIO[h.ticker.toUpperCase()] ?? null : null;
          return { ...h, expense_ratio_pct: ratio, fees_30y_vs_index: ratio == null ? null : Math.round(feeCost30(Number(h.value ?? 0), ratio)) };
        }));
      },
    }),
  ];
}
