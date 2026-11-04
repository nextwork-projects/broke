"use client";

import { CirclePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { toast } from "@/components/Toast";
import { plural } from "@/lib/format";

export type LinkKind = "bank" | "investments";
export type Linked = { institution: string | null; accounts: number; added: number; holdings: number; kind: LinkKind };

// "Linked First Platypus Bank: 7 accounts, 331 transactions". Investments count holdings instead.
export const linkedText = (r: Linked) =>
  `Linked ${r.institution ?? "your bank"}: ${plural(r.accounts, "account")}, ${r.kind === "investments" ? plural(r.holdings, "holding") : plural(r.added, "transaction")}`;

const FAILED = "Couldn't reach broke. Check your connection and try again.";

// itemId: Link's update mode, to sign back in to that connection; success then just re-syncs it.
// quiet: the caller shows `result` and `error` itself, so no toast.
export function useLinkBank(itemId?: string, { quiet = false } = {}) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<LinkKind>("bank");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Linked | null>(null);

  // Every request ends here: the button resets, success shows the counts, a failure (even a dropped connection) shows why.
  const run = useCallback(
    async (req: () => Promise<Response>, k: LinkKind) => {
      setBusy(true);
      setError("");
      setResult(null);
      try {
        const res = await req();
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? "Linking failed. Try again in a moment.");
        if (!itemId) {
          const r: Linked = { institution: body.institution ?? null, accounts: body.accounts ?? 0, added: body.added ?? 0, holdings: body.holdings ?? 0, kind: k };
          setResult(r);
          if (!quiet) toast(linkedText(r), undefined, { label: "Open dashboard", run: () => router.push("/") });
        }
      } catch (e) {
        const msg = e instanceof TypeError ? FAILED : e instanceof Error ? e.message : FAILED; // fetch throws TypeError "Failed to fetch"
        setError(msg);
        if (!quiet) toast(msg);
      } finally {
        setBusy(false);
        setToken(null);
        router.refresh();
      }
    },
    [router, itemId, quiet],
  );
  // The bank and accounts picked go along, so the server can refuse a bank that's already linked before saving a copy.
  const onSuccess = useCallback(
    (public_token: string, meta: { institution?: { institution_id?: string } | null; accounts?: { mask?: string | null; type?: string | null }[] }) =>
      run(() => (itemId ? fetch("/api/plaid/sync", { method: "POST" }) : fetch("/api/plaid/exchange", { method: "POST", body: JSON.stringify({
        public_token, institution_id: meta?.institution?.institution_id ?? null, accounts: (meta?.accounts ?? []).map((a) => ({ mask: a.mask ?? null, type: a.type ?? null })),
      }) })), kind),
    [run, itemId, kind],
  );
  const { open, ready } = usePlaidLink({ token, onSuccess, onExit: () => setToken(null) });

  useEffect(() => {
    if (token && ready) open();
  }, [token, ready, open]);

  async function start(sandbox = false, k: LinkKind = "bank") {
    setError("");
    setKind(k);
    const payload = JSON.stringify({ kind: k, itemId });
    if (sandbox) return run(() => fetch("/api/plaid/sandbox", { method: "POST", body: payload }), k);
    try {
      const res = await fetch("/api/plaid/link-token", { method: "POST", body: payload });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setError(body.error ?? "Could not start Plaid");
      setToken(body.link_token);
    } catch {
      setError(FAILED);
      if (!quiet) toast(FAILED);
    }
  }
  return { start, busy, kind, error, result };
}

export function LinkBankButton({ label = "Add account", primary = false, sandbox = false, kind = "bank" }: { label?: string; primary?: boolean; sandbox?: boolean; kind?: LinkKind }) {
  const { start, busy, error } = useLinkBank();
  return (
    <span className="inline-flex flex-col items-center gap-1">
      <button onClick={() => start(sandbox, kind)} disabled={busy} className={primary ? "btn-primary" : "btn"}>
        {busy ? (kind === "investments" ? "Importing holdings..." : "Importing transactions...") : label}
      </button>
      {error && <span className="text-xs text-bad">{error}</span>}
    </span>
  );
}

/** New Zealand: links the server's Akahu personal app (every bank on that Akahu login). */
export function useAkahu() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function start() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/bank/akahu", { method: "POST" });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Linking failed");
    setBusy(false);
    router.refresh();
  }
  return { start, busy, error };
}

