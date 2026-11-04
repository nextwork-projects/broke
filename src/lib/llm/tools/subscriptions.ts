import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { allRows } from "@/lib/data";
import type { Tool } from "@/lib/llm/shared";
import { cancelPrompt, cancelUrl, categoryOf, negotiable, negotiatePrompt, subscriptionAlerts, type Charge, type Stream } from "@/lib/subscriptions";

const tool = <S extends z.ZodObject>(t: { name: string; description: string; schema: S; run: (input: z.infer<S>) => Promise<string> }) => t as unknown as Tool;

export async function loadStreams(supabase: SupabaseClient, userId: string) {
  const since = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
  const [{ data: r }, t] = await Promise.all([
    supabase.from("recurring").select("id, merchant_name, frequency, average_amount, is_income, active").eq("user_id", userId).neq("status", "TOMBSTONED"),
    allRows<Charge>((a, b) => supabase.from("transactions").select("merchant_name, name, amount, date, plaid_category").eq("user_id", userId).gt("amount", 0).gte("date", since).order("id").range(a, b)),
  ]);
  return { streams: (r ?? []) as Stream[], txns: t };
}

// Subscription tools: price hikes, overlapping services, cancel links and negotiation scripts.
export function subscriptionTools(supabase: SupabaseClient, profile: Record<string, unknown> | undefined, userId: string): Tool[] {
  const find = async (merchant: string) => {
    const { streams, txns } = await loadStreams(supabase, userId);
    const m = merchant.toLowerCase();
    const s = streams.find((x) => x.merchant_name.toLowerCase().includes(m)) ?? { merchant_name: merchant, average_amount: 0 };
    return { s, txns };
  };
  return [
    tool({
      name: "subscription_alerts",
      description: "Recurring charges whose latest charge went up versus earlier charges (price hikes), and overlapping services (two music, video or cloud storage apps, or the same merchant twice).",
      schema: z.object({}),
      run: async () => {
        const { streams, txns } = await loadStreams(supabase, userId);
        return JSON.stringify(subscriptionAlerts(streams, txns));
      },
    }),
    tool({
      name: "cancel_info",
      description: "How to cancel or lower one recurring charge: the direct cancel URL if broke knows it (null means none known; never make one up), whether it is a negotiable bill (internet, phone, insurance), and a ready prompt for writing the cancel message or negotiation script.",
      schema: z.object({ merchant: z.string().describe("Merchant name as shown in list_recurring") }),
      run: async ({ merchant }) => {
        const { s, txns } = await find(merchant);
        const kind = negotiable(s.merchant_name, categoryOf(s, txns));
        return JSON.stringify({
          merchant: s.merchant_name,
          cancel_url: cancelUrl(s.merchant_name),
          negotiable: kind,
          cancel_instructions: cancelPrompt(s),
          negotiate_instructions: kind ? negotiatePrompt(s, kind, profile?.state as string | undefined) : null,
        });
      },
    }),
  ];
}
