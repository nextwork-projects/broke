import { myCashInsights } from "@/lib/cash";
import { money0 } from "@/lib/format";
import { TAKE_HOME } from "@/lib/insights";

const range = ([a, b]: [number, number]) => (Math.round(a) === Math.round(b) ? `about ${money0(b)}` : a < 1 ? `up to about ${money0(b)}` : `about ${money0(a)} to ${money0(b)}`);
const ProfileLink = ({ children }: { children: string }) => <a href="#profile" className="underline underline-offset-4">{children}</a>;

// Employer 401(k) match vs what the user puts in, with pay estimated from their paychecks.
export async function MatchCheck() {
  const { match: m } = await myCashInsights();
  const notes = {
    "no-profile": <p className="text-sm">Pick your employer 401(k) match in <ProfileLink>your money profile</ProfileLink> to check if you get all of it.</p>,
    "not-sure": <p className="text-sm">Your profile says you&apos;re not sure about your 401(k) match. Your benefits portal or HR lists it. Then update <ProfileLink>your money profile</ProfileLink>.</p>,
    "no-plan": <p className="text-sm text-muted">Your profile says you have no 401(k) at work, so there is no match to check.</p>,
    "no-match": <p className="text-sm text-muted">Your profile says your 401(k) has no employer match, so there is nothing to miss.</p>,
    "no-pay": <p className="text-sm">No paychecks found yet. Add your income range to <ProfileLink>your money profile</ProfileLink> to estimate this.</p>,
  };
  let body;
  if (m.status !== "ok") body = notes[m.status];
  else {
    const [lo, hi] = m.cap;
    const cap = lo === hi ? `${hi}%` : `${lo}-${hi}%`;
    const head = `Your employer matches up to ${cap}${hi === 6 && lo === 6 ? " or more" : ""} of pay.`;
    const g = m.gaps[0].gap;
    body = (
      <>
        {m.pct != null ? (
          <p className="text-sm">
            {head} You put in about {Math.round(m.pct)}%, so {g[1] > 0 ? <>you&apos;re leaving <b>{range(g)}</b> a year.</> : "you get the full match."}
          </p>
        ) : (
          <>
            <p className="text-sm">{head} What you&apos;d leave on the table each year:</p>
            <div className="space-y-2 text-sm">
              {m.gaps.map(({ pct, gap }) => (
                <div key={pct} className="flex justify-between">
                  <span>If you put in {pct}%</span>
                  <span className="tabular font-medium">{range(gap)}</span>
                </div>
              ))}
              <div className="flex justify-between text-muted">
                <span>If you put in {hi}% or more</span>
                <span>full match</span>
              </div>
            </div>
          </>
        )}
        <p className="text-xs text-muted leading-relaxed">
          {m.source === "profile"
            ? `Pay is estimated at ${money0(m.gross)} from your household income range.`
            : `Pay is estimated at about ${money0(m.gross)} a year before tax. ${m.source === "income" ? `Your income is about ${money0((m.takeHome ?? 0) / 12)} a month, ${money0(m.takeHome)} a year` : `Your paychecks come to about ${money0(m.takeHome)} a year`}, and take-home is assumed to be ${TAKE_HOME * 100}% of pay.`}{" "}
          Assumes the match is dollar for dollar.
        </p>
      </>
    );
  }
  return (
    <section className="card p-6 space-y-3">
      <div className="card-title">401(k) Match</div>
      {body}
    </section>
  );
}