export function AkahuButton({ primary = false }: { primary?: boolean }) {
  const { start, busy, error } = useAkahu();
  return (
    <span className="inline-flex flex-col items-center gap-1">
      <button className={primary ? "btn-primary" : "btn"} disabled={busy} onClick={start}>
        {busy ? "Importing transactions..." : "+ Add NZ banks (Akahu)"}
      </button>
      {error && <span className="text-xs text-bad">{error}</span>}
    </span>
  );
}

export function AddAccountLink() {
  const { start, busy } = useLinkBank();
  return (
    <button onClick={() => start()} disabled={busy} className="flex items-center gap-2 text-[15px] hover:opacity-70">
      {busy ? "Linking..." : "Add"} <CirclePlus size={20} strokeWidth={1.5} />
    </button>
  );
}

/** Reconnect (when broken) and Remove, with a confirm step, for one bank connection. */
export function ConnectionActions({ itemId, broken, name }: { itemId: string; broken: boolean; name: string }) {
  const router = useRouter();
  const { start, busy, error } = useLinkBank(itemId);
  const [confirm, setConfirm] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState("");
  async function remove() {
    setRemoving(true);
    setRemoveError("");
    const res = await fetch("/api/plaid/remove", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId }) });
    setRemoving(false);
    if (!res.ok) return setRemoveError((await res.json().catch(() => ({}))).error ?? "Couldn't remove it");
    setConfirm(false);
    router.refresh();
  }
  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex items-center gap-2">
        {confirm ? (
          <>
            <span className="text-xs text-muted">Remove {name} and its transactions?</span>
            <button className="btn text-bad" onClick={remove} disabled={removing}>{removing ? "Removing..." : "Remove"}</button>
            <button className="btn" onClick={() => setConfirm(false)} disabled={removing}>Cancel</button>
          </>
        ) : (
          <>
            {broken && <button className="btn-primary" onClick={() => start()} disabled={busy}>{busy ? "Reconnecting..." : "Reconnect"}</button>}
            <button className="btn" onClick={() => setConfirm(true)}>Remove</button>
          </>
        )}
      </span>
      {(error || removeError) && <span className="text-xs text-bad">{error || removeError}</span>}
    </span>
  );
}

export function SyncButton({ subtle = false }: { subtle?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => setResult(""), 4000);
    return () => clearTimeout(t);
  }, [result]);
  return (
    <button
      className={subtle ? "text-xs underline underline-offset-2 hover:opacity-70" : "btn"}
      disabled={busy}
      aria-live="polite"
      onClick={async () => {
        setBusy(true);
        const res = await fetch("/api/plaid/sync", { method: "POST" });
        const body = await res.json().catch(() => ({}));
        const added = (body.results ?? []).reduce((s: number, r: { added: number }) => s + r.added, 0);
        setResult(!res.ok ? "Sync failed" : added ? `${added} new` : "Up to date");
        setBusy(false);
        router.refresh();
      }}
    >
      {busy ? "Syncing..." : result || "Sync now"}
    </button>
  );
}

// Test mode: Plaid's window only takes its made-up banks. Says how to sign in there, and where real banks start.
export function TestModeNote() {
  return (
    <p className="text-sm text-muted max-w-md">
      Test mode: Plaid only shows made-up banks. Sign in with <code className="font-mono text-ink">user_good</code> and <code className="font-mono text-ink">pass_good</code>.{" "}
      <a href="/go-live" className="text-ink underline underline-offset-2 hover:opacity-70">Use your real bank</a>
    </p>
  );
}

// Linked now: removes a second copy of a bank (the same accounts, linked again). /api/plaid/remove revokes it at Plaid.
export function RemoveCopy({ itemId, name }: { itemId: string; name: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function remove() {
    setBusy(true);
    setErr("");
    const res = await fetch("/api/plaid/remove", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setErr("Couldn't remove it. Try again.");
    router.refresh();
  }
  return confirm ? (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">Remove this copy of {name}? The other one keeps all your transactions.</span>
      <button className="btn text-bad" onClick={remove} disabled={busy}>{busy ? "Removing..." : "Remove copy"}</button>
      <button className="text-muted hover:text-ink" onClick={() => setConfirm(false)} disabled={busy}>Cancel</button>
      {err && <span className="text-bad">{err}</span>}
    </span>
  ) : (
    <button className="btn !py-1 text-sm" onClick={() => setConfirm(true)}>Remove this copy</button>
  );
}
