"use client";

import { Wrench, Bot, Check, CircleAlert, X, Database, Landmark, Link2, Palette, RefreshCw, SlidersHorizontal, User, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { ClearMyData, ClearTestData, RemoveTest } from "@/components/ClearTestData";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { modelOptions, saveChoice } from "@/components/Assistant";
import { CountryField } from "@/components/CountryPicker";
import { Dropdown } from "@/components/Dropdown";
import { Modal } from "@/components/Modal";
import { ThemeToggle } from "@/components/Nav";
import { SignOut } from "@/components/SignOut";
import { countryOf } from "@/lib/countries";
import { bandLabel, creditOf, monthText } from "@/lib/credit";
import { decode, encode, isSmall, QUALITY_NOTE, type ModelChoice } from "@/lib/llm/models";
import { AI_MODES, type AiMode } from "@/lib/privacy";
import type { Section, SetupStatus } from "@/lib/setup";
import { createClient, updateMeta } from "@/utils/supabase/client";
import { Body, ExtLink } from "../../setup/SetupChecklist";
import { Segmented } from "../../setup/SetupActions";

type Group = "profile" | "banks" | "database" | "ai" | "referrals" | "appearance" | "advanced" | "improve";
type Mode = "sandbox" | "production";
type Profile = Record<string, unknown> & { country?: string; currency?: string };

const NAV: { id: Group; label: string; icon: LucideIcon; what: string }[] = [
  { id: "profile", label: "Profile", icon: User, what: "Your account, country and money profile." },
  { id: "banks", label: "Banks", icon: Landmark, what: "Where broke reads your accounts and transactions from." },
  { id: "database", label: "Database", icon: Database, what: "Supabase stores sign-ins and keeps each person's data private." },
  { id: "ai", label: "AI assistant", icon: Bot, what: "What answers when you ask broke about your money." },
  { id: "referrals", label: "Referral links", icon: Link2, what: "Your own links for the Cards page." },
  { id: "appearance", label: "Appearance", icon: Palette, what: "How broke looks on this device." },
  { id: "advanced", label: "Advanced", icon: SlidersHorizontal, what: "Local model, Claude Code and testing shortcuts." },
  { id: "improve", label: "Improve broke", icon: Wrench, what: "broke is yours to change. Your AI app can do the coding." },
];

// Which settings page each /setup section belongs on. Sections added later land by what they're about.
const PLACE: Record<string, Group> = { supabase: "database", database: "database", codes: "database", plaid: "banks", akahu: "banks", enablebanking: "banks", basiq: "banks", belvo: "banks", ai: "ai", referrals: "referrals", local: "advanced", mcp: "advanced", devlogin: "advanced" };
const groupOf = (s: Section): Group => PLACE[s.id] ?? (/bank/i.test(`${s.title} ${s.what}`) ? "banks" : "advanced");
// Server setup (keys, database, model, testing shortcuts). Only shown on the machine that runs broke.
const SERVER: Group[] = ["banks", "database", "referrals", "advanced"];
const attention = (s: Section) => s.status === "error" || (s.status === "todo" && s.kind !== "more");

export function Settings({ signedIn, local, folder, repo, update, email, profile, mode, testItems, message, aiMode }: { signedIn: boolean; local: boolean; folder: string; repo: string | null; update: boolean; email: string; profile: Profile; mode: Mode; testItems: { id: string; name: string }[]; message?: string; aiMode: AiMode }) {
  const [group, setGroup] = useState<Group>("profile");
  const [data, setData] = useState<SetupStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [checking, setChecking] = useState(true);

  const load = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/setup/status", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as SetupStatus);
      setFailed(false);
    } catch {
      setFailed(true);
    }
    setChecking(false);
  }, []);
  useEffect(() => {
    if (local) load();
    else setChecking(false);
    const fromHash = () => {
      const h = location.hash.slice(1) as Group;
      if (NAV.some((n) => n.id === h) && (local || !SERVER.includes(h) || h === "banks" || h === "database")) setGroup(h);
    };
    fromHash();
    addEventListener("hashchange", fromHash);
    return () => removeEventListener("hashchange", fromHash);
  }, [load, local]);

  // Which bank options show depends on the profile, so opening Banks after saving it picks up the change.
  useEffect(() => {
    if (local && group === "banks") load();
  }, [group, local, load]);

  const nav = local ? NAV : NAV.filter((n) => !SERVER.includes(n.id) || n.id === "banks" || n.id === "database");
  const sections = (data?.sections ?? []).filter((s) => s.id !== "country" && groupOf(s) === group); // "country": setup's step 3 with no feed; the country itself is under Profile
  const flagged = (g: Group) => (data?.sections ?? []).some((s) => groupOf(s) === g && attention(s));
  const here = NAV.find((n) => n.id === group)!;
  const pick = (g: Group) => {
    setGroup(g);
    history.replaceState(null, "", `#${g}`);
  };

  return (
    <div className="md:grid md:grid-cols-[200px_minmax(0,1fr)] md:gap-8 max-w-5xl">
      <nav aria-label="Settings" className="-mx-4 px-4 md:mx-0 md:px-0 mb-5 md:mb-0 flex md:flex-col gap-1 overflow-x-auto md:overflow-visible md:sticky md:top-6 md:self-start [scrollbar-width:none]">
        {nav.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => pick(id)}
            aria-current={group === id ? "page" : undefined}
            className={`shrink-0 flex items-center gap-2.5 px-3 py-2 rounded-xl text-[14px] whitespace-nowrap transition-colors ${group === id ? "bg-surface text-ink font-medium shadow-[var(--shadow-card)]" : "text-ink/70 hover:text-ink hover:bg-[var(--hover)]"}`}
          >
            <Icon size={17} strokeWidth={group === id ? 2 : 1.6} className="hidden md:block" />
            <span className="md:flex-1 text-left">{label}</span>
            {flagged(id) && <span className="size-1.5 rounded-full bg-bad" aria-label="Needs attention" />}
          </button>
        ))}
      </nav>

      <div className="space-y-4 min-w-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.01em]">{here.label}</h2>
            <p className="text-sm text-muted">{here.what}</p>
          </div>
          {local && (
            <button className="text-sm text-muted hover:text-ink inline-flex items-center gap-1.5 shrink-0 pt-1" disabled={checking} onClick={load}>
              <RefreshCw size={14} className={checking ? "animate-spin" : ""} /> {checking ? "Checking" : "Check again"}
            </button>
          )}
        </div>
        {message && <p role="status" className="text-sm">{message}</p>}
        {failed && <p className="text-sm text-bad">Couldn&apos;t check what&apos;s connected. Is broke still running?</p>}

        {group === "profile" && <ProfileCards email={email} profile={profile} />}
        {group === "appearance" && (
          <Card title="Theme" what="System follows your device. Saved in this browser.">
            <ThemeToggle />
          </Card>
        )}
        {group === "improve" && update && <Card title="A new version of broke is ready" what={folder ? "Your changes stay. Stop broke first, then run this in your broke folder, and start broke again." : "Use Get the latest broke below. Your changes stay."}>{folder && <code className="block font-mono text-[13px] rounded-lg border border-line px-3 py-2">npm run update</code>}</Card>}
        {group === "improve" && <ImproveCard folder={folder} repo={repo} />}
        {group === "database" && (
          <Card title="Clear my data" what="Disconnects every bank and deletes your accounts, transactions, bills, budgets, rules, plans and chats. Your sign-in, profile answers and AI connection stay. Only your own data is touched.">
            <ClearMyData />
          </Card>
        )}
        {group === "ai" && <AiDataCard initial={aiMode} />}
        {group === "ai" && <ModelCard />}
        {!local && (SERVER.includes(group) || group === "ai") && (
          <Card title="Managed by the server owner" what="Bank keys, the database and the AI model are set up on the computer that runs broke. Open broke there to change them." />
        )}
        {local && !data && !failed && !["profile", "appearance", "improve"].includes(group) && <div className="card h-40 animate-pulse" aria-busy="true" />}
        {group === "banks" && testItems.length > 0 && (
          <div id="test-data">
            <Card title="Test data" what="Plaid's made-up banks and everything worked out from them. Delete them before you rely on your real numbers.">
              <ClearTestData items={testItems} />
            </Card>
          </div>
        )}
        {data && sections.map((s) =>
          s.id === "plaid" ? (
            <PlaidCard key={s.id} s={s} data={data} signedIn={signedIn} reload={load} initialMode={mode} testItems={testItems} />
          ) : (
            <Card key={s.id} title={s.title} what={s.what} s={s}>
              <Body s={s} data={data} signedIn={signedIn} reload={load} />
            </Card>
          ),
        )}
      </div>
    </div>
  );
}

