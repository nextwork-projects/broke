import { Check, CircleHelp, X } from "lucide-react";
import Link from "next/link";
import { Merchant } from "@/components/Merchant";
import { KIND_LABEL, type Match, type OfferKind, type Verdict } from "@/lib/bonuses";
import { myBonuses } from "@/lib/bonuses-data";

const MARK: Record<Verdict, { icon: typeof Check; label: string; tone: string }> = {
  yes: { icon: Check, label: "You qualify", tone: "text-good" },
  maybe: { icon: CircleHelp, label: "Check first", tone: "text-muted" },
  no: { icon: X, label: "Not for you now", tone: "text-muted" },
};

function Row({ name, by, logo, bonus, net, verdict, why, notes, need, href, cta }: { name: string; by: string; logo?: string; bonus: string; net: string; verdict: Verdict; why: string[]; notes: string[]; need: string; href: string; cta: string }) {
  const m = MARK[verdict], Icon = m.icon;
  return (
    <li className={`p-5 flex flex-col @md:flex-row gap-4 @md:items-start ${verdict === "no" ? "opacity-60" : ""}`}>
      <Merchant name={logo ?? by} />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">{name}</span>
          <span className="text-sm text-muted">{by}</span>
        </div>
        <p className="text-sm">{need}</p>
        <p className={`text-sm flex items-center gap-1.5 ${m.tone}`}><Icon size={14} className="shrink-0" />{m.label}</p>
        <ul className="text-sm text-muted space-y-0.5">{why.map((w) => <li key={w}>{w}</li>)}</ul>
        {!!notes.length && (
          <details className="text-sm text-muted">
            <summary className="cursor-pointer hover:text-ink w-fit">Fees and fine print</summary>
            <ul className="space-y-0.5 pt-1">{notes.map((w) => <li key={w}>{w}</li>)}</ul>
          </details>
        )}
      </div>
      <div className="flex @md:flex-col items-center @md:items-end justify-between gap-3 shrink-0">
        <div className="@md:text-right">
          <div className="text-lg font-semibold tabular">{bonus}</div>
          {net !== bonus && <div className="text-xs text-muted tabular">You keep about {net}</div>}
        </div>
        <a href={href} target="_blank" rel="noopener noreferrer" className={verdict === "yes" ? "btn-primary" : "btn"}>{cta}</a>
      </div>
    </li>
  );
}

// Offers that fit (or might) first; the ones that don't fold away under one line.
function Section({ title, sub, fits, rest, empty }: { title: string; sub: string; fits: React.ReactNode[]; rest: React.ReactNode[]; empty: string }) {
  return (
    <section className="card overflow-hidden">
      <div className="p-5 pb-3">
        <div className="card-title">{title}</div>
        <p className="text-sm text-muted mt-0.5">{sub}</p>
      </div>
      {fits.length ? <ul className="divide-y divide-line border-t border-line">{fits}</ul> : <p className="px-5 pb-4 text-sm text-muted">{empty}</p>}
      {!!rest.length && (
        <details className="border-t border-line">
          <summary className="px-5 py-3.5 text-sm text-muted cursor-pointer hover:text-ink">{rest.length} more that don&apos;t fit you now</summary>
          <ul className="divide-y divide-line border-t border-line">{rest}</ul>
        </details>
      )}
    </section>
  );
}

const split = <T extends { verdict: Verdict }>(rows: T[], row: (r: T) => React.ReactNode) => ({ fits: rows.filter((r) => r.verdict !== "no").map(row), rest: rows.filter((r) => r.verdict === "no").map(row) });

export default async function Bonuses() {
  const b = await myBonuses();
  const count = (ms: { verdict: Verdict }[]) => ms.filter((m) => m.verdict === "yes").length;
  const kinds = (["checking", "savings", "brokerage"] as OfferKind[]).map((k) => ({ k, rows: b.accounts.filter((m) => m.offer.kind === k) }));
  const accountRow = (m: Match) => (
    <Row key={m.offer.id} name={m.offer.product} by={m.offer.institution} bonus={b.money(m.bonus)} net={b.money(m.net)} verdict={m.verdict} why={m.why} notes={m.notes}
      need={`${m.offer.requirement}${m.offer.expires ? ` Ends ${new Date(m.offer.expires + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}.` : ""}`}
      href={m.offer.url} cta="See the offer" />
  );
  const noOffers = !b.accounts.length && !b.cards?.length;

  return (
    <div className="space-y-6 max-w-4xl">
      <section className="card p-6 space-y-2">
        <div className="text-sm text-muted">Sign-up bonuses you could get now</div>
        <div className="figure">{b.money(b.total)}</div>
        <p className="text-sm text-muted">
          {noOffers
            ? `broke has no bonus list for ${b.country.name} yet.`
            : `From ${count(b.accounts) + count(b.cards ?? [])} offers you qualify for today, after fees${b.country.code === "US" ? " and federal tax" : ""}. Open one at a time and finish its steps before the next.`}
        </p>
        {b.later > b.total && <p className="text-sm">Up to <span className="font-semibold tabular">{b.money(b.later)}</span> once the first steps of your plan are done.</p>}
        {(b.who.carrying || !b.who.cushion) && !noOffers && (
          <p className="text-sm">
            {b.who.carrying ? "You're paying card interest, so bonuses wait until that's paid off." : "Bonuses wait until your starter emergency fund is built."}{" "}
            <Link href="/plan" className="underline underline-offset-2">See your plan</Link>
          </p>
        )}
      </section>

      {b.cards && (
        <Section title="Credit cards" sub="Bonuses for spending you already do. Only cards inside your credit range." empty="No card bonuses fit you right now."
          {...split(b.cards, (c) => (
            <Row key={c.fit.card.id} name={c.fit.card.name} by={c.fit.card.issuer} bonus={b.money(c.fit.bonus!)} net={b.money(c.net)} verdict={c.verdict} why={c.why} notes={c.notes}
              need={`Spend ${b.money(c.fit.card.bonus!.minSpend)} in the first ${c.fit.card.bonus!.months} months.`} href={c.fit.card.referral ?? c.fit.card.url} cta="Apply" />
          ))} />
      )}
      {kinds.filter((x) => x.rows.length).map(({ k, rows }) => (
        <Section key={k} title={KIND_LABEL[k]} sub={k === "brokerage" ? "Bonuses for opening or moving investments. Moving money in may have its own fees." : "Bonuses for opening an account and moving money or your pay into it."}
          empty="None of these fit you right now." {...split(rows, accountRow)} />
      ))}

      <div className="text-xs text-muted px-1 leading-relaxed space-y-2">
        <p>
          broke checks each offer on the bank&apos;s own page and shows the date it did. Offers change often: read the terms on their page before you open anything.
          {b.country.code === "US" ? " US bank and investing bonuses count as taxable income. Opening many bank accounts can show up on your ChexSystems report." : ""} This is not financial advice.
        </p>
        {b.cards?.some((c) => c.fit.card.referral) && <p>Some Apply buttons are referral links. The person who shared them may earn points or cash.</p>}
      </div>
    </div>
  );
}
