"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMoney } from "@/components/Money";
import { emptyRule, saveRule } from "@/components/RuleForm";
import type { PayGuess } from "@/lib/pay";
import { createClient, updateMeta } from "@/utils/supabase/client";

// "Is this your pay?": regular money coming in that the bank filed as something else. Yes saves a rule that files it
// (and every past one) as Income, so the plan, budgets and leftover money count it. No never asks about that name again.
export function PayFound({ pay, filedAs, incomeId, notPay }: { pay: PayGuess; filedAs: string; incomeId: string; notPay: string[] }) {
  const router = useRouter();
  const { money0 } = useMoney();
  const [state, setState] = useState<"idle" | "busy" | "gone">("idle");
  const [err, setErr] = useState("");
  if (state === "gone") return null;
  async function yes() {
    setState("busy");
    const r = await saveRule(emptyRule({ match: pay.name, direction: "in", category_id: incomeId }), true);
    if (r.error) return setErr(r.error), setState("idle");
    setState("gone");
    router.refresh();
  }
  async function no() {
    setState("busy");
    const sb = createClient();
    await updateMeta(sb, { data: { not_pay: [...notPay, pay.name] } });
    setState("gone");
  }
  return (
    <section className="card p-5 space-y-3">
      <div className="space-y-1">
        <p className="font-medium">Is {money0(pay.typical)} every {pay.every} from {pay.name} your pay?</p>
        <p className="text-sm text-muted">Your bank filed it as {filedAs}, so broke can&apos;t count it as money coming in. That changes your plan, budgets and what&apos;s left over.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={state === "busy"} onClick={yes}>Yes, it&apos;s my pay</button>
        <button className="btn" disabled={state === "busy"} onClick={no}>No</button>
      </div>
      {err && <p className="text-sm text-bad">{err}</p>}
    </section>
  );
}