function StatusPill({ s }: { s: Section }) {
  if (s.status === "done") return <span className="text-xs font-medium text-good inline-flex items-center gap-1 shrink-0"><Check size={13} /> {s.kind === "more" ? "On" : "Connected"}</span>;
  if (s.status === "error") return <span className="text-xs font-medium text-bad inline-flex items-center gap-1 shrink-0"><CircleAlert size={13} /> Needs attention</span>;
  return <span className="text-xs text-muted shrink-0">{s.status === "optional" ? "Optional" : "Not set up"}</span>;
}

function Card({ title, what, s, children }: { title: string; what?: string; s?: Section; children?: React.ReactNode }) {
  const note = s && (s.status === "done" || s.status === "error") && s.kind !== "more" ? s.note : undefined;
  return (
    <section className="card p-6 space-y-4">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">{title}</h3>
          {s && <StatusPill s={s} />}
        </div>
        {what && <p className="text-sm text-muted">{what}</p>}
        {note && <p className={`text-sm ${s?.status === "error" ? "text-bad" : ""}`}>{note}</p>}
      </div>
      {children}
    </section>
  );
}

function ProfileCards({ email, profile }: { email: string; profile: Profile }) {
  const router = useRouter();
  const start = { country: profile.country ?? "US", currency: profile.currency ?? countryOf(profile.country).currency };
  const [c, setC] = useState(start);
  const [msg, setMsg] = useState("");
  const dirty = c.country !== start.country || c.currency !== start.currency;
  const credit = creditOf(profile);
  async function save() {
    const { error } = await updateMeta(createClient(), { data: { profile: { ...profile, ...c } } });
    setMsg(error ? "Couldn't save that. Try again." : "Saved.");
    if (!error) router.refresh();
  }
  return (
    <>
      <Card title="Account">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm truncate">{email}</span>
          <SignOut />
        </div>
      </Card>
      <Card title="Country and currency" what="Sets your currency, which banks you can link and which tax tips apply.">
        <div className="max-w-sm">
          <CountryField country={c.country} currency={c.currency} onChange={(country, currency) => (setC({ country, currency }), setMsg(""))} />
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-primary" disabled={!dirty} onClick={save}>Save</button>
          {msg && <span className="text-sm text-muted">{msg}</span>}
        </div>
      </Card>
      <Card title="Money profile" what="Filing status, income, goals and more. Ask broke and Optimize use it to tailor advice.">
        <Link href="/optimize#profile" className="btn inline-block">Edit money profile</Link>
      </Card>
      <Card title="Credit range" what="Picks which cards fit you on the Cards page. You choose it; broke doesn't pull your credit.">
        <p className="text-sm">
          {bandLabel(credit?.band) ?? "Not set"}
          {credit?.asOf && <span className="text-muted"> · Last checked {monthText(credit.asOf)}</span>}
        </p>
        <Link href="/optimize#profile" className="btn inline-block">Edit in money profile</Link>
      </Card>
      <Card title="Transaction rules" what="Change categories, names and more on matching transactions.">
        <Link href="/transactions/rules" className="btn inline-block">Manage rules</Link>
      </Card>
    </>
  );
}

