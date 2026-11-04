import { HeartPulse, Landmark, PiggyBank, Receipt } from "lucide-react";
import { AskButton } from "@/components/Assistant";
import { Contributions } from "@/components/Contributions";
import { IdleCash } from "@/components/IdleCash";
import { MatchCheck } from "@/components/MatchCheck";
import { ProfileForm, type Profile } from "@/components/ProfileForm";
import { countryOf, type Country } from "@/lib/countries";
import { getUser } from "@/lib/data";

const SAVINGS = { icon: PiggyBank, title: "Savings", q: "How big should my emergency fund be given my spending, and where should I keep it?" };
const US_TOPICS = [
  { icon: Receipt, title: "Taxes", q: "Based on my profile and state, what are the biggest ways I could lower my taxes this year?" },
  { icon: HeartPulse, title: "HSA", q: "Am I eligible for an HSA, how much can I put in this year, and is it worth it for me?" },
  { icon: Landmark, title: "Retirement", q: "Am I getting my full 401(k) match, and should I be using a Roth IRA or traditional IRA?" },
  SAVINGS,
];
// The local tax-advantaged accounts, by tax module.
const ACCOUNTS: Record<string, string> = { nz: "KiwiSaver", au: "super", uk: "ISA and pension", ca: "RRSP and TFSA", in: "PPF and NPS", ie: "pension" };
const topics = (c: Country) =>
  c.tax === "us" ? US_TOPICS : [
    { icon: Receipt, title: "Taxes", q: `Based on my profile, what are the biggest ways I could lower my taxes in ${c.name} this year?` },
    { icon: Landmark, title: "Retirement", q: ACCOUNTS[c.tax]
      ? `How much should I put into my ${ACCOUNTS[c.tax]} this year, and am I getting everything my employer and the government add?`
      : `Which tax-advantaged retirement or savings accounts can I use in ${c.name}, and how much should I put in?` },
    SAVINGS,
  ];

export default async function Optimize() {
  const { user } = await getUser();
  const profile = (user?.user_metadata?.profile ?? {}) as Profile & { country?: string };
  const country = countryOf(profile.country);

  return (
    <div className="grid grid-cols-1 gap-6 @5xl:grid-cols-[1.6fr_1fr] items-start">
      <ProfileForm initial={profile} />
      <div className="space-y-3">
        <Contributions profile={profile} />
        {country.tax === "us" && <MatchCheck />}
        <IdleCash />
        <div className="section-label px-1">Ask about one thing</div>
        <section className="card overflow-hidden">
          {topics(country).map(({ icon: Icon, title, q }) => (
            <AskButton key={title} q={q} className="w-full flex items-start gap-4 px-5 py-4 border-b border-line last:border-0 text-left row-hover">
              <span className="size-9 rounded-full bg-brand-soft text-brand grid place-items-center shrink-0"><Icon size={17} /></span>
              <span>
                <span className="block font-medium">{title}</span>
                <span className="block text-sm text-muted">{q}</span>
              </span>
            </AskButton>
          ))}
        </section>
        <p className="text-xs text-muted px-1 leading-relaxed">
          General education, not financial or tax advice. The AI checks current limits on the web, but confirm big decisions with a tax professional.
        </p>
      </div>
    </div>
  );
}
