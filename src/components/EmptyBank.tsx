import Link from "next/link";
import { DemoBankButton } from "@/components/DemoBank";
import { FeedConnect } from "@/components/FeedConnect";
import { ImportStatement } from "@/components/ImportStatement";
import { AkahuButton, LinkBankButton, TestModeNote } from "@/components/PlaidButtons";
import { countryOf } from "@/lib/countries";
import { getUser } from "@/lib/data";
import { addChoices } from "@/lib/providers";

// The one empty state for "no bank data yet": says what the page will show and gives the next step.
// Users with only investment accounts get copy that fits what they have.
export async function EmptyBank({ title = "Link an account to get started", body = "broke reads your transactions through Plaid, with bank-level encryption.", children }: { title?: string; body?: string; children?: React.ReactNode }) {
  const { supabase, user } = await getUser();
  const { data } = await supabase.from("accounts").select("user_id, type");
  const own = (data ?? []).filter((a) => a.user_id === user?.id);
  const country = countryOf(user?.user_metadata?.profile?.country);
  const choices = addChoices(country.code); // the same choices as /accounts/add
  const investOnly = !!own.length && own.every((a) => a.type === "investment");
  return (
    <div className="card p-10 max-w-xl mx-auto mt-6 text-center space-y-5">
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p className="text-sm text-muted">
        {investOnly ? "Your linked accounts are investments. Spending and budgets come from a bank or card, or from transactions you add by hand." : body}
      </p>
      <div className="flex flex-col items-center gap-3">
        {choices.feeds.map((f) => <FeedConnect key={f} id={f} country={country.code} />)}
        {choices.bank === "akahu" && <AkahuButton primary />}
        {choices.bank === "plaid" && <LinkBankButton label={investOnly ? "Link a bank or card" : "Link a bank"} primary />}
        {choices.sandbox && <LinkBankButton sandbox label="Use a test bank (sandbox)" />}
        {choices.sandbox && <TestModeNote />}
        {choices.demo && <DemoBankButton primary={!choices.bank && !choices.feeds.length} />}
        <ImportStatement accounts={[]} locale={country.locale} currency={country.currency} />
        {children ?? (investOnly && <Link href="/transactions" className="text-sm underline underline-offset-2">Add a transaction by hand</Link>)}
        <Link href="/accounts/add" className="text-sm text-muted underline underline-offset-2 hover:text-ink">More ways to add an account</Link>
      </div>
    </div>
  );
}