type ModelsReply = { providers: Parameters<typeof modelOptions>[0]; choice: ModelChoice | null };
// "Model": which model answers chat, check-ins and the money plan. The same saved choice as the chat header's picker.
function ModelCard() {
  const [data, setData] = useState<ModelsReply | null>(null);
  const [choice, setChoice] = useState<ModelChoice>({ provider: "claude", model: null });
  const [msg, setMsg] = useState("");
  useEffect(() => {
    fetch("/api/models")
      .then((r) => (r.ok ? r.json() : { providers: [], choice: null }))
      .then((b: ModelsReply) => {
        setData(b);
        if (b.choice) setChoice(b.choice);
      })
      .catch(() => setData({ providers: [], choice: null }));
  }, []);
  async function pick(v: string) {
    const before = choice, c = decode(v);
    setChoice(c);
    setMsg("");
    const { error } = await saveChoice(c);
    if (error) {
      setChoice(before);
      return setMsg("Couldn't save that. Try again.");
    }
    setMsg("Saved.");
  }
  const current = data?.providers.find((p) => p.id === choice.provider);
  return (
    <Card title="Model" what="Which model answers in chat, weekly check-ins and the money plan. Cloud models still get a summary only.">
      {!data ? (
        <div className="h-10 max-w-sm rounded-xl bg-canvas animate-pulse" aria-busy="true" />
      ) : (
        <div className="max-w-sm">
          <Dropdown label="Model" value={encode(choice)} onChange={pick} options={modelOptions(data.providers)} />
          <Link href="/connect-ai" className="text-sm underline underline-offset-4">Connect your AI</Link>
        </div>
      )}
      {current && !current.ready && <p className="text-sm text-muted">{(current.reason ?? `${current.label} isn't set up`).replace(/[.!]?$/, ".")} Until it is, broke uses the first model that is ready.</p>}
      {current?.ready && isSmall(choice.provider, choice.model) && <p className="text-sm">{QUALITY_NOTE}</p>}
      {msg && <p role="status" className="text-sm text-muted">{msg}</p>}
    </Card>
  );
}

