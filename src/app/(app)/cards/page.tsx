import Link from "next/link";
import { CardArt } from "@/components/CardArt";
import { YourCards } from "@/components/YourCards";
import { ApplyButton, CardList, CreditPicker, type Row } from "@/components/CardList";
import { Merchant } from "@/components/Merchant";
import { bestFit, bonusText, CAT_LABEL, CHECKED, feeText } from "@/lib/cards";
import { bandLabel, creditOf } from "@/lib/credit";
import { cardMatches } from "@/lib/cards-data";
import { countryOf } from "@/lib/countries";
import { getUser } from "@/lib/data";
import { money0 } from "@/lib/format";

const checked = new Date(CHECKED + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export default async function Cards() {
  const { supabase, user } = await getUser();
  const profile = (user?.user_metadata?.profile ?? {}) as Record<string, unknown>;
  const country = countryOf(profile.country as string | undefined);
  if (!country.cards)
    return (
      <section className="card p-6 space-y-2 max-w-2xl">
        <div className="card-title">Cards are US-only for now</div>
        <p className="text-sm text-muted">This page compares US credit cards, so it doesn&apos;t fit {country.name === "Somewhere else" ? "where you live" : country.name} yet.</p>
      </section>
    );
  const credit = creditOf(profile);
  const band = credit && credit.band !== "unsure" ? credit.band : null;
  const m = await cardMatches(supabase, user!.id, band);
  // RegExp can't cross to the client.
  const rows: Row[] = m.fits.map((f) => ({ ...f, card: { ...f.card, match: undefined } }));
  const best = bestFit(rows);

  return (
    <div className="space-y-6 max-w-4xl">
      <YourCards mine={m.mine} spend={m.spend} />
      <section className="card p-6 space-y-4">
        <div className="card-title">{m.mine.length ? "Best new card for your spending" : "Best card for your spending"}</div>
        {band ? (
          <p className="text-sm text-muted">
            Picked from cards that fit your credit range: {bandLabel(band)}. <Link href="/optimize#profile" className="text-ink underline underline-offset-2 hover:opacity-70">Change</Link>
          </p>
        ) : (
          <CreditPicker profile={profile} />
        )}
        {!m.hasHistory ? (
          <p className="text-sm text-muted">Link a bank with some spending to see which card fits. Until then the list below uses no spending.</p>
        ) : !best ? (
          <p className="text-sm text-muted">None of the cards below fit your credit range yet.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-start gap-4 justify-between">
              <div className="flex flex-col @md:flex-row gap-4 @md:gap-5">
              <CardArt card={best.card} w="w-40" />
              <div>
                <div className="text-sm text-muted flex items-center gap-1.5"><Merchant name={best.card.issuer} small />{best.card.issuer}</div>
                <div className="text-lg font-semibold">{best.card.name}</div>
                <div className="text-sm text-muted mt-3">You&apos;d earn about</div>
                <div className="figure">{money0(best.ongoing)}<span className="text-base font-normal tracking-normal text-muted"> a year</span></div>
                <p className="text-sm text-muted">
                  {best.card.currency === "cash back" ? "Cash back" : "Rewards, valued in dollars,"} on the {money0(best.byCat.reduce((s, x) => s + x.spend, 0))} you spend a year{best.card.fee || best.card.feeYear1 ? `, after the annual fee (${feeText(best.card).toLowerCase()})` : ""}.
                </p>
                <p className="text-sm text-muted">First year: {money0(best.yearOne)}. {bonusText(best).join(" ")}</p>
              </div>
              </div>
              <ApplyButton card={best.card} primary />
            </div>
            <table className="w-full text-sm tabular">
              <thead>
                <tr className="text-left text-muted"><th className="font-normal py-1.5">Category</th><th className="font-normal text-right">Spend a year</th><th className="font-normal text-right">Rate</th><th className="font-normal text-right">You&apos;d earn</th></tr>
              </thead>
              <tbody>
                {best.byCat.sort((a, b) => b.spend - a.spend).map((x) => (
                  <tr key={x.cat} className="border-t border-line">
                    <td className="py-1.5">{CAT_LABEL[x.cat]}</td>
                    <td className="text-right">{money0(x.spend)}</td>
                    <td className="text-right">{x.rate}{best.card.currency === "cash back" ? "%" : "x"}</td>
                    <td className="text-right">{money0(x.earn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {m.ownedEarn != null && (
              <p className="text-sm">Your current cards ({m.owned.map((c) => c.name).join(", ")}) earn about {money0(m.ownedEarn)} a year on this spending.</p>
            )}
            {m.creditAccounts > 0 && !m.owned.length && <p className="text-xs text-muted">We couldn&apos;t tell which cards your linked credit accounts are, so none are left out below.</p>}
          </>
        )}
      </section>

      <div className="section-label px-1">All cards</div>
      <CardList rows={rows} />

      <div className="text-xs text-muted px-1 leading-relaxed space-y-2">
        {rows.some((r) => r.card.referral) && (
          <p>Some Apply buttons are referral links. The person who shared them may earn points or cash. Your offer comes from the issuer and can differ from the public one.</p>
        )}
        <p>
          Estimates use your spending from the last 12 months (scaled up if you have less) and treat 1 point as 1 cent. Bonus categories that only partly match how broke sorts spending are counted at the base rate.
          This is not financial advice. Approval depends on your credit. Terms checked on the issuers&apos; pages on {checked}; offers change, so read the issuer&apos;s page before you apply.
        </p>
      </div>
    </div>
  );
}
