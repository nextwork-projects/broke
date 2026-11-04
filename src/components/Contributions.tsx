import { ContributionInput } from "@/components/ContributionInput";
import type { Profile } from "@/components/ProfileForm";
import { countryOf, type Country } from "@/lib/countries";
import { getUser, today } from "@/lib/data";
import { money, money0, ymd } from "@/lib/format";
import { contributionRoom, type Room } from "@/lib/invest";

// Employer rules that are one plain line. NZ: ird.govt.nz/kiwisaver-changes; UK: gov.uk/workplace-pensions (checked 2026-10-22).
const AT_WORK: Record<string, string> = {
  nz: "At work, your employer must add 3.5% of your pay to KiwiSaver when you contribute.",
  uk: "At work, your employer must pay at least 3% into your workplace pension (8% in total with yours) on earnings between £6,240 and £50,270.",
};

// This tax year's contributions to tax-advantaged accounts against the limits for the user's country.
export async function Contributions({ profile }: { profile: Profile & { country?: string } }) {
  const { supabase, user } = await getUser();
  const country = countryOf(profile.country);
  const rows = await contributionRoom(supabase, profile, { tax: country.tax, today: ymd(await today()), locale: country.locale, mine: user?.user_metadata?.contributed });
  return <ContributionsCard rows={rows} profile={profile} country={country} />;
}

export function ContributionsCard({ rows, profile, country }: { rows: Room[]; profile: Profile; country: Country }) {
  if (!rows.length) return null;
  const us = country.tax === "us";
  // Limits are set in the country's own currency. $1,042.86 keeps its cents, $20,000 shows none.
  const m = (n: number) => (Math.round(n * 100) % 100 ? money : money0)(n, country.currency);
  const noHsa = us && profile.health && !profile.health.startsWith("High-deductible");

  return (
    <section className="card p-6 space-y-5">
      <div className="section-label">{us ? "Contributions this year" : "Contributions this tax year"}</div>
      {rows.map((r) => {
        const both = r.contributed != null && r.limit != null;
        return (
          <div key={r.kind} className="space-y-2">
            <div className="flex justify-between gap-3 text-sm">
              <span className="font-medium">{r.label}{!us && <span className="text-muted font-normal"> {r.year}</span>}</span>
              <span className="tabular text-muted text-right">
                {both ? `${m(r.contributed!)} of ${m(r.limit!)}` : r.contributed != null ? `${m(r.contributed)} put in` : r.limit != null ? `${r.goal ? "Target" : "Limit"} ${m(r.limit)}` : ""}
              </span>
            </div>
            {both && (
              <div className="h-2 rounded-full bg-canvas overflow-hidden">
                <div className="h-full rounded-full bg-chart" style={{ width: `${Math.min(1, r.contributed! / r.limit!) * 100}%` }} />
              </div>
            )}
            {r.left != null && (
              <p className="text-sm">
                {r.goal
                  ? r.left > 0 ? <>Put in <b className="tabular">{m(r.left)}</b> more by {r.deadline} to get the full government contribution.</> : "You'll get the full government contribution this year."
                  : r.left > 0 ? <>You have <b className="tabular">{m(r.left)}</b> of {r.label} room left {r.kind === "k401" ? `through payroll by ${r.deadline}` : `before ${r.deadline}`}.</>
                  : r.left < 0 ? <span className="text-bad">You&apos;re {m(-r.left)} over the {r.year} limit.{us ? " Ask your provider to return the extra." : ""}</span>
                  : `You've maxed your ${r.label} for ${r.year}.`}
              </p>
            )}
            {(r.note || (r.kind === "hsa" && noHsa)) && (
              <p className="text-xs text-muted">{[r.note, r.kind === "hsa" && noHsa ? "your health plan may not allow HSA contributions" : ""].filter(Boolean).join(". ")}</p>
            )}
            {r.from !== "linked" && <ContributionInput id={`${r.kind}:${r.year}`} label={r.label} value={r.contributed} />}
          </div>
        );
      })}
      {AT_WORK[country.tax] && <p className="text-sm">{AT_WORK[country.tax]}</p>}
      <p className="text-xs text-muted">
        {us
          ? "Counts deposits Plaid marks as contributions. A 401(k) employer match shows here too but doesn't count toward your limit."
          : `Counts deposits into linked accounts with ${rows.map((r) => r.label.split(" ")[0]).join(" or ").replace("Pension", "pension")} in the name, or what you add. Limits checked on government sites on 22 October 2026.`}
      </p>
    </section>
  );
}
