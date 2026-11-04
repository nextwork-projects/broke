import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { RulesManager } from "@/components/RulesManager";
import { accountName, allRows, allTags, categories, getUser } from "@/lib/data";
import { matches, RULE_COLS, type Rule } from "@/lib/rules";

type Row = { name: string; merchant_name: string | null; amount: number; account_id: string; date: string };

export default async function Rules() {
  const { supabase, user } = await getUser();
  const [{ data, error }, cats, tags, { data: accts }, txns] = await Promise.all([
    supabase.from("rules").select(RULE_COLS).order("created_at", { ascending: false }),
    categories(),
    allTags(),
    supabase.from("accounts").select("id, name, custom_name, mask").eq("user_id", user!.id).order("name"),
    // Own rows only, paged past the 1000-row cap, so each count is every transaction the rule matches.
    // ponytail: counts in JS over every own row; move to SQL if a user reaches 100k+ transactions.
    allRows<Row>((from, to) => supabase.from("transactions").select("name, merchant_name, amount, account_id, date").eq("user_id", user!.id).order("id").range(from, to)),
  ]);
  const rules = (data ?? []) as Rule[];
  const counts = Object.fromEntries(rules.map((r) => [r.id, txns.filter((t) => matches(r, t)).length]));
  const accounts = (accts ?? []).map((a) => ({ id: a.id as string, label: `${accountName(a)}${a.mask ? ` ··${a.mask}` : ""}` }));
  return (
    <div className="space-y-5 max-w-3xl">
      <Link href="/transactions" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} /> Transactions</Link>
      <RulesManager rules={rules} counts={counts} cats={cats} allTags={tags} accounts={accounts} missing={!!error} />
    </div>
  );
}