// "AI and your data": Off, Summary only (default) or On this Mac only. Saved to the user's metadata as ai_mode.
function AiDataCard({ initial }: { initial: AiMode }) {
  const router = useRouter();
  const [mode, setMode] = useState(initial);
  const [msg, setMsg] = useState("");
  const [localReady, setLocalReady] = useState<boolean | null>(null);
  const [seeing, setSeeing] = useState(false);
  useEffect(() => {
    fetch("/api/models")
      .then((r) => (r.ok ? r.json() : { providers: [] }))
      .then((b: { providers?: { id: string; ready: boolean }[] }) => setLocalReady(!!b.providers?.find((p) => p.id === "local")?.ready))
      .catch(() => setLocalReady(false));
  }, []);
  async function pick(m: AiMode) {
    if (m === mode) return;
    const before = mode;
    setMode(m);
    setMsg("");
    const { error } = await updateMeta(createClient(), { data: { ai_mode: m } });
    if (error) {
      setMode(before);
      return setMsg("Couldn't save that. Try again.");
    }
    setMsg("Saved.");
    router.refresh();
  }
  return (
    <Card title="AI and your data" what="Choose what broke ai can see. This covers chat, weekly check-ins and the money plan.">
      <div role="radiogroup" aria-label="AI and your data" className="space-y-2">
        {AI_MODES.map((o) => {
          const blocked = o.value === "local" && localReady === false && mode !== "local";
          const on = mode === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={blocked}
              onClick={() => pick(o.value)}
              className={`w-full flex items-start gap-3 text-left rounded-2xl border px-4 py-3 transition-colors disabled:cursor-not-allowed ${on ? "border-ink bg-canvas" : "border-line hover:bg-[var(--hover)]"} ${blocked ? "opacity-60 hover:bg-transparent" : ""}`}
            >
              <span className={`mt-0.5 size-4 rounded-full border shrink-0 grid place-items-center ${on ? "border-ink" : "border-muted/60"}`}>{on && <span className="size-2 rounded-full bg-ink" />}</span>
              <span className="min-w-0 space-y-0.5">
                <span className="block text-sm font-medium">{o.label}{o.value === "summary" && <span className="font-normal text-muted"> (default)</span>}</span>
                <span className="block text-sm text-muted">{o.what}</span>
              </span>
            </button>
          );
        })}
      </div>
      {localReady === false && (
        <p className="text-sm text-muted">On this Mac only needs a local model, and none is set up. <a href="#advanced" className="underline underline-offset-2 text-ink">Set up a local model</a></p>
      )}
      <p className="text-sm text-muted">In a summary, amounts are rounded: to the nearest 5 under 100, the nearest 10 up to 1,000, and the nearest 100 above that. Dates show the month only.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn" onClick={() => setSeeing(true)}>What the AI sees</button>
        {msg && <span role="status" className="text-sm text-muted">{msg}</span>}
      </div>
      {seeing && <SeesModal onClose={() => setSeeing(false)} />}
    </Card>
  );
}

