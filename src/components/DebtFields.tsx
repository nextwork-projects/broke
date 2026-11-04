"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMoney } from "@/components/Money";
import { createClient } from "@/utils/supabase/client";

// The rate and payment for one debt, which bank feeds don't give. Saves when you leave the box.
export function DebtFields({ id, apr, payment, guess }: { id: string; apr: number | null; payment: number | null; guess: number }) {
  const router = useRouter();
  const { symbol } = useMoney();
  const [a, setA] = useState(apr?.toString() ?? "");
  const [p, setP] = useState(payment?.toString() ?? "");
  const [err, setErr] = useState("");
  async function save(field: "apr" | "debt_payment", raw: string, max: number) {
    const n = raw.trim() === "" ? null : Number(raw);
    if (n !== null && !(n >= 0 && n <= max)) return setErr(field === "apr" ? "A rate is between 0 and 100." : "That payment doesn't look right.");
    setErr("");
    const { error } = await createClient().from("accounts").update({ [field]: n }).eq("id", id);
    if (error) return setErr("Couldn't save that. Try again.");
    router.refresh();
  }
  const box = "flex items-center border border-line rounded-xl px-3 h-10 bg-surface focus-within:border-ink";
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <label className="space-y-1 text-xs text-muted block">Interest rate (APR)
          <span className={box}>
            <input inputMode="decimal" value={a} onChange={(e) => setA(e.target.value.replace(/[^\d.]/g, ""))} onBlur={() => save("apr", a, 100)} placeholder="24.99" aria-label="Interest rate" className="w-full text-sm text-ink tabular outline-none bg-transparent" />
            <span className="text-sm text-muted">%</span>
          </span>
        </label>
        <label className="space-y-1 text-xs text-muted block">Monthly payment
          <span className={box}>
            <span className="text-sm text-muted mr-1">{symbol}</span>
            <input inputMode="decimal" value={p} onChange={(e) => setP(e.target.value.replace(/[^\d.]/g, ""))} onBlur={() => save("debt_payment", p, 1e7)} placeholder={guess >= 1 ? String(Math.round(guess)) : "0"} aria-label="Monthly payment" className="w-full text-sm text-ink tabular outline-none bg-transparent" />
          </span>
        </label>
      </div>
      {err && <p className="text-sm text-bad">{err}</p>}
    </div>
  );
}
