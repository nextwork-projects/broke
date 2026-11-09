"use client";

import { Check, ChevronDown, CircleAlert, ExternalLink, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import type { AiRow, Part, Section, SetupStatus } from "@/lib/setup";
import { CopyCommand, CountryPick, KeyForm, ConnectSupabaseButton, MigrateButton } from "./SetupActions";

export function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-medium text-brand underline decoration-brand/30 underline-offset-2 hover:decoration-brand">
      {children}
      <ExternalLink size={12} className="shrink-0" />
    </a>
  );
}

// `code` inside plain text renders as an inline code chip.
const ticks = (t: string) => t.split(/(`[^`]+`)/).map((p, i) => (p.startsWith("`") ? <code key={i} className="font-mono text-[0.92em] bg-canvas border border-line rounded px-1">{p.slice(1, -1)}</code> : p));
const line = (parts: Part[]) => parts.map((p, i) => (typeof p === "string" ? p : <ExtLink key={i} href={p.href}>{p.label}</ExtLink>));

// Height animates via grid rows (0fr -> 1fr); globals.css turns transitions off for reduced motion.
export function Collapse({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(.33,1,.68,1)] ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
      <div className="overflow-hidden" inert={!open}>{children}</div>
    </div>
  );
}

function Badge({ s, n }: { s: Section["status"]; n: number }) {
  if (s === "done") return <span className="size-7 rounded-full bg-good text-on-ink grid place-items-center shrink-0"><Check size={15} strokeWidth={2.5} /></span>;
  if (s === "error") return <span className="size-7 rounded-full bg-red-50 text-bad grid place-items-center shrink-0"><CircleAlert size={16} /></span>;
  return <span className="size-7 rounded-full border border-line text-sm text-muted grid place-items-center shrink-0 tabular">{n}</span>;
}

