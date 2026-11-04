"use client";

import { Ban, NotebookPen, Trash2, Wand2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Dropdown } from "@/components/Dropdown";
import { CategoryIcon } from "@/components/Icons";
import { Merchant } from "@/components/Merchant";
import { Modal } from "@/components/Modal";
import { categoryOptions, emptyRule, RuleDialog, type Draft } from "@/components/RuleForm";
import { TagButton, TagChip, TagEditor } from "@/components/Tags";
import { toast } from "@/components/Toast";
import type { Category, Txn } from "@/lib/data";
import { displayName } from "@/lib/format";
import { createClient } from "@/utils/supabase/client";
import { useMoney } from "@/components/Money";

type Patch = Partial<Pick<Txn, "category_id" | "note" | "ignored" | "tags">> & { checked_at?: string };

export function TxnRow({ t, cats, allTags = [], to }: { t: Txn; cats: Category[]; allTags?: string[]; to?: string }) {
  const { dayLabel, dateLabel, signed } = useMoney();
  const router = useRouter();
  const [ignored, setIgnored] = useState(t.ignored);
  const [noteOpen, setNoteOpen] = useState(!!t.note);
  const [catId, setCatId] = useState(t.category_id ?? "");
  const [sheet, setSheet] = useState(false);
  const [rule, setRule] = useState<Draft | null>(null);
  const [tags, setTags] = useState(t.tags ?? []);
  const actions = useRef<HTMLTableCellElement>(null);
  const name = displayName(t);
  // A partner's shared row is read-only here: RLS lets you see it, not change it.
  const mine = !t.account?.owner_label;
  const cat = cats.find((c) => c.id === catId);
  const label = (id: string) => cats.find((c) => c.id === id)?.label ?? "Uncategorized";
  const options = [{ value: "", label: "Uncategorized", icon: <CategoryIcon size={26} /> }, ...categoryOptions(cats)];
  // A new rule starts from this merchant ("Uber", not "UBER *TRIP 8812") and the category it has now.
  const newRule = (category_id = catId) => setRule(emptyRule({ match: t.merchant_name ?? t.name, category_id: category_id || null }));
  const ruleLink = (
    <button type="button" onClick={() => newRule()} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm hover:bg-[var(--hover)]">
      <Wand2 size={16} className="text-muted" /> Create a rule for {t.merchant_name ?? name}
    </button>
  );

  // Optimistic: the screen and the toast change at once, the write runs behind it, and a failure puts it back.
  // Only edits that change totals re-render the page from the server. RLS blocks with 0 rows, not an error.
  function save(patch: Patch, rollback: () => void, refresh = false) {
    createClient().from("transactions").update(patch).eq("id", t.id).select("id").then(({ data, error }) => {
      if (error || !data?.length) {
        rollback();
        toast("Couldn't save that. Try again.");
      } else if (refresh) router.refresh();
    });
  }

  function setCategory(next: string) {
    const prev = catId;
    setCatId(next);
    // A category picked by hand is a checked one: "Is this right?" stops asking about it (checked_at, 0023).
    save({ category_id: next || null, checked_at: new Date().toISOString() }, () => setCatId(prev));
    toast(
      `${name} moved to ${label(next)}`,
      () => {
        setCatId(prev);
        save({ category_id: prev || null }, () => setCatId(next));
      },
      next ? { label: "Always", run: () => newRule(next) } : undefined,
    );
  }

  function saveTags(next: string[]) {
    const prev = tags;
    setTags(next);
    save({ tags: next }, () => setTags(prev));
    toast(next.length ? `Tags saved for ${name}` : `Tags removed from ${name}`, () => {
      setTags(prev);
      save({ tags: prev }, () => setTags(next));
    });
  }

  async function remove() {
    const { data, error } = await createClient().from("transactions").delete().eq("id", t.id).select("id");
    if (error || !data?.length) return toast("Couldn't delete that.");
    setSheet(false);
    toast(`${name} deleted`);
    router.refresh();
  }

  function toggleIgnore() {
    const next = !ignored;
    setIgnored(next);
    save({ ignored: next }, () => setIgnored(!next), true);
    toast(next ? `${name} hidden from totals` : `${name} counted again`, () => {
      setIgnored(!next);
      save({ ignored: !next }, () => setIgnored(next), true);
    });
  }


  // On narrow layouts the category and action columns are hidden, so tapping the row opens a sheet instead.
  const narrow = () => !!actions.current && getComputedStyle(actions.current).display === "none";

  return (
    <tr
      onClick={(e) => narrow() && !(e.target as HTMLElement).closest("input,button,select") && setSheet(true)}
      className={`row-hover border-b border-line last:border-0 ${ignored ? "text-muted" : ""}`}
    >
      <td className="pl-4 @2xl:pl-6 pr-2 py-3 tabular">{dateLabel(t.date, { month: "numeric", day: "numeric" })}</td>
      <td className="px-2 py-3">
        <div className="flex items-center gap-3">
          <Merchant name={name} logo={t.logo_url} color={cat?.color} icon={cat?.icon} />
          <div className="min-w-0">
            <div className="truncate max-w-28 @md:max-w-48 @2xl:max-w-72">{name}</div>
            {to && <div className="text-xs text-muted">To {to}</div>}
            {(t.pending || t.manual) && <div className="text-xs text-muted">{t.pending ? "Pending" : mine ? "Added by you" : `Added by ${t.account?.owner_label}`}</div>}
            {!!tags.length && <div className="flex flex-wrap gap-1 mt-1">{tags.map((g) => <TagChip key={g} tag={g} />)}</div>}
            {!mine && t.note && <div className="mt-1 text-xs text-muted">{t.note}</div>}
            {mine && noteOpen && (
              <input
                defaultValue={t.note ?? ""}
                autoFocus={!t.note}
                placeholder="Add a note"
                aria-label={`Note for ${name}`}
                onBlur={(e) => e.target.value !== (t.note ?? "") && (save({ note: e.target.value || null }, () => {}), toast("Note saved"))}
                className="mt-1 text-xs border-b border-line focus:border-ink w-56 bg-transparent"
              />
            )}
          </div>
        </div>
      </td>
      <td className="px-2 py-3 hidden @2xl:table-cell">
        {mine ? <Dropdown
          variant="inline"
          label={`Category for ${name}`}
          value={catId}
          options={options.map((o) => (o.value === catId ? { ...o, icon: <CategoryIcon icon={cat?.icon} color={cat?.color} size={30} /> } : o))}
          onChange={setCategory}
          searchable
          footer={ruleLink}
        /> : <span className="inline-flex items-center gap-2.5"><CategoryIcon icon={cat?.icon} color={cat?.color} size={30} />{label(catId)}</span>}
        {rule && <RuleDialog initial={rule} cats={cats} allTags={allTags} onClose={() => setRule(null)} onDone={(msg) => { setRule(null); toast(msg); router.refresh(); }} />}
      </td>
      <td ref={actions} className="px-2 py-3 hidden @2xl:table-cell">
        {mine && <div className="flex gap-1 text-muted">
          <TagButton tags={tags} all={allTags} label={`Tags for ${name}`} onSave={saveTags} />
          <button title="Add a note" aria-label={`Add a note to ${name}`} onClick={() => setNoteOpen(true)} className={`p-2.5 rounded-lg hover:bg-[var(--hover)] hover:text-ink ${t.note ? "text-ink" : ""}`}><NotebookPen size={17} /></button>
          <button
            title={ignored ? "Count in totals again" : "Hide from totals"}
            aria-label={ignored ? `Count ${name} in totals again` : `Hide ${name} from totals`}
            aria-pressed={ignored}
            onClick={toggleIgnore}
            className={`p-2.5 rounded-lg hover:bg-[var(--hover)] ${ignored ? "text-bad" : "hover:text-ink"}`}
          >
            <Ban size={17} />
          </button>
          {t.manual && <button title="Delete" aria-label={`Delete ${name}`} onClick={remove} className="p-2.5 rounded-lg hover:bg-[var(--hover)] hover:text-bad"><Trash2 size={17} /></button>}
        </div>}
      </td>
      <td className={`pl-2 pr-4 @2xl:pr-6 py-3 text-right tabular font-medium whitespace-nowrap ${t.amount < 0 ? "text-good" : ""} ${ignored ? "line-through text-muted" : ""}`}>
        {signed(t.amount, t.currency)}
        {sheet && renderSheet()}
      </td>
    </tr>
  );

  // A plain render function, not a component, so the inputs keep focus across re-renders.
  function renderSheet() {
    return (
      <Modal label={name} onClose={() => setSheet(false)} sheet className="space-y-5">
        <div className="flex items-center gap-3">
          <Merchant name={name} logo={t.logo_url} color={cat?.color} icon={cat?.icon} />
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{name}</div>
            <div className="text-xs text-muted">{dayLabel(t.date)}{t.account ? ` · ${t.account.name}${t.account.owner_label ? ` (${t.account.owner_label})` : ""}` : ""}</div>
          </div>
          <span className={`tabular font-semibold ${t.amount < 0 ? "text-good" : ""}`}>{signed(t.amount, t.currency)}</span>
          <button type="button" aria-label="Close" onClick={() => setSheet(false)} className="p-2.5 -mr-2 rounded-full hover:bg-[var(--hover)]"><X size={18} /></button>
        </div>
        {mine ? (
          <>
            <div className="space-y-1.5">
              <span className="block text-sm font-medium">Category</span>
              <Dropdown label="Category" value={catId} options={options} onChange={setCategory} placeholder="Uncategorized" searchable footer={ruleLink} />
            </div>
            <div className="space-y-1.5">
              <span className="block text-sm font-medium">Tags</span>
              <TagEditor value={tags} onChange={saveTags} all={allTags} />
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Note</span>
              <input
                defaultValue={t.note ?? ""}
                placeholder="Add a note"
                onBlur={(e) => e.target.value !== (t.note ?? "") && (save({ note: e.target.value || null }, () => {}), toast("Note saved"))}
                className="select"
              />
            </label>
            <button onClick={toggleIgnore} className="btn w-full !py-2.5">{ignored ? "Count in totals again" : "Hide from totals"}</button>
            {t.manual && <button onClick={remove} className="btn w-full !py-2.5 text-bad">Delete transaction</button>}
          </>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2.5"><CategoryIcon icon={cat?.icon} color={cat?.color} size={26} />{label(catId)}</div>
            {!!tags.length && <div className="flex flex-wrap gap-1">{tags.map((g) => <TagChip key={g} tag={g} />)}</div>}
            {t.note && <p className="text-muted">{t.note}</p>}
            <p className="text-xs text-muted">Shared by {t.account?.owner_label}. Only they can edit it.</p>
          </div>
        )}
      </Modal>
    );
  }
}