type Seen = { tool: string; input: Record<string, unknown>; result: unknown };
const SEEN_LABEL: Record<string, string> = {
  get_profile: "Money profile", spending_summary: "Spending, last 3 months", list_recurring: "Recurring charges", list_accounts: "Accounts",
  list_holdings: "Investments", safe_to_spend: "Safe to spend", subscription_alerts: "Price rises and overlaps",
};
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const words = (k: string) => (k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()));

// The exact summary a cloud model gets for this user right now, from /api/privacy (real data, summarised).
// Shown as readable sections; "Show raw" gives the JSON the model reads.
function SeesModal({ onClose }: { onClose: () => void }) {
  const [seen, setSeen] = useState<Seen[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [raw, setRaw] = useState(false);
  useEffect(() => {
    fetch("/api/privacy", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((b: { tools: Seen[] }) => setSeen(b.tools))
      .catch(() => setFailed(true));
  }, []);
  const profile = seen?.find((s) => s.tool === "get_profile")?.result;
  const currency = (typeof profile === "string" && /currency ([A-Z]{3})/.exec(profile)?.[1]) || "USD";
  const money = (n: unknown) => (typeof n === "number" ? `about ${new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n)}` : "none");
  return (
    <Modal label="What the AI sees" onClose={onClose} className="md:!max-w-2xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="card-title">What the AI sees</h3>
          <p className="text-sm text-muted">This is what a cloud model gets when it looks up your money, built from your data right now. Placeholders like ⟨M1⟩ stay on this Mac, and broke puts the real names back in the reply.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid place-items-center size-8 rounded-full text-muted hover:text-ink hover:bg-[var(--hover)] shrink-0" data-autofocus>
          <X size={17} />
        </button>
      </div>
      {failed && <p className="text-sm text-bad">Couldn&apos;t build the summary. Try again.</p>}
      {!seen && !failed && <div className="h-40 rounded-2xl bg-canvas animate-pulse" aria-busy="true" />}
      {seen && (
        <div className="flex">
          <button type="button" className="btn !py-1.5 text-sm" aria-pressed={raw} onClick={() => setRaw((r) => !r)}>{raw ? "Show summary" : "Show raw"}</button>
        </div>
      )}
      {seen?.map((s) => (
        <section key={s.tool} className="space-y-2">
          <h4 className="section-label">{SEEN_LABEL[s.tool] ?? words(s.tool)}</h4>
          {raw ? (
            <pre className="rounded-2xl bg-canvas p-3 text-xs font-mono whitespace-pre-wrap break-words max-h-64 overflow-y-auto">{typeof s.result === "string" ? s.result : JSON.stringify(s.result, null, 2)}</pre>
          ) : (
            <SeenPart tool={s.tool} result={s.result} money={money} />
          )}
        </section>
      ))}
    </Modal>
  );
}

const Rows = ({ rows }: { rows: [React.ReactNode, React.ReactNode][] }) =>
  rows.length ? (
    <ul className="rounded-2xl bg-canvas divide-y divide-line text-sm">
      {rows.map(([a, b], i) => (
        <li key={i} className="flex items-baseline justify-between gap-3 px-3 py-2">
          <span className="min-w-0 break-words">{a}</span>
          <span className="text-muted text-right shrink-0 tabular">{b}</span>
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-muted">Nothing here yet.</p>
  );

function SeenPart({ tool, result, money }: { tool: string; result: unknown; money: (n: unknown) => string }) {
  if (typeof result === "string") return <p className="rounded-2xl bg-canvas p-3 text-sm whitespace-pre-wrap">{result.replace(/^- /gm, "")}</p>;
  if (isObj(result) && typeof result.error === "string") return <p className="text-sm text-bad">{result.error}</p>;
  if (tool === "spending_summary" && isObj(result)) {
    const months = (result.months as Obj[]) ?? [];
    const cats = [...new Set(months.flatMap((m) => Object.keys((m.by_category as Obj) ?? {})))];
    const merchants = (result.top_merchants as Obj[]) ?? [];
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium">Months</p>
        <Rows rows={months.map((m) => [String(m.month), `spent ${money(m.spent)}, received ${money(m.received)}, ${m.purchases} purchases`])} />
        <p className="text-sm font-medium">Categories</p>
        <div className="rounded-2xl bg-canvas overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-muted text-left"><th className="font-normal px-3 py-2">Category</th>{months.map((m) => <th key={String(m.month)} className="font-normal px-3 py-2 text-right tabular">{String(m.month)}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {cats.map((c) => (
                <tr key={c}><td className="px-3 py-2">{c}</td>{months.map((m) => <td key={String(m.month)} className="px-3 py-2 text-right text-muted tabular whitespace-nowrap">{(m.by_category as Obj)?.[c] == null ? "" : money((m.by_category as Obj)[c])}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm font-medium">Top merchants, as placeholders</p>
        <Rows rows={merchants.map((m) => [m.bank_event ? <>{String(m.bank_event)} <span className="text-muted">(bank event)</span></> : <span className="font-mono">{String(m.merchant)}</span>, `${money(m.total)} · ${m.count}x`])} />
      </div>
    );
  }
  if (tool === "list_recurring" && Array.isArray(result))
    return <Rows rows={(result as Obj[]).map((r) => [<><span className="font-mono">{String(r.name)}</span> <span className="text-muted">{String(r.what ?? "")}</span></>, r.next_month ? `next ${r.next_month}` : r.active === false ? "stopped" : ""])} />;
  if (tool === "list_accounts" && Array.isArray(result))
    return <Rows rows={(result as Obj[]).map((a) => [<><span className="font-mono">{String(a.account)}</span> <span className="text-muted">{String(a.subtype ?? a.type ?? "")}</span></>, [`balance ${money(a.balance)}`, a.available != null && `available ${money(a.available)}`, a.credit_limit != null && `limit ${money(a.credit_limit)}`].filter(Boolean).join(", ")])} />;
  if (tool === "list_holdings" && Array.isArray(result))
    return <Rows rows={(result as Obj[]).map((h) => [String(h.group), `${h.holdings} holdings, ${money(h.value)}, gain ${money(h.gain)}`])} />;
  return <Generic v={result} money={money} />;
}

// Anything else: one row per field, lists one row per item. Numbers are rounded money unless the name says otherwise.
function Generic({ v, money }: { v: unknown; money: (n: unknown) => string }) {
  const show = (k: string, x: unknown): string =>
    x == null ? "none" : typeof x === "number" ? (/pct|apy|ratio|rate|count|year|months|days/i.test(k) ? String(x) : money(x)) : typeof x === "boolean" ? (x ? "yes" : "no")
      : Array.isArray(x) ? (x.length ? x.map((y) => (isObj(y) ? Object.entries(y).map(([a, b]) => `${words(a).toLowerCase()} ${show(a, b)}`).join(", ") : show(k, y))).join("; ") : "none")
      : isObj(x) ? Object.entries(x).map(([a, b]) => `${words(a).toLowerCase()} ${show(a, b)}`).join(", ") : String(x);
  if (Array.isArray(v)) return <Rows rows={v.map((x, i) => [show("", x), String(i + 1)])} />;
  if (!isObj(v)) return <p className="text-sm">{show("", v)}</p>;
  return <Rows rows={Object.entries(v).map(([k, x]) => [words(k), show(k, x)])} />;
}

type Check = { ok: boolean; message: string } | null;

// Plaid, with the mode up front: test (sandbox) or live (production), and the steps to go live.
function PlaidCard({ s, data, signedIn, reload, initialMode, testItems }: { s: Section; data: SetupStatus; signedIn: boolean; reload: () => void; initialMode: Mode; testItems: { id: string; name: string }[] }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [want, setWant] = useState<Mode>(initialMode);
  const live = mode === "production";
  const keys: Section = { ...s, fields: s.fields?.filter((f) => f.key !== "PLAID_ENV"), steps: live ? undefined : s.steps };
  return (
    <Card title="Plaid" what="Links US and Canadian banks so broke can read balances and transactions." s={s}>
      <div className="rounded-2xl bg-canvas p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className={`size-2.5 rounded-full ${live ? "bg-good" : "bg-brand"}`} />
            <span className="font-medium">{live ? "Live: real banks" : "Test mode: sandbox banks only"}</span>
          </div>
          <Segmented label="Bank mode" value={want} onChange={(v) => setWant(v as Mode)} options={[{ value: "sandbox", label: "Test banks" }, { value: "production", label: "Real banks" }]} />
        </div>
        <p className="text-sm text-muted">
          {live ? "Plaid connects to your real bank accounts." : <>Plaid only shows made-up test banks. Nothing here touches a real account. <Link href="/go-live" className="text-ink underline underline-offset-2">Step by step to real banks</Link></>}
        </p>
        
      </div>

      {want !== mode && (
        <SwitchMode
          to={want}
          canWrite={data.canWrite}
          writeNote={data.writeNote}
          testItems={testItems}
          onCancel={() => setWant(mode)}
          onSwitched={() => {
            setMode(want);
            reload();
          }}
        />
      )}

      <div className="space-y-3 pt-1">
        <h4 className="text-sm font-medium">Keys</h4>
        <Body s={keys} data={data} signedIn={signedIn} reload={reload} />
      </div>
    </Card>
  );
}

const PLAID = {
  launch: "https://dashboard.plaid.com/developers/launch-center",
  request: "https://dashboard.plaid.com/overview/request-products",
  useCase: "https://dashboard.plaid.com/link/data-transparency-v5",
  keys: "https://dashboard.plaid.com/developers/keys",
  billing: "https://plaid.com/docs/account/billing/",
  trial: "https://plaid.com/docs/account/billing/#trial-plans",
};

function SwitchMode({ to, canWrite, writeNote, testItems, onCancel, onSwitched }: { to: Mode; canWrite: boolean; writeNote?: string; testItems: { id: string; name: string }[]; onCancel: () => void; onSwitched: () => void }) {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const live = to === "production";
  const name = live ? "Production" : "Sandbox";

  // Test first, save only if Plaid accepts: a wrong secret never replaces a working one.
  async function go() {
    setBusy(true);
    setResult(null);
    const values: Record<string, string> = { PLAID_ENV: to, ...(secret.trim() ? { PLAID_SECRET: secret.trim() } : {}) };
    const post = (test: boolean) => fetch("/api/setup/env", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values, test }) }).then(async (r) => ({ ok: r.ok, body: (await r.json().catch(() => ({}))) as { error?: string; errors?: Record<string, string>; checks?: { plaid?: Check }; restart?: boolean } }));
    try {
      const t = await post(true);
      const fail = t.body.errors ? Object.values(t.body.errors)[0] : !t.ok ? t.body.error ?? "Couldn't check." : !t.body.checks?.plaid ? "Add your client ID first." : !t.body.checks.plaid.ok ? `${t.body.checks.plaid.message} Nothing was changed.` : null;
      if (fail) return setResult({ ok: false, text: fail });
      const r = await post(false);
      const check = r.body.checks?.plaid;
      if (!r.ok || !check?.ok) return setResult({ ok: false, text: r.body.error ?? check?.message ?? "Couldn't save." });
      setResult({ ok: true, text: r.body.restart ? `${check.message} Restart broke to finish.` : check.message });
      setSecret("");
      router.refresh();
      onSwitched();
    } catch {
      setResult({ ok: false, text: "Couldn't reach broke. Is it still running?" });
    } finally {
      setBusy(false);
    }
  }

  const steps: { title: string; body: React.ReactNode }[] = live
    ? [
        {
          title: "Get Plaid's approval for real banks",
          body: (
            <>
              In the Plaid Dashboard, open the <ExtLink href={PLAID.launch}>Launch Center</ExtLink> and request Production access. Plaid asks about your company and how you use the data, and reviews it before Production turns on. US and Canadian banks also need a <ExtLink href={PLAID.useCase}>use case picked</ExtLink>.
              <span className="block mt-1.5 text-muted">
                Real banks are billed by Plaid: Transactions and Investments are a monthly fee per connected bank, and test mode is always free. New US and Canadian teams can start on the free <ExtLink href={PLAID.trial}>Trial plan</ExtLink> (up to 10 real connections). <ExtLink href={PLAID.billing}>How Plaid bills</ExtLink>
              </span>
            </>
          ),
        },
        {
          title: "Paste your Production secret",
          body: <>It&apos;s under Production on <ExtLink href={PLAID.keys}>Developers → Keys</ExtLink>. It&apos;s a different secret from Sandbox. Your client ID stays the same.</>,
        },
        {
          title: "Remove test connections",
          body: testItems.length ? <RemoveTest items={testItems} intro="Test connections stop working in live mode." /> : <span className="text-muted">No test connections to remove.</span>,
        },
      ]
    : [
        { title: "Real connections pause", body: "Real banks stop syncing in test mode. They pick up again when you switch back." },
        { title: "Paste your Sandbox secret", body: <>Under Sandbox on <ExtLink href={PLAID.keys}>Developers → Keys</ExtLink>. Leave it empty to try the saved secret.</> },
      ];

  return (
    <div className="rounded-2xl border border-line p-4 md:p-5 space-y-4">
      <h4 className="font-medium">{live ? "Switch to real banks" : "Switch back to test banks"}</h4>
      <ol className="space-y-4">
        {steps.map((st, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <span className="size-6 rounded-full border border-line text-xs text-muted grid place-items-center shrink-0 tabular">{i + 1}</span>
            <div className="flex-1 min-w-0 space-y-2 pt-0.5">
              <div className="font-medium">{st.title}</div>
              <div>{st.body}</div>
              {i === 1 && canWrite && (
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder={`${name} secret (30 letters and numbers)`}
                  aria-label={`${name} secret`}
                  className="select font-mono !text-[13px] max-w-md"
                />
              )}
            </div>
          </li>
        ))}
      </ol>
      {canWrite ? (
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary" disabled={busy || (live && !secret.trim())} onClick={go}>
            {busy ? "Checking with Plaid…" : live ? "Check and switch to real banks" : "Check and switch to test banks"}
          </button>
          <button className="text-sm text-muted hover:text-ink" onClick={onCancel}>Cancel</button>
          {result && <span className={`text-sm ${result.ok ? "text-good" : "text-bad"}`}>{result.text}</span>}
        </div>
      ) : (
        <p className="text-sm text-muted">{writeNote}</p>
      )}
    </div>
  );
}


function ImproveCard({ folder, repo }: { folder: string; repo: string | null }) {
  const line = "block font-mono text-[13px] rounded-lg border border-line px-3 py-2 break-all";
  const github = repo ? `https://github.com/${repo}` : null;
  if (!folder) return (
    <>
      <Card title="Get the latest broke" what="No Terminal needed. Your changes stay, and your site rebuilds by itself.">
        <ol className="space-y-2 text-sm list-decimal pl-5">
          <li>{github ? <a className="underline underline-offset-2" href={`${github}/actions/workflows/update-broke.yml`}>Open Update broke in your GitHub</a> : "In your GitHub repo, open Actions, then Update broke"}.</li>
          <li>Press Run workflow, then Run workflow again.</li>
          <li>Your site updates a couple of minutes later.</li>
        </ol>
      </Card>
      <Card title="Change anything" what="Claude Code, Codex or opencode can make the change. The repo's CLAUDE.md tells them broke's privacy rules.">
        <ol className="space-y-3 text-sm list-decimal pl-5">
          <li className="space-y-1.5">Copy your code to your computer and start your AI app.<code className={line}>git clone {github ?? "<your repo>"} broke &amp;&amp; cd broke &amp;&amp; claude</code></li>
          <li>Say what you want, like &quot;add a chart of my spending by weekday&quot;.</li>
          <li className="space-y-1.5">Publish it. Vercel rebuilds your site.<code className={line}>git add -A &amp;&amp; git commit -m &quot;My change&quot; &amp;&amp; git push</code></li>
        </ol>
      </Card>
    </>
  );
  return (
    <Card title="Change anything" what="Claude Code, Codex or opencode can make the change. The repo's CLAUDE.md tells them broke's privacy rules.">
      <ol className="space-y-3 text-sm list-decimal pl-5">
        <li className="space-y-1.5">Open Terminal in your broke folder and start your AI app.<code className={line}>cd &quot;{folder}&quot; &amp;&amp; claude</code></li>
        <li>Say what you want, like &quot;add a chart of my spending by weekday&quot;.</li>
        <li className="space-y-1.5">See it change as it works. Stop broke if it&apos;s running, then run this in a second Terminal window.<code className={line}>npm run dev</code></li>
        <li className="space-y-1.5">Get the latest broke at any time. Your changes stay.<code className={line}>npm run update</code></li>
        <li>Made something others would want? <a className="underline underline-offset-2" href="https://github.com/nextwork-projects/broke/pulls">Send it back as a pull request</a>.</li>
      </ol>
    </Card>
  );
}
