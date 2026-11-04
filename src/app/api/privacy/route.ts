import { todayIn } from "@/lib/format";
import { userTz } from "@/lib/data";
import { makeTools } from "@/lib/llm/shared";
import { createClient } from "@/utils/supabase/server";

// "What Claude sees": the exact summary tool results for this user right now. Built here, shown only to them.
const ASK: [string, Record<string, unknown>][] = [
  ["get_profile", {}],
  ["spending_summary", {}],
  ["list_recurring", {}],
  ["list_accounts", {}],
  ["list_holdings", {}],
  ["safe_to_spend", {}],
  ["subscription_alerts", {}],
];

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const today = todayIn(await userTz());
  const from = new Date(Date.parse(today) - 62 * 864e5).toISOString().slice(0, 7);
  const tools = makeTools(supabase, user.user_metadata?.profile, user.id, "summary");
  // All at once: they share one names map (built once, in a fixed order), so placeholders match the chat's.
  const out = await Promise.all(
    ASK.map(async ([name, input]) => {
      const t = tools.find((x) => x.name === name)!;
      const args = name === "spending_summary" ? { from, to: today.slice(0, 7) } : input;
      const text = await t.run(args).catch(() => JSON.stringify({ error: "Couldn't load this one." }));
      let result: unknown = text;
      try {
        result = JSON.parse(text);
      } catch {
        /* get_profile is plain text */
      }
      return { tool: name, input: args, result };
    }),
  );
  return Response.json({ tools: out }, { headers: { "Cache-Control": "no-store" } });
}
