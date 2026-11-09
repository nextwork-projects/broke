"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Welcome } from "@/components/CountryPicker";
import { GoalPicker, type DraftPlan } from "@/components/GoalPicker";
import { DemoBankButton } from "@/components/DemoBank";
import { FeedConnect } from "@/components/FeedConnect";
import { Logo } from "@/components/Logo";
import { linkedText, useAkahu, useLinkBank } from "@/components/PlaidButtons";
import type { Profile } from "@/components/ProfileForm";
import { validGoalPlan, type GoalPlan } from "@/lib/advice";
import type { Fact } from "@/lib/first-fact";
import { plural } from "@/lib/format";
import { countryOf } from "@/lib/countries";
import type { AddChoices } from "@/lib/providers";
import { createClient, updateMeta } from "@/utils/supabase/client";

// The first run, about a minute: country, bank, goals, then one fact from their data. Pay comes from their deposits and
// debts from linked accounts; Home asks about pay only if no paycheck shows up.
// The step is saved in profile.onboarding before it shows, so leaving halfway resumes there (the app layout sends
// them back to /welcome). Every step can be skipped. "done" (or no value, for accounts made before this) = finished.
const STEPS = ["country", "bank", "goal", "result"] as const;
export type Step = (typeof STEPS)[number];

type Info = {
  status: "none" | "importing" | "thin" | "ready";
  accounts: number;
  fact?: Fact | null;
};
const load = (): Promise<Info | null> => fetch("/api/onboarding").then((r) => (r.ok ? r.json() : null)).catch(() => null);

function Head({ title, body }: { title: string; body?: string }) {
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-[-0.02em]">{title}</h1>
      {body && <p className="text-sm text-muted mt-1">{body}</p>}
    </div>
  );
}
const Skip = ({ onClick, label = "Skip for now" }: { onClick: () => void; label?: string }) => (
  <button type="button" onClick={onClick} className="text-sm text-muted underline underline-offset-4 hover:text-ink">{label}</button>
);

function BankStep({ choices, country, info, next, reload }: { choices: AddChoices; country: string; info: Info | null; next: () => void; reload: () => void }) {
  const link = useLinkBank(undefined, { quiet: true });
  const akahu = useAkahu();
  const busy = link.busy || akahu.busy;
  // A link just finished: count what it brought in.
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !busy) reload();
    was.current = busy;
  }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!busy) return;
    setSecs(0);
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);
  const linked = info?.accounts ?? 0;
  return (
    <div className="space-y-5">
      <Head title="Link your bank" body="broke reads your transactions through a secure link to find where your money goes. It can't move money." />
      {busy ? (
        <div className="space-y-3" role="status" aria-live="polite">
          <div className="flex justify-between text-sm"><span className="font-medium">Importing transactions...</span><span className="text-muted tabular">{secs} s</span></div>
          <div className="h-1.5 rounded-full bg-line overflow-hidden"><div className="h-full w-1/3 rounded-full bg-brand animate-[slide_1.2s_ease-in-out_infinite]" /></div>
          <p className="text-sm text-muted">This can take up to 30 seconds. Keep this page open.</p>
        </div>
      ) : (
        <>
          {(link.result || linked > 0) && (
            <p className="flex items-center gap-2 text-sm" role="status">
              <Check size={16} className="text-brand shrink-0" />
              {link.result ? linkedText(link.result) : `${plural(linked, "account")} linked`}
            </p>
          )}
          <div className="flex flex-col gap-3">
            {choices.feeds.map((f) => <FeedConnect key={f} id={f} country={country} />)}
            {choices.bank === "plaid" && <button onClick={() => link.start()} className={linked ? "btn" : "btn-primary"}>{linked ? "Link another bank" : "Link a bank or card"}</button>}
            {choices.bank === "akahu" && <button onClick={akahu.start} className={linked ? "btn" : "btn-primary"}>Link your NZ banks</button>}
            {choices.sandbox && <button onClick={() => link.start(true)} className="btn">Use a test bank</button>}
            {choices.demo && !linked && <DemoBankButton primary={!choices.bank} onDone={reload} />}
            {linked > 0 && <button onClick={next} className="btn-primary">Continue</button>}
          </div>
          {(link.error || akahu.error) && <p className="text-sm text-bad">{link.error || akahu.error}</p>}
        </>
      )}
      <div className="flex flex-wrap justify-between gap-3">
        <Link href="/accounts/add" className="text-sm text-muted underline underline-offset-4 hover:text-ink">Add accounts another way</Link>
        {!linked && !busy && <Skip onClick={next} />}
      </div>
    </div>
  );
}

function GoalStep({ profile, save }: { profile: Profile; save: (patch: Partial<Profile>) => void }) {
  const [goals, setGoals] = useState(profile.goals ?? []);
  const [plans, setPlans] = useState<DraftPlan[]>(profile.goalPlans ?? []);
  const done = () => save({ goals, goalPlans: plans.filter((g) => goals.includes(g.goal)).map(validGoalPlan).filter((g): g is GoalPlan => !!g) });
  return (
    <div className="space-y-5">
      <Head title="What are you working toward?" body="Pick as many as you like, or type your own. broke puts tips for your first pick first." />
      <GoalPicker goals={goals} plans={plans} onChange={(g, p) => { setGoals(g); setPlans(p); }} showMain />
      <div className="flex items-center justify-between gap-3">
        <Skip onClick={() => save({})} />
        <button disabled={!goals.length} onClick={done} className="btn-primary">Continue</button>
      </div>
    </div>
  );
}

