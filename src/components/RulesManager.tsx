"use client";

import { ChevronRight, EyeOff, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import { CategoryIcon } from "@/components/Icons";
import { useMoney } from "@/components/Money";
import { emptyRule, RuleDialog, type Draft } from "@/components/RuleForm";
import { toast } from "@/components/Toast";
import type { Category } from "@/lib/data";
import { plural } from "@/lib/format";
import { conditions, describeMatch, type Rule } from "@/lib/rules";
import { createClient } from "@/utils/supabase/client";

const pill = "inline-flex items-center gap-1.5 rounded-full bg-canvas border border-line px-3 py-1 text-xs text-muted";

export function RulesManager({ rules, counts, cats, allTags, accounts, missing }: {
  rules: Rule[]; counts: Record<string, number>; cats: Category[]; allTags: string[]; accounts: { id: string; label: string }[]; missing: boolean;
}) {
  const { money, money0 } = useMoney();
  const router = useRouter();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [resetting, setResetting] = useState(false);
  const done = (msg: string) => {
    setEditing(null);
    toast(msg);
    router.refresh();
  };

  async function resetAll() {
    const db = createClient();
    const uid = (await db.auth.getSession()).data.session?.user.id;
    const { error } = uid ? await db.from("rules").delete().eq("user_id", uid) : { error: true };
    setResetting(false);
    if (error) return toast("Couldn't reset your rules.");
    toast("All rules deleted. Past transactions keep their changes.");
    router.refresh();
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4 px-1">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">Transaction rules</h2>
          <p className="text-sm text-muted mt-1">Change categories, names and more on matching transactions automatically. New ones from your bank follow these as they arrive.</p>
        </div>
        {!missing && <button onClick={() => setEditing(emptyRule())} className="btn-primary shrink-0 inline-flex items-center gap-1.5"><Plus size={16} /> Add rule</button>}
      </div>
      {missing && <p className="text-sm text-bad px-1">Rules need a database update. Open Setup to run it.</p>}

      {!!rules.length && (
        <div className="space-y-3">
          {rules.map((r) => {
            const cat = cats.find((c) => c.id === r.category_id);
            const fmt = (n: number) => (Number.isInteger(n) ? money0(n) : money(n));
            const acct = accounts.find((a) => a.id === r.account_id)?.label;
            const conds = conditions(r, fmt, acct);
            return (
              <button key={r.id} onClick={() => setEditing({ ...r })} aria-label={`Edit rule: ${describeMatch(r, fmt, acct)}`}
                className="card-link w-full text-left flex items-center gap-4 px-5 py-4">
                <div className="flex-1 min-w-0 space-y-2">
                  <div>
                    <div className="text-[15px] leading-snug">
                      {conds.map((c, i) => (
                        <Fragment key={c.label}>
                          {i ? `, ${c.label[0].toLowerCase()}${c.label.slice(1)} ` : `${c.label} `}
                          <span className="font-semibold text-brand break-words">{c.value}</span>
                        </Fragment>
                      ))}
                    </div>
                    <div className="text-sm text-muted tabular mt-0.5">{plural(counts[r.id] ?? 0, "matching transaction")}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {cat && <span className={pill}><CategoryIcon icon={cat.icon} color={cat.color} size={16} />Change category to <span className="text-ink font-medium">{cat.label}</span></span>}
                    {r.rename && <span className={pill}>Rename to <span className="text-ink font-medium">{r.rename}</span></span>}
                    {!!r.add_tags?.length && <span className={pill}>Add {r.add_tags.length === 1 ? "tag" : "tags"} <span className="text-ink font-medium">{r.add_tags.join(", ")}</span></span>}
                    {r.ignore && <span className={pill}><EyeOff size={12} /> Hide from totals</span>}
                  </div>
                </div>
                <ChevronRight size={18} className="text-muted shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      {!rules.length && !missing && (
        <section className="card p-10 text-center space-y-1">
          <div className="font-medium">No rules yet</div>
          <p className="text-sm text-muted">Change a transaction&apos;s category and press Always, or add one here.</p>
        </section>
      )}

      {!!rules.length && (
        <div className="px-1 text-sm text-muted" aria-live="polite">
          {resetting ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Delete all {plural(rules.length, "rule")}? Past transactions keep their changes.</span>
              <button onClick={resetAll} className="font-medium text-bad hover:opacity-70">Delete all</button>
              <button onClick={() => setResetting(false)} className="hover:text-ink">Cancel</button>
            </span>
          ) : (
            <>Looking to start over? <button onClick={() => setResetting(true)} className="text-ink underline underline-offset-2 hover:opacity-70">Reset all rules.</button></>
          )}
        </div>
      )}

      {editing && <RuleDialog initial={editing} cats={cats} allTags={allTags} onClose={() => setEditing(null)} onDone={done} />}
    </>
  );
}
