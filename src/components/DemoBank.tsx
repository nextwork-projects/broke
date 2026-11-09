"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// "Use made-up data": adds the demo bank (api/demo-bank) when there's no Plaid account to link a test bank with.
export function DemoBankButton({ onDone, primary = false }: { onDone?: () => void; primary?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function add() {
    setBusy(true);
    setErr("");
    const res = await fetch("/api/demo-bank", { method: "POST" }).catch(() => null);
    setBusy(false);
    if (!res?.ok && res?.status !== 409) return setErr(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? "Couldn't add the made-up bank. Try again.");
    onDone?.();
    router.refresh();
  }
  return (
    <>
      <button onClick={add} disabled={busy} className={primary ? "btn-primary" : "btn"}>{busy ? "Adding made-up data..." : "Use made-up data"}</button>
      <p className="text-xs text-muted">A pretend bank with three months of everyday spending. No Plaid account needed. Clear it any time in Settings, Database.</p>
      {err && <p className="text-sm text-bad">{err}</p>}
    </>
  );
}
