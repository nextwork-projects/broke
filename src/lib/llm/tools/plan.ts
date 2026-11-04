import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Tool } from "@/lib/llm/shared";
import { loadPlan } from "@/lib/plan-facts";

const tool = <S extends z.ZodObject>(t: { name: string; description: string; schema: S; run: (input: z.infer<S>) => Promise<string> }) => t as unknown as Tool;

// The Money plan page's latest audit, so broke ai can help with a move the user is working on.
export function planTools(supabase: SupabaseClient, userId: string): Tool[] {
  return [
    tool({
      name: "money_plan",
      description: "The user's latest money plan from the Money plan page: each move (cancel, negotiate, switch insurance, better card, sign up, message someone, make more) with its yearly impact, effort, steps, drafted message, links and status (todo, doing, done, dismissed), plus the yearly total already saved. Empty when no audit has run; the user starts one on the Money plan page.",
      schema: z.object({}),
      run: async () => {
        const p = await loadPlan(supabase, userId);
        if (!p.plan) return JSON.stringify({ note: "No money plan yet. The user can run one on the Money plan page (/plan)." });
        return JSON.stringify({
          run_on: p.plan.created_at, saved_so_far_per_year: p.saved,
          moves: p.moves.map((m) => ({ kind: m.kind, title: m.title, why: m.why, yearly_impact: m.yearly_impact, effort: m.effort, steps: m.steps, message: m.message, links: m.links, confidence: m.confidence, status: m.status, done_at: m.done_at })),
        });
      },
    }),
  ];
}
