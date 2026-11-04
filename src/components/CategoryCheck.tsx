"use client";

import { Check, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAssistant } from "@/components/Assistant";
import { Dropdown } from "@/components/Dropdown";
import { Merchant } from "@/components/Merchant";
import { useMoney } from "@/components/Money";
import { categoryOptions, emptyRule, saveRule } from "@/components/RuleForm";
import { toast } from "@/components/Toast";
import type { Category } from "@/lib/data";
import { displayName, plural } from "@/lib/format";
import { matches } from "@/lib/rules";
import { fetchChecks, REASON_TEXT, type CheckRow, type Reason } from "@/lib/unsure";
import { createClient } from "@/utils/supabase/client";

type Row = CheckRow & { reason: Reason; same: string[] };
export type Checks = { rows: Row[]; total: number };

const db = () => createClient();
const uid = async () => (await db().auth.getSession()).data.session?.user.id;
// The bank's merchant when it gives one ("Uber"), else the raw name, as TxnRow's "Create a rule" does.
const ruleName = (t: Row) => t.merchant_name ?? t.name;

// One transaction: Yes keeps its category, Change picks another. Either way it never comes back (checked_at, 0023).
function CheckItem({ t, cats, onAnswer }: { t: Row; cats: Category[]; onAnswer: (t: Row, categoryId: string | null, always: boolean) => Promise<void> }) {
  const { signed, dayLabel } = useMoney();
  const [changing, setChanging] = useState(t.reason === "none");
  const [always, setAlways] = useState(false);
  const [busy, setBusy] = useState(false);
  const name = displayName(t);
  const has = t.category && t.category.key !== "OTHER";
  const answer = async (id: string | null) => {
    setBusy(true);
    await onAnswer(t, id, always);
    setBusy(false);
  };
  return (
    <li className="py-4 border-b border-line last:border-0 space-y-3">
      <div className="flex items-center gap-3">
        <Merchant name={name} logo={t.logo_url} icon={t.category?.icon} color={t.category?.color} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{name}</div>
          <div className="text-xs text-muted">{dayLabel(t.date)} · {REASON_TEXT[t.reason]}{t.same.length > 1 ? ` · ${plural(t.same.length, "transaction")} like this` : ""}</div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-sm tabular ${t.amount < 0 ? "text-good" : ""}`}>{signed(t.amount, t.currency)}</div>
          <div className="text-xs text-muted">{has ? t.category!.label : "No category"}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-11">
        {changing ? (
          <div className="w-full max-w-xs">
            <Dropdown label={`Category for ${name}`} value="" options={categoryOptions(cats)} onChange={(v) => v && answer(v)} placeholder="Pick a category" searchable />
          </div>
        ) : (
          <span className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => answer(t.category_id)} className="btn">Yes</button>
            <button type="button" disabled={busy} onClick={() => setChanging(true)} className="btn">Change</button>
          </span>
        )}
        <label className="flex items-center gap-2 text-sm text-muted cursor-pointer min-w-0">
          <input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} className="size-4 shrink-0 accent-[var(--color-ink)]" />
          <span className="truncate">Always do this for {name}</span>
        </label>
      </div>
    </li>
  );
}

/** "Is this right?": unsure transactions, the biggest first, 5 at a time until they ask for more. Pass `initial` from the server, or it loads its own.
 * onEmpty: called once nothing is left to check (onboarding moves on). */
export function CategoryCheck({ initial, cats: catsIn, onEmpty, title, closed = false }: { initial?: Checks; cats?: Category[]; onEmpty?: () => void; title?: string; closed?: boolean }) {
  const router = useRouter();
  const { ask } = useAssistant();
  const [open, setOpen] = useState(!closed);
  const [checks, setChecks] = useState<Checks | null>(initial ?? null);
  const [cats, setCats] = useState<Category[]>(catsIn ?? []);
  const [limit, setLimit] = useState(5);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!initial) uid().then((id) => (id ? fetchChecks(db(), id) : { rows: [], total: 0 })).then((c) => setChecks(c as Checks));
    if (!catsIn) db().from("categories").select("id, key, label, icon, color, kind").order("label").then(({ data }) => setCats((data ?? []) as Category[]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A rule applied from the chat: the page refreshes with a shorter list.
  useEffect(() => {
    if (initial) setChecks(initial);
  }, [initial]);

  useEffect(() => {
    if (checks && !checks.total) onEmpty?.();
  }, [checks?.total]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onAnswer(t: Row, categoryId: string | null, always: boolean) {
    const changed = categoryId !== t.category_id;
    const now = new Date().toISOString();
    const { error } = await db().from("transactions").update({ checked_at: now, ...(changed ? { category_id: categoryId } : {}) }).in("id", t.same);
    if (error) return void toast("Couldn't save that. Try again.");
    // "Always": a rule for this merchant, applied to past rows too. The other shown rows it covers are answered with it.
    let done = t.same;
    if (always && categoryId) {
      const r = await saveRule(emptyRule({ match: ruleName(t), category_id: categoryId }), true);
      if (r.error) toast(r.error);
      else {
        const draft = emptyRule({ match: ruleName(t) });
        const covered = checks!.rows.filter((x) => x.id !== t.id && matches(draft, x)).flatMap((x) => x.same);
        if (covered.length) await db().from("transactions").update({ checked_at: now }).in("id", covered);
        done = [...t.same, ...covered];
        toast(r.updated ? `Rule saved. Updated ${plural(r.updated, "past transaction")}.` : "Rule saved.");
      }
    }
    const left = checks!.rows.filter((x) => !done.includes(x.id));
    const total = Math.max(0, checks!.total - (checks!.rows.length - left.length));
    // The shown five are done but more wait: load the next ones.
    if (!left.length && total) {
      const id = await uid();
      setChecks(id ? ((await fetchChecks(db(), id, undefined, limit)) as Checks) : { rows: [], total: 0 });
    } else setChecks({ rows: left, total });
    if (changed || always) router.refresh();
  }

  // Names, which way the money went and today's category, never amounts. A cloud model sees the names as placeholders.
  async function sortWithAI() {
    const id = await uid();
    const all = id ? ((await fetchChecks(db(), id, undefined, 60)) as Checks).rows : checks!.rows;
    const lines = all.map((t) => `${displayName(t)} (money ${t.amount < 0 ? "in" : "out"}, now ${t.category?.label ?? "no category"}${t.same.length > 1 ? `, ${t.same.length} like this` : ""})`);
    ask(`Help me sort these categories. Suggest rules for what you're confident about, and ask me about anything you're not sure of.\n\nThese need checking: ${lines.join("; ")}.`);
  }

  // More of the same list, biggest first. Anything already answered is gone from it.
  async function showMore() {
    const id = await uid();
    if (!id) return;
    setLoading(true);
    const n = checks!.rows.length + 20;
    setChecks((await fetchChecks(db(), id, undefined, n)) as Checks);
    setLimit(n);
    setLoading(false);
  }

  if (!checks) return <div className="card p-6 space-y-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-10 rounded-xl bg-line/70 animate-pulse" />)}</div>;
  if (!checks.total)
    return initial === undefined && !onEmpty ? null : (
      <section className="card p-6 flex items-center gap-3" role="status">
        <span className="size-8 rounded-full bg-brand-soft text-brand grid place-items-center shrink-0"><Check size={16} /></span>
        <span className="text-sm">Every category is checked.</span>
      </section>
    );
  const head = title ?? `${checks.total} to check`;
  // closed (the Transactions page): one line until they open it, so the list stays in view.
  if (!open)
    return (
      <section className="card px-5 md:px-6 py-4 flex flex-wrap items-center gap-x-4 gap-y-2" aria-labelledby="check-title">
        <div className="flex-1 min-w-48">
          <div id="check-title" className="card-title">{head}</div>
          <p className="text-sm text-muted">Is this right? Tips are only as good as your categories.</p>
        </div>
        <button type="button" onClick={() => setOpen(true)} className="btn">Check them</button>
      </section>
    );
  return (
    <section className="card px-5 md:px-6 pt-5 pb-1" aria-labelledby="check-title">
      <div id="check-title" className="card-title">{head}</div>
      <p className="text-sm text-muted mt-1">Is this right? Tips are only as good as your categories.</p>
      <button type="button" onClick={sortWithAI} className="btn inline-flex items-center gap-1.5 mt-3"><Sparkles size={15} /> Ask AI to sort these</button>
      <ul className="mt-2">{checks.rows.map((t) => <CheckItem key={t.id} t={t} cats={cats} onAnswer={onAnswer} />)}</ul>
      {checks.rows.length < checks.total && (
        <div className="flex flex-wrap items-center justify-between gap-3 py-4 border-t border-line">
          <span className="text-sm text-muted tabular">Showing {checks.rows.length} of {checks.total}</span>
          <button type="button" onClick={showMore} disabled={loading} className="btn">{loading ? "Loading..." : `Show ${Math.min(20, checks.total - checks.rows.length)} more`}</button>
        </div>
      )}
    </section>
  );
}
