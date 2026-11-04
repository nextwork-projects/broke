"use client";

import { ArrowLeft, CalendarDays, DollarSign, EyeOff, Landmark, type LucideIcon, Pencil, Shapes, Tags, Type, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Dropdown } from "@/components/Dropdown";
import { CategoryIcon } from "@/components/Icons";
import { Merchant } from "@/components/Merchant";
import { Modal } from "@/components/Modal";
import { useMoney } from "@/components/Money";
import { TagEditor } from "@/components/Tags";
import type { Category } from "@/lib/data";
import { displayName, plural } from "@/lib/format";
import { findsSomething, matches, mergeTags, type Rule } from "@/lib/rules";
import { createClient } from "@/utils/supabase/client";

export type Draft = Omit<Rule, "id"> & { id?: string };
export const emptyRule = (x: Partial<Draft> = {}): Draft => ({ match: "", amount_min: null, amount_max: null, account_id: null, day_from: null, day_to: null, category_id: null, rename: null, ignore: null, add_tags: null, ...x });

type Match = { id: string; date: string; name: string; merchant_name: string | null; custom_name: string | null; logo_url: string | null; amount: number; currency: string | null; account_id: string; tags: string[] | null };

// Past transactions the rule matches, newest first. Name and account filter in Postgres, the rest here.
export async function pastMatches(d: Draft) {
  if (!findsSomething(d)) return [];
  const s = d.match.trim().replace(/[%,()]/g, " ");
  const db = createClient();
  const uid = (await db.auth.getSession()).data.session?.user.id;
  if (!uid) return [];
  // Own rows only (not a partner's shared ones), paged: Supabase returns at most 1000 rows per request.
  // ponytail: a rule with no name pages through every own row; fine for a personal ledger, an RPC if it gets slow.
  const rows: Match[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from("transactions").select("id, date, name, merchant_name, custom_name, logo_url, amount, currency, account_id, tags").eq("user_id", uid);
    if (s) q = q.or(`name.ilike.%${s}%,merchant_name.ilike.%${s}%`);
    if (d.account_id) q = q.eq("account_id", d.account_id);
    const { data } = await q.order("date", { ascending: false }).order("id").range(from, from + 999);
    rows.push(...((data ?? []) as Match[]));
    if (!data || data.length < 1000) break;
  }
  return rows.filter((t) => matches(d, t));
}

/** Saves the rule and, if asked, rewrites the past transactions it matches. Returns how many changed, or an error. */
export async function saveRule(d: Draft, applyPast: boolean): Promise<{ error?: string; updated: number }> {
  const supabase = createClient();
  const row = {
    match: d.match.trim(), amount_min: d.amount_min, amount_max: d.amount_max, account_id: d.account_id || null, day_from: d.day_from ?? null, day_to: d.day_to ?? null, direction: d.direction ?? null,
    category_id: d.category_id, rename: d.rename?.trim() || null, ignore: d.ignore, add_tags: d.add_tags?.length ? d.add_tags : null,
  };
  const { error } = d.id ? await supabase.from("rules").update(row).eq("id", d.id) : await supabase.from("rules").insert(row);
  if (error) return { error: /rules|column/.test(error.message) ? "Rules need a database update. Open Setup to run it." : "Couldn't save the rule.", updated: 0 };
  if (!applyPast) return { updated: 0 };
  const patch = { ...(row.category_id ? { category_id: row.category_id } : {}), ...(row.rename ? { custom_name: row.rename } : {}), ...(row.ignore != null ? { ignored: row.ignore } : {}) };
  const past = await pastMatches(d);
  const ids = past.map((t) => t.id);
  if (Object.keys(patch).length) for (let i = 0; i < ids.length; i += 200) await supabase.from("transactions").update(patch).in("id", ids.slice(i, i + 200));
  // Tags merge with what each row already has, so it's one write per row that gains a tag.
  // ponytail: per-row updates, 10 at a time; a Postgres function would do it in one call if rules grow to thousands of rows.
  const tagged = row.add_tags ? past.filter((t) => mergeTags(t.tags, row.add_tags).length > (t.tags ?? []).length) : [];
  for (let i = 0; i < tagged.length; i += 10)
    await Promise.all(tagged.slice(i, i + 10).map((t) => supabase.from("transactions").update({ tags: mergeTags(t.tags, row.add_tags) }).eq("id", t.id)));
  return { updated: ids.length };
}

