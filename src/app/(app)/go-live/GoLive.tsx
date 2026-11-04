"use client";

import { Check, ExternalLink, Lock, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLinkBank } from "@/components/PlaidButtons";
import { ClearTestData } from "@/components/ClearTestData";

const PLAID = {
  home: "https://dashboard.plaid.com/overview",
  profile: "https://dashboard.plaid.com/settings/company/compliance?tab=companyProfile",
  oauth: "https://dashboard.plaid.com/settings/compliance/us-oauth-institutions",
  launch: "https://dashboard.plaid.com/developers/launch-center",
  useCase: "https://dashboard.plaid.com/link/data-transparency-v5",
  keys: "https://dashboard.plaid.com/developers/keys",
  trial: "https://plaid.com/docs/account/billing/#trial-plans",
};
const STEPS = ["Before you start", "Turn on real banks", "Add your real key", "Clear the test data", "Link your bank", "Done"];
const SAVED = "broke:go-live-step"; // so someone waiting days on Plaid comes back to the same step

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2 hover:opacity-70">
      {children}
      <ExternalLink size={12} />
    </a>
  );
}

type Props = { live: boolean; canWrite: { ok: boolean; reason?: string }; testItems: { id: string; name: string }[]; realLinked: number; plaidCountry: boolean };

export function GoLive({ live, canWrite, testItems, realLinked, plaidCountry }: Props) {
  // Already on real banks: skip to what's left.
  const start = live ? (realLinked ? 5 : testItems.length ? 3 : 4) : 0;
  const [step, setStep] = useState(start);
  useEffect(() => {
    if (live) return;
    try {
      const n = Number(localStorage.getItem(SAVED));
      if (n > 0 && n < 3) setStep(n);
    } catch {}
  }, [live]);
  const go = (n: number) => {
    setStep(n);
    try {
      localStorage.setItem(SAVED, String(n));
    } catch {}
    window.scrollTo({ top: 0 });
  };

  if (!plaidCountry)
    return (
      <section className="card p-6 max-w-2xl space-y-2">
        <div className="card-title">Real banks through Plaid aren&apos;t used where you live</div>
        <p className="text-sm text-muted">Plaid links US, Canadian and some European banks. Add your accounts another way on <Link href="/accounts/add" className="underline underline-offset-2">Add accounts</Link>.</p>
      </section>
    );

  return (
    <div className="max-w-2xl space-y-5">
      <ol className="flex flex-wrap gap-x-4 gap-y-1 text-sm px-1" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined} className={`flex items-center gap-1.5 ${i === step ? "text-ink font-medium" : "text-muted"}`}>
            {i < step ? <Check size={14} className="text-good" /> : <span className="tabular">{i + 1}.</span>}
            {s}
          </li>
        ))}
      </ol>

      <section className="card p-6 space-y-5">
        {step === 0 && <Intro next={() => go(1)} />}
        {step === 1 && <Approval back={() => go(0)} next={() => go(2)} />}
        {step === 2 && <Secret canWrite={canWrite} back={() => go(1)} next={() => go(3)} />}
        {step === 3 && <Clear items={testItems} next={() => go(4)} />}
        {step === 4 && <LinkReal next={() => go(5)} />}
        {step === 5 && <Done />}
      </section>
    </div>
  );
}

function Nav({ back, next, label = "Continue", disabled }: { back?: () => void; next: () => void; label?: string; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <button className="btn-primary" onClick={next} disabled={disabled}>{label}</button>
      {back && <button className="text-sm text-muted hover:text-ink" onClick={back}>Back</button>}
    </div>
  );
}

function Intro({ next }: { next: () => void }) {
  return (
    <>
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold tracking-tight">Use your real bank</h2>
        <p className="text-muted">broke is in test mode. The bank window only shows Plaid&apos;s made-up banks, so a real bank login won&apos;t work yet.</p>
      </div>
      <ul className="space-y-3 text-sm">
        <li><span className="font-medium">About 10 minutes.</span> Older Plaid accounts may wait a few days for Plaid to review them.</li>
        <li><span className="font-medium">The first 10 real banks are free</span> on Plaid&apos;s <Ext href={PLAID.trial}>Trial plan</Ext> (US and Canada). After that Plaid charges per bank. Unlinking a bank doesn&apos;t give a free one back, so link the ones you mean to keep.</li>
        <li><span className="font-medium">Your test data gets cleared</span> at step 4, so fake numbers don&apos;t mix with real ones.</li>
      </ul>
      <Nav next={next} label="Start" />
    </>
  );
}

function Approval({ back, next }: { back: () => void; next: () => void }) {
  const [done, setDone] = useState(false);
  return (
    <>
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold tracking-tight">Turn on real banks in Plaid</h2>
        <p className="text-muted">Real bank data only comes through Plaid&apos;s Production mode, which needs its own key. Test mode can&apos;t reach a real bank.</p>
      </div>
      <ol className="space-y-3 text-sm list-decimal pl-5">
        <li>Open the <Ext href={PLAID.home}>Plaid Dashboard</Ext>. If it offers the free Trial plan, fill in that form. It&apos;s for Plaid accounts made since April 15, 2026.</li>
        <li>Older Plaid account: open the <Ext href={PLAID.launch}>Launch Center</Ext> and request Production access instead. Plaid may take a few days to review it.</li>
        <li>Asked what the data is for? Say it&apos;s a personal budgeting app for your own money. For US and Canadian banks, also <Ext href={PLAID.useCase}>pick a use case</Ext>.</li>
        <li>You can close broke while you wait. This page remembers where you were.</li>
      </ol>
      <label className="flex items-center gap-2.5 text-sm cursor-pointer">
        <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} className="size-4 accent-[var(--ink)]" />
        Plaid shows a Production secret on my Keys page
      </label>
      <Nav back={back} next={next} disabled={!done} />
    </>
  );
}

