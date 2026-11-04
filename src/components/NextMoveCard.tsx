"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";
import { useAssistant } from "@/components/Assistant";
import { toast } from "@/components/Toast";
import { STEP_LABEL, type Status, type Step } from "@/lib/plan";
import { createClient } from "@/utils/supabase/client";

// id null: a code-built move not saved yet (no plan).
export type NextItem = { id: string | null; ref: string | null; title: string; line: string; gate: string | null; steps: string[]; steps_done: number[] | null; status: Status; step: number };
type Patch = Partial<Pick<NextItem, "status" | "steps_done">> & { done_at?: string | null };

export function NextMoveCard({ items, looks }: { items: NextItem[]; looks: Record<string, string> }) {
  const { ask } = useAssistant();
  const [list, setList] = useState(items);
  const [skip, setSkip] = useState(0);
  const live = list.filter((m) => m.status === "todo" || m.status === "doing");
  const m = live[skip % Math.max(1, live.length)];

  // A code-built move has no row yet: the first tick or Done saves the code-built plan (no AI), then updates its row.
  const idOf = async (x: NextItem) => {
    if (x.id) return x.id;
    const r = await fetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: true }) }).catch(() => null);
    if (!r?.ok) return null;
    const ids = new Map(((await r.json()) as { moves: { id: string; ref: string | null }[] }).moves.map((s) => [s.ref, s.id]));
    setList((l) => l.map((y) => ({ ...y, id: y.id ?? ids.get(y.ref) ?? null })));
    return ids.get(x.ref) ?? null;
  };
  // The same saving as /plan: the browser may update status, done_at and steps_done (0018, 0021).
  const save = async (x: NextItem, patch: Patch) => {
    setList((l) => l.map((y) => (y.ref === x.ref ? { ...y, ...patch } : y)));
    const id = await idOf(x);
    const { error } = id ? await createClient().from("plan_moves").update(patch).eq("id", id) : { error: true };
    if (!error) return true;
    setList((l) => l.map((y) => (y.ref === x.ref ? { ...y, status: x.status, steps_done: x.steps_done } : y)));
    toast("Couldn't save that. Try again.");
    return false;
  };
  const done = async (x: NextItem) => {
    if (await save(x, { status: "done", done_at: new Date().toISOString() })) toast(`Done: ${x.title}`, () => void save({ ...x, status: "done" }, { status: x.status, done_at: null }));
  };

  if (!m)
    return (
      <section className="card p-6 space-y-1">
        <span className="block section-label">Your next move</span>
        <span className="block text-sm text-muted">All done for now. Ask below if you want something new to work on.</span>
      </section>
    );
  const ticked = m.steps_done ?? [];
  const note = m.id ? looks[m.id] : undefined;
  const tick = (i: number) => {
    const steps_done = ticked.includes(i) ? ticked.filter((x) => x !== i) : [...ticked, i].sort();
    save(m, m.status === "todo" && steps_done.length ? { steps_done, status: "doing" } : { steps_done });
  };
  return (
    <section className="card p-6 space-y-4" aria-labelledby="next-move-title">
      <div className="flex items-baseline justify-between gap-3">
        <div className="section-label">Your next move</div>
        <div className="text-xs text-muted">Step {m.step}: {STEP_LABEL[m.step as Step]}</div>
      </div>
      <div className="space-y-1">
        <h2 id="next-move-title" className="card-title">{m.title}</h2>
        <p className="text-sm text-muted">{m.line}</p>
        {m.gate && <p className="text-sm text-muted">{m.gate}</p>}
      </div>
      {note && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-green-50 px-4 py-3 text-sm">
          <span className="flex-1 min-w-48">Looks done. {note}</span>
          <button onClick={() => done(m)} className="btn">Yes, mark done</button>
        </div>
      )}
      <ol className="space-y-2">
        {m.steps.map((s, i) => (
          <li key={i}>
            <label className="flex gap-3 items-start text-sm cursor-pointer">
              <input type="checkbox" className="mt-0.5 size-4 accent-[var(--brand)] shrink-0" checked={ticked.includes(i)} onChange={() => tick(i)} />
              <span className={ticked.includes(i) ? "line-through text-muted" : ""}><span className="tabular text-muted">{i + 1}.</span> {s}</span>
            </label>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <button onClick={() => done(m)} className="btn-primary">Done</button>
        {live.length > 1 && <button onClick={() => setSkip(skip + 1)} className="btn">Show me another</button>}
        <button onClick={() => ask(`Help me with this: ${m.title}. Use my real numbers and tell me what to do first.`)} className="btn inline-flex items-center gap-1.5 ml-auto"><Sparkles size={15} /> Help me with this</button>
      </div>
    </section>
  );
}
