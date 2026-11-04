import Link from "next/link";
import { NextMoveCard, type NextItem } from "@/components/NextMoveCard";
import { money0 } from "@/lib/format";
import { deterministicMoves, stepOf, whyLine, type Kind } from "@/lib/plan";
import { myPlan, myPlanFacts } from "@/lib/plan-facts";

// The one move to make now: the first open move by the plan's ladder (the order /plan shows). With no plan yet,
// the code-built moves, so a linked user always has one. Streams in: no plan means the full facts load first.
export async function NextMove() {
  const state = await myPlan();
  const items: NextItem[] = state.plan && !state.stale
    ? (state.moves as (Omit<NextItem, "line" | "step"> & { why: string; kind: Kind; step: number | null })[])
        .filter((m) => m.status === "todo" || m.status === "doing")
        .map((m) => ({ ...m, step: stepOf(m), line: whyLine(m.title, m.why) }))
        .sort((a, b) => a.step - b.step)
    : deterministicMoves(await myPlanFacts(), money0).map((m) => ({
        id: null, ref: m.ref, title: m.title, line: whyLine(m.title, m.why), gate: m.gate, steps: m.steps, steps_done: [], status: "todo", step: m.step,
      }));
  if (!items.length)
    return (
      <Link href="/plan" className="card-link p-6 block space-y-1">
        <span className="block section-label">Your next move</span>
        <span className="block text-sm text-muted">Nothing left in your plan. Run the audit again after your next statement.</span>
      </Link>
    );
  return <NextMoveCard items={items} looks={state.looksWhy} />;
}
