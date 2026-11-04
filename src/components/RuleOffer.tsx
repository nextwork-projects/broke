"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { emptyRule, pastMatches, saveRule } from "@/components/RuleForm";
import { plural } from "@/lib/format";
import { validRules, type ProposedRule } from "@/lib/rules";
import { createClient } from "@/utils/supabase/client";

type Row = ProposedRule & { ids: string[]; names: string[] };
const draft = (r: ProposedRule) => emptyRule({ match: r.match, direction: r.direction, category_id: r.category_id });

// The AI's ```rules block: lists each rule and what it would change. Nothing saves until the user presses Apply.
export function RuleOffer({ proposed }: { proposed: unknown[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [changed, setChanged] = useState(0);
  useEffect(() => {
    (async () => {
      const { data } = await createClient().from("categories").select("id, label");
      const rules = validRules(proposed, data ?? []);
      setRows(await Promise.all(rules.map(async (r) => {
        const past = await pastMatches(draft(r));
        return { ...r, ids: past.map((t) => t.id), names: [...new Set(past.map((t) => t.custom_name || t.merchant_name || t.name))].slice(0, 3) };
      })));
    })().catch((e) => { console.error("[broke] rules:", e); setRows([]); });
  }, [proposed]);
  if (!rows?.length) return null;
  async function apply() {
    setState("saving");
    const db = createClient();
    let total = 0;
    for (const r of rows!) {
      const { error, updated } = await saveRule(draft(r), true);
      if (error) return setState("failed");
      total += updated;
      // Answered, so they leave the "to check" list.
      for (let i = 0; i < r.ids.length; i += 200) await db.from("transactions").update({ checked_at: new Date().toISOString() }).in("id", r.ids.slice(i, i + 200));
    }
    setChanged(total);
    setState("saved");
    router.refresh();
  }
  return (
    <div className="rounded-2xl border border-line p-3 space-y-3 text-sm">
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={`${r.match}-${r.direction}`}>
            <div>Name contains <span className="font-medium">&quot;{r.match}&quot;</span>{r.direction && <>, money {r.direction === "in" ? "coming in" : "going out"}</>} → <span className="font-medium">{r.category}</span></div>
            <div className="text-xs text-muted">{r.ids.length ? `${plural(r.ids.length, "transaction")}: ${r.names.join(", ")}${r.ids.length > r.names.length ? "..." : ""}` : "Nothing yet. It applies to new transactions."}</div>
          </li>
        ))}
      </ul>
      <button onClick={apply} disabled={state === "saving" || state === "saved"} className="btn !py-1 text-sm inline-flex items-center gap-1.5">
        {state === "saved" ? <><Check size={14} />Saved. {plural(changed, "transaction")} changed</> : state === "saving" ? "Saving..." : state === "failed" ? "Couldn't save. Try again" : rows.length > 1 ? `Apply ${rows.length} rules` : "Apply this rule"}
      </button>
      <p className="text-xs text-muted">New transactions follow these too. You can edit or remove rules in Settings.</p>
    </div>
  );
}
