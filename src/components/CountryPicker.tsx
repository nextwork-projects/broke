"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Dropdown } from "@/components/Dropdown";
import { COUNTRIES, countryOf, guessCountry, OTHER } from "@/lib/countries";
import { createClient, updateMeta } from "@/utils/supabase/client";

type Profile = Record<string, unknown> & { country?: string; currency?: string };

const COUNTRY_OPTIONS = [...COUNTRIES, OTHER].map((c) => ({ value: c.code, label: c.name, hint: c.code === OTHER.code ? "Pick your currency" : c.currency }));

// Country, plus a currency pick when it isn't listed. currency is only kept for "Somewhere else".
export function CountryField({ country, currency, onChange }: { country: string; currency?: string; onChange: (country: string, currency: string) => void }) {
  const other = country === OTHER.code;
  const currencies = useMemo(() => {
    const name = new Intl.DisplayNames(["en"], { type: "currency" });
    return Intl.supportedValuesOf("currency").map((c) => ({ value: c, label: `${name.of(c)} (${c})` }));
  }, []);
  return (
    <div className="space-y-3">
      <Dropdown label="Country" value={country} options={COUNTRY_OPTIONS} onChange={(c) => onChange(c, countryOf(c).currency)} placeholder="Choose a country" searchable />
      {other && <Dropdown label="Currency" value={currency ?? ""} options={currencies} onChange={(c) => onChange(country, c)} placeholder="Choose a currency" searchable />}
    </div>
  );
}

// Saves country and home currency into the money profile (user_metadata.profile), keeping the rest of it.
async function saveCountry(profile: Profile, country: string, currency: string) {
  const { error } = await updateMeta(createClient(), { data: { profile: { ...profile, country, currency } } });
  return !error;
}

// First run: pick a country before anything else, guessed from the browser. onDone: the next onboarding step,
// which the saved profile resumes at (onboarding: "bank"); without it, the dashboard.
export function Welcome({ profile, onDone }: { profile: Profile; onDone?: (p: Profile) => void }) {
  const router = useRouter();
  const [c, setC] = useState({ country: "", currency: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    const country = guessCountry(navigator.languages ?? [navigator.language], Intl.DateTimeFormat().resolvedOptions().timeZone);
    setC((x) => (x.country ? x : { country, currency: countryOf(country).currency }));
  }, []);

  async function go() {
    setBusy(true);
    const next = onDone ? { ...profile, onboarding: "bank" } : profile;
    if (await saveCountry(next, c.country, c.currency)) {
      if (onDone) onDone({ ...next, country: c.country, currency: c.currency });
      else router.replace("/");
    } else {
      setErr("Couldn't save that. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.02em]">Where do you live?</h1>
        <p className="text-sm text-muted mt-1">broke uses it for your currency, which banks you can link and which tax tips apply. You can change it later.</p>
      </div>
      <CountryField country={c.country} currency={c.currency} onChange={(country, currency) => setC({ country, currency })} />
      <button onClick={go} disabled={busy || !c.country || !c.currency} className="btn-primary w-full">{busy ? "Saving..." : "Continue"}</button>
      {err && <p className="text-sm text-bad">{err}</p>}
    </div>
  );
}

// Existing users without a country are treated as US. One small nudge until they pick one or say they're in the US.
export function CountryBanner({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    <div className="card px-5 py-3 flex items-center gap-3 text-sm">
      <span className="flex-1">
        Using broke outside the US? <Link href="/optimize#profile" className="font-medium underline underline-offset-4">Set your country</Link>
      </span>
      <button
        onClick={async () => {
          setGone(true);
          if (await saveCountry(profile, "US", "USD")) router.refresh();
        }}
        className="text-muted hover:text-ink flex items-center gap-1"
      >
        I&apos;m in the US <X size={14} />
      </button>
    </div>
  );
}
