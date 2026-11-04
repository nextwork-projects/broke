"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMoney } from "@/components/Money";
import { budgetChanges, type BudgetChange } from "@/lib/budget";
import { createClient } from "@/utils/supabase/client";

export type Changes = Record<string, number | null>;
export const SETUP = "setup";

// Upserts amounts and deletes nulls. Returns an error message, or "" when saved.
export async function writeBudgets(changes: Changes) {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return "Couldn't save that. Try again in a moment.";
  const now = new Date().toISOString();
  const up = Object.entries(changes).flatMap(([category_id, amount]) => (amount === null ? [] : [{ user_id: user.id, category_id, amount, updated_at: now }]));
  const del = Object.keys(changes).filter((k) => changes[k] === null);
  const res = await Promise.all([up.length ? db.from("budgets").upsert(up) : null, del.length ? db.from("budgets").delete().in("category_id", del) : null]);
  const error = res.map((r) => r?.error).find(Boolean);
  if (!error) return "";
  console.error("[broke] budgets:", error.code, error.message);
  return ["42P01", "PGRST205", "42501"].includes(error.code) ? SETUP : "Couldn't save that. Change undone.";
}

// Your own spending category, with no budget yet. Returns its id, or null if it couldn't be saved.
export async function createCategory(label: string, icon = "other") {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const key = `custom_${label.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30)}_${Date.now().toString(36)}`;
  const { data, error } = await db.from("categories").insert({ user_id: user.id, key, label, icon, color: "#6f8cf2", kind: "spend" }).select("id").single();
  if (error) console.error("[broke] new category:", error.message);
  return (data?.id as string | undefined) ?? null;
}

// The AI's ```budget block: lists what would change and saves nothing until the user presses Apply.
export function BudgetOffer({ proposed }: { proposed: Record<string, unknown> }) {
  const router = useRouter();
  const { money0 } = useMoney();
  const [changes, setChanges] = useState<BudgetChange[] | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  useEffect(() => {
    const db = createClient();
    Promise.all([db.from("categories").select("id, label").eq("kind", "spend"), db.from("budgets").select("category_id, amount")]).then(([c, b]) =>
      setChanges(budgetChanges(proposed, c.data ?? [], Object.fromEntries((b.data ?? []).map((x) => [x.category_id, Number(x.amount)])))));
  }, [proposed]);
  if (!changes?.length) return null;
  async function apply() {
    setState("saving");
    const write: Changes = {};
    for (const c of changes!) {
      const id = c.id ?? (await createCategory(c.label));
      if (!id) return setState("failed");
      write[id] = c.to;
    }
    if (await writeBudgets(write)) return setState("failed");
    setState("saved");
    router.refresh();
  }
  return (
    <div className="rounded-2xl border border-line p-3 space-y-2 text-sm">
      <ul className="space-y-1">
        {changes.map((c) => (
          <li key={c.label} className="flex justify-between gap-3">
            <span className="truncate">{c.label}{!c.id && <span className="text-muted"> · new</span>}</span>
            <span className="tabular shrink-0">{c.from !== null && <span className="text-muted">{money0(c.from)} → </span>}{c.to === null ? "removed" : money0(c.to)}</span>
          </li>
        ))}
      </ul>
      <button onClick={apply} disabled={state === "saving" || state === "saved"} className="btn !py-1 text-sm inline-flex items-center gap-1.5">
        {state === "saved" ? <><Check size={14} />Applied to your budget</> : state === "failed" ? "Couldn't save. Try again" : "Apply to my budget"}
      </button>
    </div>
  );
}
