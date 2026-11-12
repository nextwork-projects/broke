"use client";

import { Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dropdown } from "@/components/Dropdown";
import { Modal } from "@/components/Modal";
import { toast } from "@/components/Toast";
import { createClient } from "@/utils/supabase/client";

const KINDS = [
  { value: "depository", label: "Bank account (checking or savings)" },
  { value: "credit", label: "Credit card" },
  { value: "loan", label: "Loan" },
  { value: "investment", label: "Investment" },
  { value: "other", label: "Something else (cash, a car, a home)" },
];

// Rename an account, say what kind it is, or delete it. The kind decides where it counts: a credit card's balance is a
// debt and its purchases are spending on the card. Linked accounts come back on the next sync, so only accounts you
// added or imported can be deleted; a linked one is hidden instead, or its bank removed under Connections.
export function AccountEdit({ id, name, bankName, type, manual }: { id: string; name: string; bankName: string; type: string; manual: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(name);
  const [kind, setKind] = useState(type);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState("");
  const close = () => { setOpen(false); setConfirm(false); setErr(""); };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const patch: Record<string, unknown> = { custom_name: label.trim() && label.trim() !== bankName ? label.trim() : null };
    if (kind !== type) patch.type_override = kind;
    // RLS blocks with 0 rows, not an error.
    const { data, error } = await createClient().from("accounts").update(patch).eq("id", id).select("id");
    setBusy(false);
    if (error || !data?.length) return setErr(/type_override/.test(error?.message ?? "") ? "This needs a database update. Open Setup to run it." : "Couldn't save that. Try again.");
    close();
    toast("Saved");
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    const { data, error } = await createClient().from("accounts").delete().eq("id", id).select("id");
    setBusy(false);
    if (error || !data?.length) return setErr("Couldn't delete it. Try again.");
    close();
    toast(`Deleted ${name}`);
    router.refresh();
  }

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label={`Edit ${name}`} title="Edit" className="size-8 grid place-items-center rounded-full text-muted hover:text-ink hover:bg-[var(--hover-strong)] shrink-0">
        <Pencil size={15} />
      </button>
      {open && (
        <Modal label={`Edit ${name}`} onClose={close}>
          <form onSubmit={save} className="p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="card-title">Edit account</div>
              <button type="button" aria-label="Close" onClick={close} className="p-2 -mr-2 rounded-full hover:bg-[var(--hover)]"><X size={18} /></button>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Name</span>
              <input data-autofocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder={bankName} className="select" />
            </label>
            <div className="space-y-1.5">
              <span className="block text-sm font-medium">What kind of account is it?</span>
              <Dropdown label="Kind of account" placeholder="Choose a kind" value={kind} onChange={setKind} options={KINDS} />
              <p className="text-xs text-muted">A credit card&apos;s balance counts as money you owe. A bank account&apos;s counts as money you have.</p>
            </div>
            {err && <p className="text-sm text-bad">{err}</p>}
            <button disabled={busy} className="btn-primary w-full !py-2.5">{busy && !confirm ? "Saving..." : "Save"}</button>
            <div className="border-t border-line pt-4 text-sm">
              {!manual ? (
                <p className="text-muted">This account comes from your bank, so it comes back on the next sync. To stop counting it, use the switch next to it. To remove the whole bank, use Remove under Connections.</p>
              ) : confirm ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted">Delete it and all its transactions? This can&apos;t be undone.</span>
                  <button type="button" className="btn text-bad" disabled={busy} onClick={remove}>{busy ? "Deleting..." : "Delete"}</button>
                  <button type="button" className="text-muted hover:text-ink" disabled={busy} onClick={() => setConfirm(false)}>Cancel</button>
                </div>
              ) : (
                <button type="button" className="text-bad underline underline-offset-2" onClick={() => setConfirm(true)}>Delete this account</button>
              )}
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
