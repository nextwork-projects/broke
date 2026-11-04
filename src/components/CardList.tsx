"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CardArt } from "@/components/CardArt";
import { Dropdown } from "@/components/Dropdown";
import { Merchant } from "@/components/Merchant";
import { bonusText, CAT_LABEL, creditFirst, creditNote, feeText, type Card, type Fit } from "@/lib/cards";
import { BANDS } from "@/lib/credit";
import { useMoney } from "@/components/Money";
import { createClient, updateMeta } from "@/utils/supabase/client";

export type Row = Omit<Fit, "card"> & { card: Omit<Card, "match"> & { match?: undefined } };

const FILTERS = [["all", "All"], ["nofee", "No annual fee"], ["travel", "Travel"], ["cash", "Cash back"]] as const;
// The best three rates, in "3x Dining" form, with "%" for cash back.
const topRates = (c: Row["card"]) =>
  Object.entries(c.earn).sort((a, b) => b[1]!.rate - a[1]!.rate).slice(0, 3).map(([k, e]) => `${e!.rate}${c.currency === "cash back" ? "%" : "x"} ${CAT_LABEL[k as keyof typeof CAT_LABEL]}`);

export function ApplyButton({ card, primary }: { card: Row["card"]; primary?: boolean }) {
  return (
    <a href={card.referral ?? card.url} target="_blank" rel={card.referral ? "noopener noreferrer sponsored" : "noopener noreferrer"} className={`${primary ? "btn-primary" : "btn"} shrink-0 text-center`}>
      Apply
    </a>
  );
}

// The Cards page's one-line credit range question, shown while the profile has none (or "Not sure").
export function CreditPicker({ profile }: { profile: Record<string, unknown> }) {
  const router = useRouter();
  const [err, setErr] = useState(false);
  async function pick(credit: string) {
    const { error } = await updateMeta(createClient(), { data: { profile: { ...profile, credit } } });
    setErr(!!error);
    if (!error) router.refresh();
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm">Add your credit range for better matches.</span>
      <Dropdown label="Credit range" value={(profile.credit as string) ?? ""} options={BANDS} onChange={pick} placeholder="Choose your credit range" />
      {err && <span className="text-sm text-muted">Couldn&apos;t save that. Try again.</span>}
    </div>
  );
}

export function CardList({ rows }: { rows: Row[] }) {
  const { money0 } = useMoney();
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [sort, setSort] = useState("ongoing");
  const shown = rows
    .filter((r) => filter === "all" || (filter === "nofee" ? r.card.fee === 0 : r.card.kind === filter))
    .sort((a, b) => creditFirst(a, b) || (sort === "yearOne" ? b.yearOne - a.yearOne : b.ongoing - a.ongoing));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="pill-tabs overflow-x-auto max-w-full">
          {FILTERS.map(([v, label]) => (
            <button key={v} onClick={() => setFilter(v)} className={`pill-tab whitespace-nowrap ${filter === v ? "pill-tab-active" : ""}`}>{label}</button>
          ))}
        </div>
        <Dropdown label="Sort" value={sort} onChange={setSort} options={[{ value: "ongoing", label: "Most earned every year" }, { value: "yearOne", label: "Most earned in year one" }]} />
      </div>
      <section className="card overflow-hidden">
        {shown.map((r) => (
          <div key={r.card.id} className="px-5 py-4 border-b border-line last:border-0 flex flex-col @2xl:flex-row gap-3 @2xl:items-center">
            <div className="flex-1 min-w-0 flex gap-4 items-start">
            <CardArt card={r.card} w="w-16 @md:w-20" />
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{r.card.name}</span>
                <span className="text-sm text-muted inline-flex items-center gap-1.5 self-center"><Merchant name={r.card.issuer} small />{r.card.issuer}</span>
                {r.card.referral && <span className="text-xs text-muted border border-line rounded-full px-2">Referral link</span>}
              </div>
              <div className="text-sm">{feeText(r.card)} · {topRates(r.card).join(" · ")}</div>
              <div className="text-sm text-muted">{bonusText(r).join(" ")}</div>
              {r.card.credit === "building" && <div className="text-xs text-muted">For building or rebuilding credit.</div>}
              {r.fitsCredit === true && <div className="text-xs text-muted">Fits your credit range.</div>}
              {r.fitsCredit === false && <div className="text-xs font-medium">{creditNote(r.card)}</div>}
              {r.card.notes.length > 0 && <div className="text-xs text-muted leading-relaxed">{r.card.notes.join(" ")}</div>}
            </div>
            </div>
            <div className="flex items-center gap-4 @2xl:w-56 @2xl:justify-end">
              <div className="flex-1 @2xl:flex-none @2xl:text-right">
                <div className="text-xs text-muted">You&apos;d earn</div>
                <div className="font-semibold tabular">{money0(r.ongoing)}<span className="text-sm font-normal text-muted"> a year</span></div>
                <div className="text-xs text-muted tabular">{money0(r.yearOne)} in year one with the bonus</div>
              </div>
              <ApplyButton card={r.card} />
            </div>
          </div>
        ))}
        {!shown.length && <p className="px-5 py-4 text-sm text-muted">No cards in this group.</p>}
      </section>
    </div>
  );
}
