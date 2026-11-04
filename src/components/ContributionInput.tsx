"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient, updateMeta } from "@/utils/supabase/client";

// What the user has put in this tax year, when no linked account shows it. Saved to user_metadata.contributed["kind:year"].
export function ContributionInput({ id, label, value }: { id: string; label: string; value: number | null }) {
  const router = useRouter();
  const [v, setV] = useState(value == null ? "" : String(value));
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(v.replace(/[^\d.]/g, ""));
    if (v.trim() && !Number.isFinite(n)) return;
    setBusy(true);
    const sb = createClient();
    const { data } = await sb.auth.getUser(); // latest copy, so two rows saved in a row both stick
    const all = { ...(data.user?.user_metadata?.contributed ?? {}) } as Record<string, number>;
    if (v.trim()) all[id] = n;
    else delete all[id];
    await updateMeta(sb, { data: { contributed: all } });
    setBusy(false);
    router.refresh();
  }

  return (
    <form onSubmit={save} className="flex flex-wrap items-center gap-2">
      <span className="w-full text-xs text-muted">Put in so far</span>
      <input
        inputMode="decimal"
        value={v}
        onChange={(e) => setV(e.target.value)}
        aria-label={`What you've put in your ${label} this year`}
        placeholder="Add what you've put in"
        className="w-48 bg-surface border border-line rounded-full px-3.5 py-1.5 text-sm outline-none focus:border-ink tabular"
      />
      <button className="btn text-sm" disabled={busy}>{busy ? "Saving" : "Save"}</button>
    </form>
  );
}
