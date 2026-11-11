import Link from "next/link";
import { AddAccounts } from "@/components/AddAccounts";
import { LinkedNow } from "@/components/LinkedNow";
import { countryOf, wantsAkahu } from "@/lib/countries";
import { getUser } from "@/lib/data";
import { addChoices } from "@/lib/providers";

// A page, not a modal: Plaid Link draws its own overlay, and an open <dialog> would make it inert.
export default async function AddAccountsPage({ searchParams }: { searchParams: Promise<{ connect?: string }> }) {
  const { supabase, user } = await getUser();
  const { connect } = await searchParams;
  const country = countryOf(user?.user_metadata?.profile?.country);
  const choices = addChoices(country.code, wantsAkahu(user?.user_metadata?.profile));
  const { data: manual } = await supabase.from("accounts").select("id, name, custom_name, mask").eq("manual", true).eq("user_id", user!.id);
  const accounts = (manual ?? []).map((a) => ({ id: a.id, label: `${a.custom_name || a.name}${a.mask ? ` ··${a.mask}` : ""}` }));
  return (
    <div className="space-y-6 max-w-4xl">
      <Link href="/accounts" className="inline-block text-sm text-muted hover:text-ink px-1">Back to accounts</Link>
      <LinkedNow userId={user!.id} profile={user?.user_metadata?.profile} />
      {connect === "done" && <p className="card px-5 py-3 text-sm" role="status">Your bank is connected. Its transactions are on the way.</p>}
      {connect === "cancelled" && <p className="card px-5 py-3 text-sm" role="status">The connection was cancelled. Nothing changed.</p>}
      {connect === "failed" && <p className="card px-5 py-3 text-sm text-bad" role="alert">That bank didn&apos;t connect. Try again, or import a statement instead.</p>}
      {!choices.bank && !choices.plaidMissing && !choices.feeds.length && !choices.akahuMissing && !choices.alsoAkahu && <p className="text-sm text-muted px-1">Automatic bank linking isn&apos;t available in {country.name} yet. Import a statement from your bank instead: it takes a minute and works with any bank.</p>}
      <AddAccounts choices={choices} accounts={accounts} locale={country.locale} currency={country.currency} country={country.code} />
      {choices.akahuMissing && (
        <p className="text-sm text-muted px-1">To sync NZ banks automatically, add Akahu keys on the <a href="/setup" className="underline underline-offset-2">Setup page</a>. Until then, import a statement from your bank.</p>
      )}
    </div>
  );
}
