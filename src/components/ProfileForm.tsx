"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAssistant } from "@/components/Assistant";
import { CountryField } from "@/components/CountryPicker";
import { Dropdown } from "@/components/Dropdown";
import { GoalPicker } from "@/components/GoalPicker";
import { countryOf } from "@/lib/countries";
import { BANDS } from "@/lib/credit";
import { useMoney } from "@/components/Money";
import { createClient, updateMeta } from "@/utils/supabase/client";
import { profileFields, validGoalPlan, type GoalPlan } from "@/lib/advice";

export type Profile = {
  country?: string; currency?: string; // ISO codes; no country = US (countryOf)
  state?: string; // the country's region (regionLabel): a US state code, else what the user typed
  filing?: string; income?: string; age?: string; work?: string;
  match?: string; health?: string; hsaCover?: string; dependents?: string; risk?: string; goals?: string[]; notes?: string;
  goalPlans?: GoalPlan[]; // a target for each goal in TARGET_GOALS that has one
  alsoBanksIn?: string[]; // countries besides their own: only "NZ" changes anything today (wantsAkahu)
  credit?: string; creditAsOf?: string; // a credit.ts Band and a "YYYY-MM" month
  pay?: { amount: number; every: string }; // take-home pay per check; every: a Plaid frequency (WEEKLY ... MONTHLY)
  onboarding?: string; // the first-run step to resume at (Onboarding.tsx); absent or "done" = finished
};

// Stored as the 2-letter code (what the model sees), shown as the full name so search works.
const STATES = Object.entries({
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
}).map(([value, label]) => ({ value, label }));
export const PLAN_PROMPT =
  "Using my money profile and my last 90 days of transactions, give me my top 5 money moves to optimize taxes, tax-advantaged retirement accounts and savings under my country's rules. For each: what to do, why it fits me, and roughly how much it could save or grow.";

export function ProfileForm({ initial }: { initial: Profile }) {
  const router = useRouter();
  const { ask } = useAssistant();
  const { money0 } = useMoney();
  const [p, setP] = useState<Profile>(initial);
  const [saved, setSaved] = useState(false);
  const set = (k: keyof Profile, v: string | string[]) => {
    setP({ ...p, [k]: v });
    setSaved(false);
  };

  // Only whole targets are saved, and only for goals still picked.
  async function save() {
    const goalPlans = (p.goalPlans ?? []).filter((g) => p.goals?.includes(g.goal)).map(validGoalPlan).filter((g): g is GoalPlan => !!g);
    const { error } = await updateMeta(createClient(), { data: { profile: { ...p, goalPlans } } });
    if (!error) {
      setSaved(true);
      router.refresh();
    }
    return !error;
  }

  const country = countryOf(p.country);
  const region = country.regionLabel;
  const FIELDS = profileFields(p.country); // only the questions that apply in this country
  const filled = [p.country, ...(region ? [p.state] : []), ...FIELDS.map((f) => p[f.key]), p.credit].filter(Boolean).length;
  const total = FIELDS.length + 2 + (region ? 1 : 0);

  return (
    <div className="space-y-6">
      <section id="profile" className="card p-6 space-y-5 scroll-mt-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="card-title">Your money profile</div>
            <p className="text-sm text-muted mt-1">broke AI uses this with your transactions to tailor ideas. Only you can see it.</p>
          </div>
          <span className="text-xs text-muted tabular whitespace-nowrap">{filled}/{total} answered</span>
        </div>
        <div className="h-1.5 bg-canvas rounded-full overflow-hidden">
          <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${(filled / total) * 100}%` }} />
        </div>

        <div className="grid gap-4 @2xl:grid-cols-2">
          <Field label="Country">
            <CountryField
              country={p.country ?? ""}
              currency={p.currency}
              // A US state code means nothing elsewhere, so the region clears when the country changes.
              onChange={(c, currency) => { setP({ ...p, country: c, currency, state: c === p.country ? p.state : undefined }); setSaved(false); }}
            />
            {country.code !== "NZ" && (
              <label className="flex items-center gap-2.5 text-sm text-muted cursor-pointer pt-1">
                <input type="checkbox" checked={!!p.alsoBanksIn?.includes("NZ")} onChange={(e) => set("alsoBanksIn", e.target.checked ? ["NZ"] : [])} className="size-4 shrink-0 accent-[var(--color-ink)]" />
                I also have banks in New Zealand
              </label>
            )}
          </Field>
          {region && (
            <Field label={`${region} you live in`}>
              {country.code === "US" ? (
                <Dropdown label="State" value={p.state ?? ""} options={STATES} onChange={(v) => set("state", v)} placeholder="Choose a state" searchable />
              ) : (
                <input value={p.state ?? ""} onChange={(e) => set("state", e.target.value)} aria-label={region} placeholder={`Your ${region.toLowerCase()}`} className="select" />
              )}
            </Field>
          )}
          {FIELDS.map((f) => (
            <Field key={f.key} label={f.label}>
              <Dropdown label={f.label} value={(p[f.key] as string) ?? ""} options={f.options} onChange={(v) => set(f.key, v)} placeholder="Choose one" />
            </Field>
          ))}
          <Field label="Credit range">
            <Dropdown label="Credit range" value={p.credit ?? ""} options={BANDS} onChange={(v) => set("credit", v)} placeholder="Choose one" />
          </Field>
          <Field label="Last checked (optional)">
            <input type="month" value={p.creditAsOf ?? ""} max={new Date().toISOString().slice(0, 7)} onChange={(e) => set("creditAsOf", e.target.value)} aria-label="Credit range last checked" className="select" />
          </Field>
        </div>
        <p className="text-xs text-muted -mt-2">Your credit range picks which cards fit you on the Cards page.</p>

        <Field label="Goals">
          <GoalPicker goals={p.goals ?? []} plans={p.goalPlans ?? []} onChange={(goals, goalPlans) => { setP({ ...p, goals, goalPlans: goalPlans as GoalPlan[] }); setSaved(false); }} />
        </Field>

        <Field label="Anything else (optional)">
          <textarea
            value={p.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
            rows={2}
            aria-label="Anything else"
            placeholder={`e.g. I have ${money0(8000)} in a savings account at 0.5% and freelance income on the side`}
            className="w-full bg-surface border border-line rounded-2xl px-4 py-3 text-sm outline-none focus:border-ink"
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <button onClick={save} className="btn">{saved ? "Saved" : "Save profile"}</button>
          <button
            onClick={async () => {
              if (await save()) ask(PLAN_PROMPT);
            }}
            className="btn-primary"
          >
            Get my money moves
          </button>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}
