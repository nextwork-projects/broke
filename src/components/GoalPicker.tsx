"use client";

import { Check, Plus, X } from "lucide-react";
import { useState } from "react";
import { useMoney } from "@/components/Money";
import { GOALS, hasTarget, type GoalPlan } from "@/lib/advice";

// A target being typed can be half filled; whoever saves keeps only whole ones (validGoalPlan).
export type DraftPlan = { goal: string; amount?: number; by?: string; saved?: number };

// Pick from the list or type your own. Goals with a target (TARGET_GOALS and anything typed) open amount, date, saved.
// The first goal picked is the main one. Onboarding and the money profile share this.
export function GoalPicker({ goals, plans, onChange, showMain }: { goals: string[]; plans: (GoalPlan | DraftPlan)[]; onChange: (goals: string[], plans: DraftPlan[]) => void; showMain?: boolean }) {
  const { money0 } = useMoney();
  const [typed, setTyped] = useState("");
  const own = goals.filter((g) => !GOALS.includes(g));
  const plan = (goal: string) => plans.find((g) => g.goal === goal);
  const setPlan = (goal: string, k: "amount" | "by" | "saved", v: string) =>
    onChange(goals, [...plans.filter((g) => g.goal !== goal), { ...plan(goal), goal, [k]: k === "by" ? v : v === "" ? undefined : Number(v) }]);
  const toggle = (g: string) => onChange(goals.includes(g) ? goals.filter((x) => x !== g) : [...goals, g], plans);
  function add() {
    const name = typed.trim().slice(0, 60);
    setTyped("");
    if (!name) return;
    const known = [...GOALS, ...own].find((g) => g.toLowerCase() === name.toLowerCase());
    if (!goals.includes(known ?? name)) onChange([...goals, known ?? name], plans);
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {[...GOALS, ...own].map((g) => {
          const on = goals.includes(g);
          return (
            <button key={g} type="button" aria-pressed={on} onClick={() => toggle(g)}
              className={`text-sm rounded-full px-3.5 py-1.5 border flex items-center gap-1.5 ${on ? "bg-ink text-on-ink border-ink" : "border-line hover:bg-canvas"}`}>
              {on && (GOALS.includes(g) ? <Check size={14} /> : <X size={14} />)}{g}{showMain && goals[0] === g && <span className="opacity-70">· main</span>}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <input value={typed} onChange={(e) => setTyped(e.target.value)} maxLength={60} aria-label="Add your own goal" placeholder="Add your own, e.g. Trip to Japan" className="select"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <button type="button" onClick={add} disabled={!typed.trim()} className="btn shrink-0 inline-flex items-center gap-1.5"><Plus size={15} /> Add</button>
      </div>
      {goals.filter(hasTarget).map((g) => {
        const t = plan(g);
        return (
          <div key={g} className="grid gap-2 grid-cols-3 pt-1">
            <span className="col-span-3 text-sm font-medium">{g}: your target (optional)</span>
            <label className="space-y-1 text-xs text-muted">Amount
              <input type="number" min={0} inputMode="numeric" value={t?.amount ?? ""} onChange={(e) => setPlan(g, "amount", e.target.value)} placeholder={money0(g === "Buy a home" || g === "Save for kids' college" ? 40000 : 5000)} className="select text-ink" />
            </label>
            <label className="space-y-1 text-xs text-muted">By
              <input type="month" value={t?.by ?? ""} min={new Date().toISOString().slice(0, 7)} onChange={(e) => setPlan(g, "by", e.target.value)} className="select text-ink" />
            </label>
            <label className="space-y-1 text-xs text-muted">Saved so far
              <input type="number" min={0} inputMode="numeric" value={t?.saved ?? ""} onChange={(e) => setPlan(g, "saved", e.target.value)} placeholder={money0(0)} className="select text-ink" />
            </label>
            {!!t?.amount !== !!t?.by && <p className="col-span-3 text-xs text-muted">Add {t?.amount ? "a date" : "an amount"} and broke works out what to put aside each month.</p>}
          </div>
        );
      })}
    </div>
  );
}
