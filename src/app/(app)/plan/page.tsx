import { EmptyBank } from "@/components/EmptyBank";
import { MoneyPlan, type PlanState } from "@/components/MoneyPlan";
import { PlanChat } from "@/components/PlanChat";
import { PlanContext } from "@/components/PlanContext";
import { getUser, today, typicalMonthly } from "@/lib/data";
import { money0, ymd } from "@/lib/format";
import { loadPlan } from "@/lib/plan-facts";

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
  const profile = meta.profile ?? {};
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
      {/* The plan, written by your AI from your accounts, then a place to talk it through. */}
      <div className="space-y-6">
        <MoneyPlan initial={JSON.parse(JSON.stringify(state)) as PlanState} today={ymd(now)} name={name} />
        <PlanContext initial={typeof profile.notes === "string" ? profile.notes : ""} />
        <PlanChat />
      </div>
    </>
  );
}
