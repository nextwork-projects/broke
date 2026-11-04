import { money0 } from "@/lib/format";
import { EXPENSE_RATIO, feeCost30, INDEX_RATIO } from "@/lib/invest";

// A holding's expense ratio and its 30-year cost against a 0.03% index fund. Cash and money market rows show nothing.
export function HoldingFee({ ticker, type, value }: { ticker: string | null; type: string | null; value: number | null }) {
  if (type === "cash" || !ticker || /^(CASH|CUR:)/.test(ticker)) return null;
  const ratio = EXPENSE_RATIO[ticker.toUpperCase()];
  if (ratio == null) return <span>fee unknown</span>;
  const cost = feeCost30(Number(value ?? 0), ratio);
  return (
    <span title={`${ratio}% a year. Over 30 years at 7% growth, ${money0(cost)} more in fees than a ${INDEX_RATIO}% index fund on today's value.`}>
      fee {ratio}%{cost >= 1 && <> · <span className={cost >= 1000 ? "text-bad" : ""}>about {money0(cost)} more over 30 years</span></>}
    </span>
  );
}
