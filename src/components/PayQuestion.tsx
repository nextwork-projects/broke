"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dropdown } from "@/components/Dropdown";
import { useMoney } from "@/components/Money";
import type { Profile } from "@/components/ProfileForm";
import { FREQ_LABEL } from "@/lib/format";
import { createClient, updateMeta } from "@/utils/supabase/client";

const PAY_EVERY = ["WEEKLY", "BIWEEKLY", "SEMI_MONTHLY", "MONTHLY"].map((v) => ({ value: v, label: FREQ_LABEL[v] }));

// Asked only when no paycheck shows up in their transactions. Saved as profile.pay, which the plan and Home read.
export function PayQuestion({ profile }: { profile: Profile }) {
  const router = useRouter();
  const { parseAmount, symbol } = useMoney();
  const [amount, setAmount] = useState("");
  const [every, setEvery] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "failed">("idle");
  const n = Math.abs(parseAmount(amount));
  async function save() {
    setState("saving");
    const { error } = await updateMeta(createClient(), { data: { profile: { ...profile, pay: { amount: n, every } } } });
    setState(error ? "failed" : "idle");
    if (!error) router.refresh();
  }
  return (
    <div className="space-y-3 max-w-md">
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1.5">
          <span className="text-xs text-muted">Each payday, after tax</span>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={symbol} className="select tabular" />
        </label>
        <div className="space-y-1.5">
          <span className="text-xs text-muted block">How often</span>
          <Dropdown label="How often" value={every} options={PAY_EVERY} onChange={setEvery} placeholder="Choose one" />
        </div>
      </div>
      <button disabled={!(n > 0) || !every || state === "saving"} onClick={save} className="btn-primary">{state === "saving" ? "Saving..." : "Save my pay"}</button>
      {state === "failed" && <p className="text-sm text-bad">Couldn&apos;t save that. Try again.</p>}
    </div>
  );
}