export function SetupChecklist({ signedIn }: { signedIn: boolean }) {
  const [data, setData] = useState<SetupStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const load = useCallback(async (keepOpen?: string) => {
    setChecking(true);
    try {
      const res = await fetch("/api/setup/status", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as SetupStatus;
      setData(next);
      setFailed(false);
      // Open the next thing to do; keep a section open while the user is part-way through it.
      const first = next.sections.find((s) => s.kind !== "more" && s.status !== "done");
      setOpen((cur) => {
        const still = (id?: string | null) => id && next.sections.find((s) => s.id === id)?.status !== "done";
        return still(keepOpen) ? keepOpen! : still(cur) ? cur : first?.id ?? null;
      });
    } catch {
      setFailed(true);
    }
    setChecking(false);
  }, []);
  // Connect Supabase opens Supabase in its own tab. Back from Supabase, that tab passes the result here and closes itself.
  useEffect(() => {
    const db = new URLSearchParams(window.location.search).get("db");
    if (db && window.opener) {
      try { localStorage.setItem("broke.supabase", `${db}|${Date.now()}`); } catch { /* private window: this tab just stays open */ }
      window.close();
      return;
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === "broke.supabase" && e.newValue) window.location.href = `/setup?db=${encodeURIComponent(e.newValue.split("|")[0])}`;
    };
    addEventListener("storage", onStorage);
    return () => removeEventListener("storage", onStorage);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const sections = data?.sections ?? [];
  const main = sections.filter((s) => s.kind !== "more");
  const more = sections.filter((s) => s.kind === "more");
  const required = main.filter((s) => s.kind === "required");
  const next = required.find((s) => s.status !== "done");
  const canSkipBank = next?.country !== undefined; // the database works, so broke can open: statements can be imported without a bank feed

  return (
    <main className="min-h-screen bg-canvas px-4 py-8 md:py-12">
      <div className="@container max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between pb-2">
          <Logo />
          {signedIn && <Link href="/" className="text-sm text-muted hover:text-ink">Back to broke</Link>}
        </div>

        <section className="card p-7 space-y-5">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">{!data ? "Set up broke" : !next ? "You're all set" : `Step ${required.indexOf(next) + 1} of ${required.length}: ${next.title}`}</h1>
            <p className="text-sm text-muted">
              {!data ? "Checking what's connected… " : !next ? "Open broke and sign in with your email. " : "It's free. Follow the steps below and paste each key in. "}
              Your keys stay on this computer.
            </p>
          </div>
          <div className="flex gap-1.5" aria-hidden>
            {(data ? required.map((s) => s.status === "done") : [false, false, false]).map((d, i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${d ? "bg-good" : "bg-line"}`} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {next ? (
              <button
                className="btn-primary"
                onClick={() => {
                  setOpen(next.id);
                  document.getElementById(`s-${next.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                Show me this step
              </button>
            ) : (
              data && <Link href="/" className="btn-primary">Open broke</Link>
            )}
            {canSkipBank && <Link href="/" className="btn">Skip: use made-up data</Link>}
            <button className="text-sm text-muted hover:text-ink inline-flex items-center gap-1.5" disabled={checking} onClick={() => load()}>
              <RefreshCw size={14} className={checking ? "animate-spin" : ""} /> {checking ? "Checking" : "Check again"}
            </button>
            {failed && <span className="text-sm text-bad">Couldn&apos;t check. Is broke still running?</span>}
          </div>
        </section>

        {!data && !failed && <div className="space-y-3" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="card h-[72px] animate-pulse" />)}</div>}

        {data && main.map((s, i) => (
          <SectionCard key={s.id} s={s} n={i + 1} open={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)} data={data} signedIn={signedIn} reload={() => load(s.id)} />
        ))}

        {data && !!more.length && (
          <section className="card overflow-hidden">
            <button className="w-full flex items-center gap-4 px-6 py-4 text-left row-hover" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>
              <span className="flex-1 min-w-0">
                <span className="block font-medium">More options</span>
                <span className="block text-sm text-muted truncate">Sign-in codes, local AI model, Claude Code</span>
              </span>
              <ChevronDown size={18} className={`text-muted shrink-0 transition-transform duration-300 ${moreOpen ? "rotate-180" : ""}`} />
            </button>
            <Collapse open={moreOpen}>
              <div className="border-t border-line divide-y divide-line">
                {more.map((s) => (
                  <div key={s.id} className="px-6 py-5 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <div className="font-medium">{s.title}</div>
                        <p className="text-sm text-muted">{s.what}</p>
                      </div>
                      {s.status === "done" && <span className="text-xs font-medium text-good inline-flex items-center gap-1 pt-1"><Check size={13} /> On</span>}
                    </div>
                    <Body s={s} data={data} signedIn={signedIn} reload={() => load()} />
                  </div>
                ))}
              </div>
            </Collapse>
          </section>
        )}

        <p className="text-xs text-muted text-center px-4 pt-2">
          Keys are saved to <code>.env.local</code> next to Start broke.command. This page only ever shows whether each one is saved.
        </p>
      </div>
    </main>
  );
}

function SectionCard({ s, n, open, onToggle, data, signedIn, reload }: { s: Section; n: number; open: boolean; onToggle: () => void; data: SetupStatus; signedIn: boolean; reload: () => void }) {
  const summary = s.status === "done" || s.status === "error" ? s.note ?? s.what : s.what;
  return (
    <section id={`s-${s.id}`} className={`card overflow-hidden scroll-mt-6 transition-shadow duration-300 ${open ? "shadow-[0_10px_24px_-12px_#0000001f]" : ""}`}>
      <button className="w-full flex items-center gap-4 px-6 py-4 text-left row-hover" aria-expanded={open} onClick={onToggle}>
        <Badge s={s.status} n={n} />
        <span className="flex-1 min-w-0">
          <span className="block font-medium">{s.title}</span>
          <span className={`block text-sm truncate ${s.status === "error" ? "text-bad" : "text-muted"}`}>{summary}</span>
        </span>
        <ChevronDown size={18} className={`text-muted shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>
      <Collapse open={open}>
        <div className="px-6 pb-6 pt-1 @md:pl-[4.25rem] space-y-4">
          {s.country !== undefined && <CountryPick key={s.country} saved={s.country} canWrite={data.canWrite} writeNote={data.writeNote} onSaved={reload} />}
          <Body s={s} data={data} signedIn={signedIn} reload={reload} />
        </div>
      </Collapse>
    </section>
  );
}

function Steps({ steps }: { steps?: Section["steps"] }) {
  if (!steps) return null;
  return (
    <ol className="space-y-1.5 text-sm">
      {steps.map((p, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="text-muted tabular">{i + 1}.</span>
          <span>{line(p)}</span>
        </li>
      ))}
    </ol>
  );
}

export function Body({ s, data, signedIn, reload }: { s: Section; data: SetupStatus; signedIn: boolean; reload: () => void }) {
  const [fallback, setFallback] = useState(false);
  const form = s.fields && <KeyForm fields={s.fields} canWrite={data.canWrite} writeNote={data.writeNote} onSaved={reload} />;
  return (
    <>
      {s.note && s.status !== "done" && s.status !== "error" && <p className="text-sm">{s.note}</p>}
      {s.note && s.status === "done" && s.kind === "more" && <p className="text-sm">{s.note}</p>}
      {s.action === "connect" && (s.steps || s.fields) ? (
        // Step 2: paste the connection string and password (the reliable way), or sign in to Supabase instead.
        <>
          <Steps steps={s.steps} />
          {form}
          <details className="text-sm" open={fallback} onToggle={(e) => setFallback(e.currentTarget.open)}>
            <summary className="cursor-pointer text-muted hover:text-ink">Or sign in to Supabase instead of pasting</summary>
            <div className="pt-3"><ConnectSupabaseButton onDone={reload} /></div>
          </details>
        </>
      ) : s.status === "done" && s.kind !== "more" && s.fields ? (
        // Connected: the steps and empty boxes are noise now. They stay one click away for changing a key.
        <details className="text-sm">
          <summary className="cursor-pointer text-muted hover:text-ink">Change these keys</summary>
          <div className="pt-3 space-y-4">
            <Steps steps={s.steps} />
            {form}
          </div>
        </details>
      ) : (
        <>
          <Steps steps={s.steps} />
          {s.command && <CopyCommand command={s.command} />}
          {form}
        </>
      )}
      {s.action === "migrate" && <MigrateButton onDone={reload} />}
      {s.providers && <Providers rows={s.providers} />}
    </>
  );
}

function Providers({ rows }: { rows: AiRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ul className="-mx-3">
      {rows.map((p) => {
        const can = !p.ready && !!p.howTo?.length;
        return (
          <li key={p.id}>
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
              <span className={`size-2.5 rounded-full shrink-0 ${p.ready ? "bg-good" : "border-2 border-muted/40"}`} />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium">{p.label}</span>
                <span className="block text-xs text-muted truncate">{p.ready ? "Ready" : ticks(p.reason ?? "Not set up")}</span>
              </span>
              {can && (
                <button className="text-sm font-medium text-brand inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-brand-soft" aria-expanded={open === p.id} onClick={() => setOpen(open === p.id ? null : p.id)}>
                  Set up <ChevronDown size={14} className={`transition-transform duration-300 ${open === p.id ? "rotate-180" : ""}`} />
                </button>
              )}
            </div>
            {can && (
              <Collapse open={open === p.id}>
                <ol className="px-3 pb-3 pl-8 space-y-2.5 text-sm">
                  {p.howTo!.map((h, i) => (
                    <li key={i} className="space-y-1.5">
                      <span>{ticks(h.text)}{h.href && <> <ExtLink href={h.href}>Open</ExtLink></>}</span>
                      {h.command && <CopyCommand command={h.command} />}
                    </li>
                  ))}
                </ol>
              </Collapse>
            )}
          </li>
        );
      })}
    </ul>
  );
}
