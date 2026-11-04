import { ChevronDown } from "lucide-react";
import { EmptyBank } from "@/components/EmptyBank";
import { NextMove } from "@/components/NextMove";
import { MoneyPlan, type PlanState } from "@/components/MoneyPlan";
import { PlanChat } from "@/components/PlanChat";
import { PlanContext } from "@/components/PlanContext";
import { PlanSummary } from "@/components/PlanSummary";
import { BillsOnCards } from "@/components/BillsOnCards";
import { Suspense } from "react";
import { countryOf } from "@/lib/countries";
import { getUser, today, typicalMonthly } from "@/lib/data";
import { money0, ymd } from "@/lib/format";
import { loadPlan, planFacts } from "@/lib/plan-facts";
import { laterOf, type Later } from "@/lib/projection";
import { marginalRate } from "@/lib/tax";

export default async function Plan() {
  const { supabase, user } = await getUser();
  const now = await today(); // the tz cookie, no database call
  const [state, { count }, typical] = await Promise.all([
    loadPlan(supabase, user!.id),
    supabase.from("accounts").select("id", { count: "exact", head: true }).eq("user_id", user!.id),
    typicalMonthly(supabase, user!.id, ymd(now)),
  ]);
  if (!count) return <EmptyBank title="Your money plan" body="Link a bank and broke ai audits your bills, subscriptions, cards and cash for moves that save or earn money." />;
  // The name drafts sign off with: the account's own name, else the start of the email ("sam.k@" -> "Sam").
  const meta = user!.user_metadata ?? {};
  const word = (user!.email ?? "").split("@")[0].match(/[a-z]+/i)?.[0] ?? "";
  const name = (meta.full_name || meta.name || (word && word[0].toUpperCase() + word.slice(1)) || "[Your name]") as string;
  // The payoff chart: the tax rate turns a contribution's tax saving back into the contribution (US only, like the tax moves).
  // Possible later needs the full facts, so they load only when a live move is gated or a fund is still to build.
  const profile = meta.profile ?? {};
  const taxRate = countryOf(profile.country).code === "US" ? marginalRate(profile).rate : null;
  const live = state.moves.filter((m) => m.status === "todo" || m.status === "doing");
  let later: Later | null = null;
  if (live.some((m) => m.gate || m.ref?.startsWith("fund:")))
    later = await planFacts(supabase, user!.id, profile, ymd(now)).then((f) => laterOf(f, live), (e) => { console.error("[broke] payoff facts:", e); return null; });
  // The savings rate, from the old For you page: the one thing on it the plan didn't already say.
  const rate = typical && typical.income > 0 ? (typical.income - typical.spend) / typical.income : null;
  return (
    <>
      {rate != null && (
        <p className="text-sm text-muted mb-5 max-w-3xl">
          In a typical month {money0(typical!.income)} comes in and {money0(typical!.spend)} goes out.{" "}
          {rate >= 0 ? <>You save {Math.round(rate * 100)}% of it.</> : <span className="text-bad">That&apos;s {money0(typical!.spend - typical!.income)} more out than in.</span>}
        </p>
      )}
      {/* One next move and a chat. The full plan is a click away for anyone who wants it. */}
      <Suspense fallback={<section className="card p-6 h-72 mb-6" aria-busy="true" />}><div className="mb-6"><NextMove /></div></Suspense>
      <div className="mb-6"><PlanChat /></div>
      <details className="group">
        <summary className="flex items-center gap-2 px-1 py-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden font-medium">
          <ChevronDown size={18} className="text-muted transition-transform group-open:rotate-180" /> See the full plan
        </summary>
        <div className="pt-4">
          <Suspense fallback={<section className="card p-6 h-48 mb-6" aria-busy="true" />}><PlanSummary today={ymd(now)} /></Suspense>
          <PlanContext initial={typeof profile.notes === "string" ? profile.notes : ""} />
          <MoneyPlan initial={JSON.parse(JSON.stringify(state)) as PlanState} today={ymd(now)} name={name} payoff={{ rate: taxRate, later }} />
          <Suspense fallback={<section className="card p-6 h-40 mt-6" aria-busy="true" />}><div className="mt-6"><BillsOnCards /></div></Suspense>
        </div>
      </details>
    </>
  );
}
