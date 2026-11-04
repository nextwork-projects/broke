// Exchange rates for totals across currencies: ECB reference rates from Frankfurter (free, no key).
// Checked live 2026-10-22: https://api.frankfurter.dev/v1/latest (api.frankfurter.app now redirects there).
// ECB covers about 30 currencies (not AED, for one); SQL leaves the rest out and fx_missing() names them.
// Stored against EUR in public.exchange_rates (migration 0015); public.fx() crosses through EUR.
// No "@/" imports so the test runs with plain node.
import type { SupabaseClient } from "@supabase/supabase-js";

const API = "https://api.frankfurter.dev/v1";
const HISTORY_DAYS = 730; // Plaid returns up to 24 months of transactions

type Range = { base: string; rates: Record<string, Record<string, number>> };
export const rateRows = (j: Range) =>
  Object.entries(j.rates).flatMap(([date, q]) => Object.entries(q).map(([quote, rate]) => ({ date, base: j.base, quote, rate })));

const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);

let checked = "";
let running: Promise<void> = Promise.resolve();
// Stores the days since the newest stored rate (2 years back on the first run), once a day per server process.
// ponytail: per-process memo; a cron would do it once for every server if there are many.
export function ensureRates(admin: SupabaseClient, today = new Date().toISOString().slice(0, 10)) {
  if (checked === today) return running;
  checked = today;
  return (running = (async () => {
    const { data, error } = await admin.from("exchange_rates").select("date").eq("base", "EUR").order("date", { ascending: false }).limit(1);
    if (error) throw new Error(error.message);
    const last = data?.[0]?.date as string | undefined;
    if (last === today) return;
    const res = await fetch(`${API}/${last ? addDays(last, 1) : addDays(today, -HISTORY_DAYS)}..?base=EUR`, { cache: "no-store" });
    if (res.status === 404) return; // nothing newer yet (weekend, holiday, before 16:00 CET)
    if (!res.ok) throw new Error(`frankfurter ${res.status}`);
    const rows = rateRows(await res.json());
    for (let i = 0; i < rows.length; i += 1000) {
      const { error: e } = await admin.from("exchange_rates").upsert(rows.slice(i, i + 1000));
      if (e) throw new Error(e.message);
    }
  })().catch((e) => console.error("[broke] exchange rates:", e instanceof Error ? e.message : e)));
}