export const categoryOptions = (cats: Category[]) =>
  cats.map((c) => ({ value: c.id, label: c.label, icon: <CategoryIcon icon={c.icon} color={c.color} size={26} /> }));

// One option on the left pane: icon, label, checkbox. Checking it opens its inputs.
function Option({ icon: Icon, label, on, set, children }: { icon: LucideIcon; label: string; on: boolean; set: (on: boolean) => void; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface border border-line">
      <label className="flex items-center gap-3 px-4 py-3.5 cursor-pointer">
        <Icon size={18} className="text-muted shrink-0" />
        <span className="flex-1 text-sm font-medium">{label}</span>
        <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="size-4 accent-[var(--color-ink)]" />
      </label>
      {on && children && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

const day = (v: string) => (/^\d{1,2}$/.test(v.trim()) && +v >= 1 && +v <= 31 ? +v : null);

/** Create or edit a rule in two steps: how it finds transactions (with the live matches beside it), then what it does. */
export function RuleDialog({ initial, cats, allTags, onClose, onDone }: { initial: Draft; cats: Category[]; allTags: string[]; onClose: () => void; onDone: (msg: string) => void }) {
  const { money0, parseAmount, signed, dayLabel } = useMoney();
  const num = (v: string) => (v.trim() === "" || isNaN(parseAmount(v)) ? null : Math.abs(parseAmount(v)));
  const [step, setStep] = useState<1 | 2>(1);
  const [d, setD] = useState(initial);
  const [on, setOn] = useState({
    name: !!initial.match.trim(), amount: initial.amount_min != null || initial.amount_max != null, account: !!initial.account_id, date: initial.day_from != null || initial.day_to != null,
    category: !!initial.category_id, rename: !!initial.rename, tags: !!initial.add_tags?.length, ignore: !!initial.ignore,
  });
  const turn = (k: keyof typeof on) => (v: boolean) => setOn({ ...on, [k]: v });
  const [min, setMin] = useState(initial.amount_min?.toString() ?? "");
  const [max, setMax] = useState(initial.amount_max?.toString() ?? "");
  const [dayFrom, setDayFrom] = useState(initial.day_from?.toString() ?? "");
  const [dayTo, setDayTo] = useState(initial.day_to?.toString() ?? "");
  const [accounts, setAccounts] = useState<{ value: string; label: string }[]>([]);
  const [found, setFound] = useState<Match[] | null>(null);
  const [foundKey, setFoundKey] = useState<string | null>(null); // which match settings `found` is for
  const [applyPast, setApplyPast] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Unchecked options don't count, so unchecking keeps what was typed without using it.
  const draft: Draft = {
    ...d,
    match: on.name ? d.match : "",
    amount_min: on.amount ? num(min) : null, amount_max: on.amount ? num(max) : null,
    account_id: on.account ? d.account_id : null,
    day_from: on.date ? day(dayFrom) : null, day_to: on.date ? day(dayTo) : null,
    category_id: on.category ? d.category_id : null, rename: on.rename ? d.rename : null,
    add_tags: on.tags ? d.add_tags : null, ignore: on.ignore ? true : null,
  };
  const badAmount = draft.amount_min != null && draft.amount_max != null && draft.amount_min > draft.amount_max;
  const badDay = on.date && ((dayFrom.trim() !== "" && day(dayFrom) == null) || (dayTo.trim() !== "" && day(dayTo) == null));
  const canContinue = findsSomething(draft) && !badAmount && !badDay;
  const doesSomething = !!draft.category_id || !!draft.rename?.trim() || draft.ignore != null || !!draft.add_tags?.length;
  const key = JSON.stringify([draft.match, draft.amount_min, draft.amount_max, draft.account_id, draft.day_from, draft.day_to]);

  // Own accounts, for "Filter by account".
  useEffect(() => {
    const db = createClient();
    db.auth.getSession().then(({ data }) => {
      const uid = data.session?.user.id;
      if (uid) db.from("accounts").select("id, name, custom_name, mask").eq("user_id", uid).order("name").then(({ data }) =>
        setAccounts((data ?? []).map((a) => ({ value: a.id, label: `${a.custom_name || a.name}${a.mask ? ` ··${a.mask}` : ""}` }))));
    });
  }, []);

  // Live matches, after typing settles. A slower earlier answer never overwrites a newer one.
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => pastMatches(draft).then((r) => live && (setFound(r), setFoundKey(key))), 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!doesSomething) return setErr("Pick at least one thing for the rule to do.");
    setBusy(true);
    setErr("");
    const r = await saveRule(draft, applyPast);
    setBusy(false);
    if (r.error) return setErr(r.error);
    onDone(r.updated ? `Rule saved. Updated ${plural(r.updated, "past transaction")}.` : "Rule saved.");
  }

  async function remove() {
    const { error } = await createClient().from("rules").delete().eq("id", d.id!);
    if (error) return setErr("Couldn't delete the rule.");
    onDone("Rule deleted. Past transactions keep their changes.");
  }

  // Until the count for these settings lands, say so instead of showing 0 (or the last count).
  const loading = findsSomething(draft) && foundKey !== key;
  const n = findsSomething(draft) ? found?.length ?? 0 : 0;
  const title = d.id ? "Edit rule" : "Create a rule";

  return (
    <Modal label={title} onClose={onClose} className="md:max-w-4xl! p-0! md:h-[min(680px,88vh)] flex flex-col">
      <div className="flex items-center gap-2 px-5 md:px-6 py-4 border-b border-line">
        {step === 2 && <button type="button" aria-label="Back" onClick={() => (setStep(1), setErr(""))} className="p-2 -ml-2 rounded-full hover:bg-[var(--hover)]"><ArrowLeft size={18} /></button>}
        <div className="card-title flex-1 min-w-0 truncate">{title}</div>
        {step === 1
          ? <button type="button" disabled={!canContinue} onClick={() => setStep(2)} className="btn-primary">Continue</button>
          : <button type="button" disabled={busy || !doesSomething} onClick={save} className="btn-primary">{busy ? "Saving..." : "Save rule"}</button>}
        <button type="button" aria-label="Close" onClick={onClose} className="p-2 -mr-2 rounded-full hover:bg-[var(--hover)]"><X size={18} /></button>
      </div>

      <div className="flex-1 md:min-h-0 grid md:grid-cols-2">
        <div className="bg-canvas p-5 md:p-6 space-y-3 md:overflow-y-auto">
          {step === 1 ? (
            <>
              <p className="text-sm text-muted pb-1">First, set up how your rule finds transactions. Pick one or more.</p>
              <Option icon={Pencil} label="Match on name" on={on.name} set={turn("name")}>
                <input autoFocus value={d.match} onChange={(e) => setD({ ...d, match: e.target.value })} placeholder="Name contains, e.g. uber" aria-label="Name contains" className="select" />
              </Option>
              <Option icon={DollarSign} label="Match on amount" on={on.amount} set={turn("amount")}>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1.5"><span className="text-xs text-muted">From</span><input autoFocus inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} placeholder={money0(0)} className="select tabular" /></label>
                  <label className="block space-y-1.5"><span className="text-xs text-muted">To</span><input inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} placeholder="Any" className="select tabular" /></label>
                </div>
                {badAmount && <p className="text-xs text-bad">The lowest amount is above the highest.</p>}
              </Option>
              <Option icon={Landmark} label="Filter by account" on={on.account} set={turn("account")}>
                {accounts.length
                  ? <Dropdown label="Account" value={d.account_id ?? ""} options={accounts} onChange={(v) => setD({ ...d, account_id: v || null })} placeholder="Pick an account" />
                  : <p className="text-sm text-muted">No accounts yet.</p>}
              </Option>
              <Option icon={CalendarDays} label="Match on date" on={on.date} set={turn("date")}>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1.5"><span className="text-xs text-muted">Day of the month</span><input autoFocus inputMode="numeric" value={dayFrom} onChange={(e) => setDayFrom(e.target.value)} placeholder="1" className="select tabular" /></label>
                  <label className="block space-y-1.5"><span className="text-xs text-muted">To <span className="text-muted">(optional)</span></span><input inputMode="numeric" value={dayTo} onChange={(e) => setDayTo(e.target.value)} placeholder="Same day" className="select tabular" /></label>
                </div>
                {badDay && <p className="text-xs text-bad">Days run from 1 to 31.</p>}
              </Option>
            </>
          ) : (
            <>
              <p className="text-sm text-muted pb-1">Then, choose what the rule does to these transactions.</p>
              <Option icon={Shapes} label="Change category" on={on.category} set={turn("category")}>
                <Dropdown label="Category" value={d.category_id ?? ""} options={categoryOptions(cats)} onChange={(v) => setD({ ...d, category_id: v || null })} placeholder="Pick a category" searchable />
              </Option>
              <Option icon={Type} label="Rename" on={on.rename} set={turn("rename")}>
                <input autoFocus value={d.rename ?? ""} onChange={(e) => setD({ ...d, rename: e.target.value })} placeholder="New name, e.g. Uber" aria-label="New name" className="select" />
              </Option>
              <Option icon={Tags} label="Add tags" on={on.tags} set={turn("tags")}>
                <TagEditor value={d.add_tags ?? []} onChange={(add_tags) => setD({ ...d, add_tags })} all={allTags} autoFocus />
              </Option>
              <Option icon={EyeOff} label="Hide from totals" on={on.ignore} set={turn("ignore")} />
              <label className="flex items-center gap-3 text-sm cursor-pointer px-1 pt-2">
                <input type="checkbox" checked={applyPast} onChange={(e) => setApplyPast(e.target.checked)} className="size-4 accent-[var(--color-ink)]" />
                Also update {loading || found == null ? "past transactions" : plural(n, "past transaction")}
              </label>
              {err && <p className="text-sm text-bad px-1">{err}</p>}
              {d.id && (
                <div className="px-1 pt-2 text-sm">
                  {confirmDelete
                    ? <span className="flex flex-wrap items-center gap-2"><span>Delete this rule? Past transactions keep their changes.</span><button type="button" onClick={remove} className="font-medium text-bad hover:opacity-70">Delete</button><button type="button" onClick={() => setConfirmDelete(false)} className="text-muted hover:text-ink">Cancel</button></span>
                    : <button type="button" onClick={() => setConfirmDelete(true)} className="text-muted underline underline-offset-2 hover:text-bad">Delete rule</button>}
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-5 md:p-6 pb-[max(20px,env(safe-area-inset-bottom))] md:overflow-y-auto">
          <div className="flex items-baseline justify-between gap-3 pb-3 border-b border-line">
            <span className="section-label text-ink">Transactions</span>
            <span className="text-sm text-muted tabular" aria-live="polite">{loading ? "Finding matches..." : `${n} matched`}</span>
          </div>
          {!findsSomething(draft) ? (
            <div className="flex flex-col items-center text-center gap-3 py-12 px-6 text-muted">
              <ArrowLeft size={22} className="max-md:rotate-90" />
              <p className="text-sm max-w-60"><span className="md:hidden">Pick a match above</span><span className="max-md:hidden">Pick a match on the left</span> to find transactions for your rule.</p>
            </div>
          ) : loading && !found ? (
            <div className="space-y-3 py-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-9 rounded-xl bg-line/70 animate-pulse" />)}</div>
          ) : !loading && found && !found.length ? (
            <p className="text-sm text-muted py-12 text-center">No past transactions match yet.</p>
          ) : (
            <ul className={loading ? "opacity-50" : ""}>
              {(found ?? []).slice(0, 100).map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5 border-b border-line last:border-0">
                  <Merchant name={displayName(t)} logo={t.logo_url} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{displayName(t)}</div>
                    <div className="text-xs text-muted">{dayLabel(t.date)}</div>
                  </div>
                  <span className={`text-sm tabular ${t.amount < 0 ? "text-good" : ""}`}>{signed(t.amount, t.currency)}</span>
                </li>
              ))}
              {(found?.length ?? 0) > 100 && <li className="text-xs text-muted pt-3">Showing the newest 100.</li>}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