// The same check Settings uses: Plaid tests the secret first, and it's only saved if Plaid accepts it.
function Secret({ canWrite, back, next }: { canWrite: Props["canWrite"]; back: () => void; next: () => void }) {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; restart?: boolean } | null>(null);
  async function check() {
    setBusy(true);
    setMsg(null);
    const values = { PLAID_ENV: "production", PLAID_SECRET: secret.trim() };
    type Reply = { error?: string; errors?: Record<string, string>; checks?: { plaid?: { ok: boolean; message: string } }; restart?: boolean };
    const post = (test: boolean) =>
      fetch("/api/setup/env", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values, test }) })
        .then(async (r) => ({ ok: r.ok, body: (await r.json().catch(() => ({}))) as Reply }));
    try {
      const t = await post(true);
      const plaid = t.body.checks?.plaid;
      const fail = t.body.errors ? Object.values(t.body.errors)[0] : !t.ok ? t.body.error ?? "Couldn't check." : !plaid ? "Add your Plaid client ID in Settings first." : !plaid.ok ? `${plaid.message} Nothing was changed.` : null;
      if (fail) return setMsg({ ok: false, text: fail });
      const r = await post(false);
      if (!r.ok || !r.body.checks?.plaid?.ok) return setMsg({ ok: false, text: r.body.error ?? r.body.checks?.plaid?.message ?? "Couldn't save." });
      setSecret("");
      setMsg({ ok: true, text: "Plaid accepted it. broke now uses real banks.", restart: r.body.restart });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: "Couldn't reach broke. Is it still running?" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold tracking-tight">Add your real key</h2>
        <p className="text-muted">
          In the Plaid Dashboard, open <Ext href={PLAID.keys}>Developers → Keys</Ext> and copy the secret under Production. It&apos;s a different secret from the test one; your client ID stays the same.
        </p>
      </div>
      {!canWrite.ok ? (
        <p className="text-sm text-muted">{canWrite.reason}</p>
      ) : msg?.ok ? (
        <div className="space-y-3 text-sm">
          <p className="text-good flex items-center gap-1.5"><Check size={15} />{msg.text}</p>
          {msg.restart && <p>Restart broke to finish: close the window it&apos;s running in and open it again.</p>}
          <Nav next={next} />
        </div>
      ) : (
        <>
          <input
            type="password" autoComplete="off" spellCheck={false} value={secret} onChange={(e) => setSecret(e.target.value)}
            placeholder="Production secret (30 letters and numbers)" aria-label="Production secret" className="select font-mono !text-[13px]"
          />
          <p className="text-xs text-muted flex items-center gap-1.5"><Lock size={12} />Saved only on this computer, in broke&apos;s .env.local file. broke checks it with Plaid before saving.</p>
          {msg && <p className="text-sm text-bad">{msg.text}</p>}
          <Nav back={back} next={check} label={busy ? "Checking with Plaid…" : "Check and save"} disabled={busy || !secret.trim()} />
        </>
      )}
    </>
  );
}

function Clear({ items, next }: { items: { id: string; name: string }[]; next: () => void }) {
  return (
    <>
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold tracking-tight">Clear the test data</h2>
        <p className="text-muted">So nothing worked out from fake spending carries over to your real money.</p>
      </div>
      <ClearTestData items={items} />
      <Nav next={next} label="Continue" />
    </>
  );
}

function LinkReal({ next }: { next: () => void }) {
  const { start, busy, error, result } = useLinkBank(undefined, { quiet: true });
  useEffect(() => {
    if (result) next();
  }, [result, next]);
  return (
    <>
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold tracking-tight">Link your bank</h2>
        <p className="text-muted">Plaid opens a window where you pick your bank and sign in.</p>
      </div>
      <ul className="space-y-3 text-sm">
        <li className="flex gap-2.5"><ShieldCheck size={18} className="shrink-0 text-muted" /><span><span className="font-medium">broke never sees your bank login.</span> You sign in with your bank inside Plaid&apos;s window.</span></li>
        <li className="flex gap-2.5"><Lock size={18} className="shrink-0 text-muted" /><span><span className="font-medium">You&apos;re in control.</span> Unlink any bank on the Accounts page and broke stops reading it.</span></li>
      </ul>
      <p className="text-sm text-muted">
        Plaid says &ldquo;Connectivity not supported&rdquo;? Banks that sign you in on their own site (Chase, Bank of America, Wise and others) first need to approve broke. In the Plaid Dashboard, fill in the{" "}
        <Ext href={PLAID.profile}>compliance center</Ext> (company profile, app profile, security questions), then check <Ext href={PLAID.oauth}>OAuth institutions</Ext>. Most banks approve within hours.
      </p>
      {error && <p className="text-sm text-bad">{error}</p>}
      <Nav next={() => start(false, "bank")} label={busy ? "Opening Plaid…" : "Link my bank"} disabled={busy} />
    </>
  );
}

function Done() {
  return (
    <>
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold tracking-tight">You&apos;re on real banks</h2>
        <p className="text-muted">The first sync can take a few minutes. Once your transactions are in, build your money plan from them.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/plan" className="btn-primary">Build my money plan</Link>
        <Link href="/accounts/add" className="btn">Add another account</Link>
      </div>
    </>
  );
}