// Waits while a connection is still sending rows (re-syncing every few seconds, up to 90 s): never a $0 fact.
function ResultStep({ finish, back }: { finish: (href: string) => void; back: () => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [waited, setWaited] = useState(0);
  const [going, setGoing] = useState("");
  useEffect(() => {
    let live = true;
    (async () => {
      const t0 = Date.now();
      for (;;) {
        const i = await load();
        if (!live) return;
        setInfo(i);
        setWaited(Math.round((Date.now() - t0) / 1000));
        if (!i || i.status !== "importing" || Date.now() - t0 > 90_000) return;
        await fetch("/api/plaid/sync", { method: "POST" }).catch(() => {});
        await new Promise((r) => setTimeout(r, 3000));
        if (!live) return;
      }
    })();
    return () => void (live = false);
  }, []);
  const go = (href: string) => (setGoing(href), finish(href));
  const dash = <button onClick={() => go("/")} disabled={!!going} className="btn">{going === "/" ? "Opening..." : "Go to your dashboard"}</button>;

  if (!info || (info.status === "importing" && waited <= 90))
    return (
      <div className="space-y-5" role="status" aria-live="polite">
        <Head title="Reading your transactions" body="broke is looking for one useful fact in your money. If your bank is still sending transactions, this can take a minute." />
        <div className="h-1.5 rounded-full bg-line overflow-hidden"><div className="h-full w-1/3 rounded-full bg-brand animate-[slide_1.2s_ease-in-out_infinite]" /></div>
      </div>
    );
  if (info.status === "none")
    return (
      <div className="space-y-5">
        <Head title="Link a bank to see your first result" body="broke finds one useful fact in your own transactions, like what your subscriptions cost a year." />
        <div className="flex flex-wrap gap-3"><button onClick={back} className="btn-primary">Link a bank</button>{dash}</div>
      </div>
    );
  if (info.status !== "ready" || !info.fact)
    return (
      <div className="space-y-5">
        <Head
          title={info.status === "importing" ? "Your bank is still sending transactions" : "Not enough history yet"}
          body={info.status === "importing" ? "Your dashboard fills in as they arrive." : "broke needs at least 2 weeks of transactions to find a pattern. Your dashboard fills in as they arrive."}
        />
        {dash}
      </div>
    );
  const f = info.fact;
  return (
    <div className="space-y-5">
      <div className="section-label">Your first result</div>
      <p className="text-2xl font-semibold tracking-[-0.02em] leading-snug">{f.headline}.</p>
      <p className="text-sm text-muted">{f.detail}</p>
      <div className="flex flex-wrap gap-3">
        <button onClick={() => go(f.cta.href)} disabled={!!going} className="btn-primary">{going === f.cta.href ? "Opening..." : f.cta.label}</button>
        {dash}
      </div>
    </div>
  );
}

export function Onboarding({ profile: initial, start, choices }: { profile: Profile; start: Step; choices: AddChoices }) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>(initial);
  const [step, setStep] = useState<Step>(STEPS.includes(start) ? start : "result");
  const [info, setInfo] = useState<Info | null>(null);
  // Writes run one after another so a later step never lands before an earlier one.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const write = (p: Profile) => (queue.current = queue.current.then(() => updateMeta(createClient(), { data: { profile: p } })));

  useEffect(() => {
    if (step !== "country" && step !== "result") load().then(setInfo);
  }, [step === "country"]); // eslint-disable-line react-hooks/exhaustive-deps

  // Saves the answers and the next step together, and shows the next step at once.
  function save(patch: Partial<Profile> = {}) {
    const next = STEPS[STEPS.indexOf(step) + 1];
    const p = { ...profile, ...patch, onboarding: next };
    setProfile(p);
    setStep(next);
    write(p);
  }
  async function finish(href: string) {
    await write({ ...profile, onboarding: "done" });
    router.push(href);
  }

  const i = STEPS.indexOf(step);
  return (
    <div className="w-full max-w-lg space-y-5">
      <div className="flex items-center justify-between px-1">
        <Logo />
        {step !== "result" && <span className="text-xs text-muted tabular">Step {i + 1} of {STEPS.length - 1}</span>}
      </div>
      {step !== "result" && (
        <div className="h-1 bg-line rounded-full overflow-hidden mx-1"><div className="h-full bg-ink rounded-full transition-all" style={{ width: `${((i + 1) / (STEPS.length - 1)) * 100}%` }} /></div>
      )}
      <div className="card p-6 md:p-8">
        {step === "country" && <Welcome profile={profile} onDone={(p) => { setProfile(p); setStep("bank"); router.refresh(); }} />}
        {step === "bank" && <BankStep choices={choices} country={countryOf(profile.country).code} info={info} next={() => save()} reload={() => load().then(setInfo)} />}
        {step === "goal" && <GoalStep profile={profile} save={save} />}
        {step === "result" && <ResultStep finish={finish} back={() => { const p = { ...profile, onboarding: "bank" }; setProfile(p); setStep("bank"); write(p); }} />}
      </div>
    </div>
  );
}
