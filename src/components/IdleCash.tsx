import { myCashInsights } from "@/lib/cash";
import { money0 } from "@/lib/format";
import { BANK_APY, HYSA_APY } from "@/lib/insights";

const pct = (r: number) => `${+(r * 100).toFixed(1)}%`;

// Checking and savings above 3 months of spending, and what it would earn in a high-yield account.
export async function IdleCash() {
  const { idle, monthlySpend } = await myCashInsights();
  return (
    <section className="card p-6 space-y-3">
      <div className="card-title">Idle Cash</div>
      {!idle ? (
        <p className="text-sm text-muted">Not enough spending history yet to check this.</p>
      ) : idle.excess > 0 ? (
        <>
          <div className="figure">{money0(idle.excess)}</div>
          <p className="text-sm">
            {money0(idle.excess)} sits above 3 months of spending. At {pct(HYSA_APY)} that&apos;s about {money0(idle.hysa)} a year.
            A typical bank pays about {pct(BANK_APY)}, or {money0(idle.bank)}.
          </p>
          <p className="text-xs text-muted leading-relaxed">
            You spend about {money0(monthlySpend)} a month, so 3 months is {money0(idle.cushion)}. {pct(HYSA_APY)} is a typical high-yield savings rate, not a quote. If your savings already earns that, skip this.
          </p>
        </>
      ) : (
        <p className="text-sm">
          Your {money0(idle.cash)} {idle.available ? "available " : ""}in {idle.where} is under 3 months of spending ({money0(idle.cushion)}). Nothing sits idle.
          {Math.round(idle.current) > Math.round(idle.cash) && <> The {idle.where} balance is {money0(idle.current)}.</>}
        </p>
      )}
    </section>
  );
}
