"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Removes each sandbox connection through /api/plaid/remove (it only removes the signed-in user's own).
export function RemoveTest({ items, intro }: { items: { id: string; name: string }[]; intro: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(items);
  const [err, setErr] = useState("");
  if (!left.length) return <span className="text-sm text-good inline-flex items-center gap-1"><Check size={13} /> Test data deleted.</span>;
  async function remove() {
    setBusy(true);
    setErr("");
    const keep: typeof left = [];
    for (const it of left) {
      const res = await fetch("/api/plaid/remove", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId: it.id }) }).catch(() => null);
      if (!res?.ok) keep.push(it);
    }
    setLeft(keep);
    setBusy(false);
    setConfirm(false);
    if (keep.length) setErr(`Couldn't remove ${keep.map((k) => k.name).join(", ")}. Try again.`);
    router.refresh();
  }
  const n = left.length;
  return (
    <div className="space-y-2 text-sm">
      <p>{intro} You have {n}: {left.map((i) => i.name).join(", ")}.</p>
      {confirm ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted">Remove {n === 1 ? "it" : `all ${n}`} and {n === 1 ? "its" : "their"} test transactions?</span>
          <button className="btn text-bad" disabled={busy} onClick={remove}>{busy ? "Removing..." : "Remove"}</button>
          <button className="text-muted hover:text-ink" disabled={busy} onClick={() => setConfirm(false)}>Cancel</button>
        </div>
      ) : (
        <button className="btn" onClick={() => setConfirm(true)}>Delete test data</button>
      )}
      {err && <p className="text-bad">{err}</p>}
    </div>
  );
}

// Everything that came from Plaid's test banks, in one go: the connections (their accounts and transactions go with
// them), then what was worked out from them (/api/start-fresh). One action, because the page refreshes once the
// connections are gone and a second button would vanish with them. Used by Settings and the go-live steps.
export function ClearTestData({ items }: { items: { id: string; name: string }[] }) {
  const router = useRouter();
  const [budgets, setBudgets] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const [left, setLeft] = useState(items);
  async function clear() {
    setState("busy");
    const keep: typeof left = [];
    for (const it of left) {
      const res = await fetch("/api/plaid/remove", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId: it.id }) }).catch(() => null);
      if (!res?.ok) keep.push(it);
    }
    const fresh = await fetch("/api/start-fresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ budgets }) }).catch(() => null);
    setLeft(keep);
    setConfirm(false);
    setState(!keep.length && fresh?.ok ? "done" : "failed");
    router.refresh();
  }
  if (state === "done") return <p className="text-sm text-good flex items-center gap-1.5"><Check size={15} />Test data deleted. Your totals now only count real banks.</p>;
  const n = left.length;
  return (
    <div className="space-y-3 text-sm">
      <ul className="space-y-1">
        {n > 0 && <li>{n === 1 ? "1 test bank" : `${n} test banks`} ({left.map((i) => i.name).join(", ")}) with their accounts and transactions</li>}
        <li>Your money plan and weekly reviews. broke builds them again from your real banks.</li>
      </ul>
      <p className="text-muted">Your rules, categories and money profile stay.</p>
      <label className="flex items-center gap-2.5 cursor-pointer">
        <input type="checkbox" checked={budgets} onChange={(e) => setBudgets(e.target.checked)} className="size-4 accent-[var(--ink)]" />
        Also delete my budgets
      </label>
      {confirm ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted">This can&apos;t be undone.</span>
          <button className="btn text-bad" disabled={state === "busy"} onClick={clear}>{state === "busy" ? "Deleting…" : "Delete"}</button>
          <button className="text-muted hover:text-ink" disabled={state === "busy"} onClick={() => setConfirm(false)}>Cancel</button>
        </div>
      ) : (
        <button className="btn" onClick={() => setConfirm(true)}>Delete test data</button>
      )}
      {state === "failed" && <p className="text-bad">{n ? `Couldn't remove ${left.map((k) => k.name).join(", ")}.` : "Couldn't clear the plan and reviews."} Try again.</p>}
    </div>
  );
}

// Settings, Database: everything broke holds about your money, for your account only. Two presses, so it can't happen by accident.
export function ClearMyData() {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [err, setErr] = useState("");
  async function clear() {
    setState("busy");
    setErr("");
    const res = await fetch("/api/clear-data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: "clear" }) }).catch(() => null);
    if (res?.ok) {
      setState("done");
      router.refresh();
    } else {
      setState("idle");
      setErr(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? "Couldn't clear your data. Try again.");
    }
  }
  if (state === "done") return <p className="text-sm text-good inline-flex items-center gap-1"><Check size={13} /> Cleared. Link a bank, or use a test bank, from Accounts.</p>;
  return (
    <div className="space-y-2 text-sm">
      {confirm ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted">Disconnect every bank and delete all of it? This can&apos;t be undone.</span>
          <button className="btn text-bad" disabled={state === "busy"} onClick={clear}>{state === "busy" ? "Clearing..." : "Clear my data"}</button>
          <button className="text-muted hover:text-ink" disabled={state === "busy"} onClick={() => setConfirm(false)}>Cancel</button>
        </div>
      ) : (
        <button className="btn" onClick={() => setConfirm(true)}>Clear my data</button>
      )}
      {err && <p className="text-bad">{err}</p>}
    </div>
  );
}
