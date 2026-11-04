"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dropdown } from "@/components/Dropdown";
import { Modal } from "@/components/Modal";
import { categoryOptions } from "@/components/RuleForm";
import { TagEditor } from "@/components/Tags";
import { toast } from "@/components/Toast";
import type { Category } from "@/lib/data";
import { createClient } from "@/utils/supabase/client";
import { useMoney } from "@/components/Money";

type Acct = { id: string; label: string };
const NEW_CASH = "__cash";
const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time

// "Add transaction": cash, a bank Plaid can't reach, anything typed by hand. Saved with manual = true.
export function AddTransaction({ accounts, cats, allTags }: { accounts: Acct[]; cats: Category[]; allTags: string[] }) {
  const { money, parseAmount } = useMoney();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const empty = { date: today(), name: "", amount: "", out: true, account: accounts[0]?.id ?? NEW_CASH, category: "", note: "", tags: [] as string[] };
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Math.abs(parseAmount(f.amount));
    if (!f.name.trim()) return setErr("Add a name, like the shop or person.");
    if (!amount) return setErr("Add an amount.");
    setBusy(true);
    setErr("");
    const supabase = createClient();
    let account = f.account;
    if (account === NEW_CASH) {
      const { data, error } = await supabase.from("accounts").insert({ name: "Cash", type: "depository", subtype: "cash", current_balance: 0, manual: true }).select("id").single();
      if (error) return setBusy(false), setErr(/manual/.test(error.message) ? "Manual transactions need a database update. Open Setup to run it." : "Couldn't create the cash account.");
      account = data.id;
    }
    // Bank convention: positive = money out.
    const { error } = await supabase.from("transactions").insert({
      account_id: account, date: f.date, amount: f.out ? amount : -amount, name: f.name.trim(), merchant_name: f.name.trim(),
      category_id: f.category || null, note: f.note.trim() || null, tags: f.tags, manual: true,
    });
    setBusy(false);
    if (error) return setErr("Couldn't save that transaction.");
    setOpen(false);
    setF(empty);
    toast(`${f.name.trim()} added`);
    router.refresh();
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-ink underline underline-offset-2 hover:opacity-70"><Plus size={14} /> Add transaction</button>
      {open && (
        <Modal label="Add transaction" onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="card-title">Add transaction</div>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="p-2 -mr-2 rounded-full hover:bg-[var(--hover)]"><X size={18} /></button>
            </div>

            <div className="grid grid-cols-2 gap-1 p-1 bg-canvas rounded-full text-sm">
              {[true, false].map((out) => (
                <button key={String(out)} type="button" onClick={() => setF({ ...f, out })} className={`rounded-full py-1.5 ${f.out === out ? "bg-surface shadow-sm font-medium" : "text-muted"}`}>
                  {out ? "Money out" : "Money in"}
                </button>
              ))}
            </div>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Name</span>
              <input data-autofocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Farmers market" className="select" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Amount</span>
                <input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder={money(0)} className="select tabular" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Date</span>
                <input type="date" value={f.date} max={today()} onChange={(e) => setF({ ...f, date: e.target.value })} className="select tabular" />
              </label>
            </div>
            <div className="space-y-1.5">
              <span className="block text-sm font-medium">Account</span>
              <Dropdown
                label="Account"
                value={f.account}
                onChange={(account) => setF({ ...f, account })}
                placeholder="Choose an account"
                options={[...accounts.map((a) => ({ value: a.id, label: a.label })), ...(accounts.some((a) => a.label === "Cash") ? [] : [{ value: NEW_CASH, label: "Cash", hint: "Creates a cash account" }])]}
              />
            </div>
            <div className="space-y-1.5">
              <span className="block text-sm font-medium">Category</span>
              <Dropdown label="Category" value={f.category} onChange={(category) => setF({ ...f, category })} placeholder="Uncategorized" options={categoryOptions(cats)} searchable />
            </div>
            <div className="space-y-1.5">
              <span className="block text-sm font-medium">Tags <span className="text-muted font-normal">(optional)</span></span>
              <TagEditor value={f.tags} onChange={(tags) => setF({ ...f, tags })} all={allTags} />
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Note <span className="text-muted font-normal">(optional)</span></span>
              <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className="select" />
            </label>

            {err && <p className="text-sm text-bad">{err}</p>}
            <button disabled={busy} className="btn-primary w-full !py-2.5">{busy ? "Saving..." : "Add transaction"}</button>
          </form>
        </Modal>
      )}
    </>
  );
}
