"use client";

import { Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Dropdown } from "@/components/Dropdown";
import { Modal } from "@/components/Modal";
import { toast } from "@/components/Toast";
import { applyRules, RULE_COLS, type Rule } from "@/lib/rules";
import { applyMapping, parseStatement, type DateOrder, type Mapping, type Parsed, type Row } from "@/lib/statement";
import { pdfToTable, type PdfItem } from "@/lib/statement-pdf";
import { createClient } from "@/utils/supabase/client";

type Acct = { id: string; label: string };
const NEW = "__new";
const ORDERS: { value: DateOrder; label: string }[] = [
  { value: "dmy", label: "Day first (31/12/2026)" },
  { value: "mdy", label: "Month first (12/31/2026)" },
  { value: "ymd", label: "Year first (2026/12/31)" },
];

// "Import a bank statement": CSV, OFX or QIF from any bank. Rows are manual, keyed so a second import of the
// same file adds nothing (transactions.import_key, migration 0016). Goes into a manual account or a new one.
// trigger: draw your own opener (the Add accounts card) instead of the button.
export function ImportStatement({ accounts, locale, currency, link = false, trigger }: { accounts: Acct[]; locale: string; currency: string; link?: boolean; trigger?: (open: () => void) => React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState("");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [m, setM] = useState<Mapping | null>(null);
  const [account, setAccount] = useState(accounts[0]?.id ?? NEW);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null); // a locked PDF waiting for its password
  const [pdfPass, setPdfPass] = useState("");

  const result = useMemo((): { rows: Row[]; skipped: number } => {
    if (!parsed) return { rows: [], skipped: 0 };
    if (parsed.kind !== "csv") return { rows: parsed.rows, skipped: 0 };
    return m ? applyMapping(parsed.table, m, locale) : { rows: [], skipped: 0 };
  }, [parsed, m, locale]);
  const fmt = useMemo(() => new Intl.NumberFormat(locale, { style: "currency", currency }), [locale, currency]);

  function reset() {
    setOpen(false);
    setParsed(null);
    setM(null);
    setFile("");
    setErr("");
    setPdfFile(null);
    setPdfPass("");
  }

  // Read here in the browser: a PDF statement never leaves this device.
  async function readPdf(f: File, pass?: string) {
    setBusy(true);
    try {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const doc = await pdfjs.getDocument({ data: await f.arrayBuffer(), password: pass }).promise;
      const items: PdfItem[] = [];
      for (let page = 1; page <= doc.numPages; page++) {
        for (const it of (await (await doc.getPage(page)).getTextContent()).items) {
          if ("str" in it && it.str.trim()) items.push({ str: it.str, x: it.transform[4], right: it.transform[4] + it.width, y: it.transform[5], page });
        }
      }
      const t = pdfToTable(items, locale);
      if (!t) return setErr(items.length ? "No transactions found in that PDF. Is it a bank statement?" : "That PDF is a scanned picture with no text in it. Ask your bank for a CSV or a text PDF.");
      setPdfFile(null);
      setFile(f.name);
      setNewName(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 60) || "Imported account");
      setParsed({ kind: "csv", ...t });
      setM(t.mapping);
    } catch (e) {
      // Many banks lock statements with a password.
      if ((e as { name?: string }).name === "PasswordException") {
        setPdfFile(f);
        setErr(pass ? "That password didn't open it. Try again." : "");
      } else {
        console.error("[broke] pdf statement:", e);
        setErr("Couldn't read that PDF.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function choose(f: File | undefined) {
    if (!f) return;
    setErr("");
    const pdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
    if (f.size > (pdf ? 25e6 : 5e6)) return setErr(`That file is over ${pdf ? 25 : 5} MB. Export a shorter date range.`);
    if (pdf) return readPdf(f);
    const p = parseStatement(await f.text(), f.name, locale);
    if (p.kind === "csv" && !p.table.rows.length) return setErr("No dated rows found. Is this a bank statement export?");
    setFile(f.name);
    setNewName(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 60) || "Imported account");
    setParsed(p);
    setM(p.kind === "csv" ? p.mapping : null);
  }

  async function submit() {
    if (!result.rows.length) return setErr("Nothing to import. Check the columns below.");
    setBusy(true);
    setErr("");
    const supabase = createClient();
    let acct = account;
    if (acct === NEW) {
      // Currency left empty: a manual account is in the home currency (migration 0015).
      const { data, error } = await supabase.from("accounts").insert({ name: newName.trim() || "Imported account", type: "depository", subtype: "checking", current_balance: 0, manual: true }).select("id").single();
      if (error) return setBusy(false), setErr("Couldn't create the account.");
      acct = data.id;
    }
    const { data: rules } = await supabase.from("rules").select(RULE_COLS).order("created_at", { ascending: false });
    const rows = result.rows.map((r) => {
      const p = applyRules((rules ?? []) as Rule[], { ...r, account_id: acct });
      return { account_id: acct, date: r.date, amount: r.amount, name: r.name, merchant_name: r.name, import_key: r.key, manual: true,
        category_id: p.category_id ?? null, custom_name: p.custom_name ?? null, ignored: p.ignored ?? false, tags: p.tags ?? [] };
    });
    let added = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const { data, error } = await supabase.from("transactions").upsert(rows.slice(i, i + 500), { onConflict: "account_id,import_key", ignoreDuplicates: true }).select("id");
      if (error) {
        setBusy(false);
        return setErr(/import_key/.test(error.message) ? "Statement import needs a database update. Open Setup to run it." : `Couldn't save the transactions${added ? ` after ${added}` : ""}.`);
      }
      added += data?.length ?? 0;
    }
    setBusy(false);
    const dupes = rows.length - added;
    toast(`${added} added${dupes ? `, ${dupes} already there` : ""}`);
    reset();
    router.refresh();
  }

  const cols = parsed?.kind === "csv" ? parsed.table.header.map((h, i) => ({ value: String(i), label: h })) : [];
  const none = { value: "-1", label: "Not used" };
  const pick = (label: string, key: "date" | "name" | "amount" | "debit" | "credit", optional = false) =>
    m && (
      <div className="space-y-1.5">
        <span className="block text-sm font-medium">{label}</span>
        <Dropdown label={label} value={String(m[key])} onChange={(v) => setM({ ...m, [key]: Number(v) })} placeholder="Choose a column" options={optional ? [none, ...cols] : cols} />
      </div>
    );
  const split = !!m && m.amount < 0;

  return (
    <>
      {trigger ? trigger(() => setOpen(true)) : <button onClick={() => setOpen(true)} className={link ? "inline-flex items-center gap-1 text-ink underline underline-offset-2 hover:opacity-70" : "btn inline-flex items-center gap-1.5"}>
        <Upload size={14} /> Import a bank statement
      </button>}
      {open && (
        <Modal label="Import a bank statement" onClose={reset} className="md:!max-w-2xl">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="card-title">Import a bank statement</div>
              <button type="button" aria-label="Close" onClick={reset} className="p-2 -mr-2 rounded-full hover:bg-[var(--hover)]"><X size={18} /></button>
            </div>
            <p className="text-sm text-muted">Log in to your bank on a computer, open the account and look for Statements or Download. CSV, OFX, QIF and PDF all work. A PDF stays on this device. Importing the same file again adds nothing new.</p>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Statement file</span>
              <input data-autofocus type="file" accept=".csv,.txt,.ofx,.qfx,.qif,.pdf,text/csv,application/pdf" onChange={(e) => choose(e.target.files?.[0])} className="select file:mr-3 file:rounded-full file:border-0 file:bg-canvas file:px-3 file:py-1 file:text-sm" />
            </label>
            {pdfFile && (
              <form onSubmit={(e) => { e.preventDefault(); readPdf(pdfFile, pdfPass); }} className="space-y-2">
                <p className="text-sm">This PDF is locked. Banks often use something like your date of birth or customer number: your statement email usually says which. It stays on this device.</p>
                <div className="flex gap-2">
                  <input type="password" autoComplete="off" value={pdfPass} onChange={(e) => setPdfPass(e.target.value)} aria-label="PDF password" className="select flex-1" />
                  <button disabled={!pdfPass || busy} className="btn-primary shrink-0">{busy ? "Opening..." : "Open"}</button>
                </div>
              </form>
            )}

            {parsed && (
              <>
                <p className="text-sm text-muted">
                  {file}: {/\.pdf$/i.test(file) ? "PDF" : parsed.kind.toUpperCase()}, {result.rows.length} transactions{result.skipped ? `, ${result.skipped} rows skipped (no date or amount)` : ""}.
                </p>

                {m && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {pick("Date", "date")}
                    <div className="space-y-1.5">
                      <span className="block text-sm font-medium">Date format</span>
                      <Dropdown label="Date format" value={m.order} onChange={(v) => setM({ ...m, order: v as DateOrder })} placeholder="Choose" options={ORDERS} />
                    </div>
                    {pick("Description", "name")}
                    <div className="space-y-1.5">
                      <span className="block text-sm font-medium">Amounts</span>
                      <Dropdown
                        label="Amounts" placeholder="Choose"
                        value={split ? "split" : m.outPositive ? "pos" : "neg"}
                        onChange={(v) => setM(v === "split"
                          ? { ...m, amount: -1, debit: m.debit >= 0 ? m.debit : 0, credit: m.credit >= 0 ? m.credit : 0 }
                          : { ...m, amount: m.amount >= 0 ? m.amount : Math.max(0, m.debit), outPositive: v === "pos" })}
                        options={[
                          { value: "neg", label: "One column, money out is negative" },
                          { value: "pos", label: "One column, money out is positive" },
                          { value: "split", label: "Separate money out and money in columns" },
                        ]}
                      />
                    </div>
                    {split ? <>{pick("Money out", "debit", true)}{pick("Money in", "credit", true)}</> : pick("Amount", "amount")}
                  </div>
                )}

                <div className="border border-line rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-muted border-b border-line"><th className="px-3 py-2 font-medium">Date</th><th className="px-3 py-2 font-medium">Description</th><th className="px-3 py-2 font-medium text-right">Amount</th></tr></thead>
                    <tbody>
                      {result.rows.slice(0, 5).map((r) => (
                        <tr key={r.key} className="border-b border-line last:border-0">
                          <td className="px-3 py-2 tabular whitespace-nowrap">{r.date}</td>
                          <td className="px-3 py-2 truncate max-w-0 w-full">{r.name}</td>
                          <td className={`px-3 py-2 tabular text-right whitespace-nowrap ${r.amount < 0 ? "text-good" : ""}`}>{r.amount < 0 ? `+${fmt.format(-r.amount)}` : fmt.format(r.amount)}</td>
                        </tr>
                      ))}
                      {!result.rows.length && <tr><td colSpan={3} className="px-3 py-4 text-center text-muted">No rows read with these columns.</td></tr>}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <span className="block text-sm font-medium">Into account</span>
                    <Dropdown label="Into account" value={account} onChange={setAccount} placeholder="Choose an account"
                      options={[...accounts.map((a) => ({ value: a.id, label: a.label })), { value: NEW, label: "New account", hint: `In ${currency}` }]} />
                  </div>
                  {account === NEW && (
                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium">Account name</span>
                      <input value={newName} onChange={(e) => setNewName(e.target.value)} className="select" />
                    </label>
                  )}
                </div>
              </>
            )}

            {err && <p className="text-sm text-bad">{err}</p>}
            {parsed && <button onClick={submit} disabled={busy || !result.rows.length} className="btn-primary w-full !py-2.5">{busy ? "Importing..." : `Import ${result.rows.length} transactions`}</button>}
          </div>
        </Modal>
      )}
    </>
  );
}
