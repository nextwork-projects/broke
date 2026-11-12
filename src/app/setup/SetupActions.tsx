"use client";

import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Dropdown } from "@/components/Dropdown";
import { COUNTRIES, countryOf, guessCountry, OTHER } from "@/lib/countries";
import type { Field } from "@/lib/setup";

export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 bg-[#111113] text-[#e6e6e6] rounded-xl pl-4 pr-1.5 py-1.5 font-mono text-[13px]">
      <code className="flex-1 overflow-x-auto whitespace-nowrap">{command}</code>
      <button
        type="button"
        aria-label="Copy command"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(command);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard blocked: the text is still selectable */
          }
        }}
        className="p-2 rounded-lg hover:bg-white/10 shrink-0"
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </button>
    </div>
  );
}

const MODE_LABELS: Record<string, string> = { sandbox: "Test banks", production: "Real banks" };

// Two or three choices side by side. No choice picked = keep what's saved.
export function Segmented({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <span role="radiogroup" aria-label={label} className="inline-flex gap-0.5 rounded-xl border border-line bg-canvas p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`px-3.5 py-1.5 rounded-[10px] text-sm transition-colors ${value === o.value ? "bg-surface text-ink font-medium shadow-[var(--shadow-card)]" : "text-muted hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

type Result = { ok: boolean; message: string } | null;

// Keys typed here go to POST /api/setup/env (localhost only). An empty input keeps the saved value.
export function KeyForm({ fields, canWrite, writeNote, onSaved }: { fields: Field[]; canWrite: boolean; writeNote?: string; onSaved: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = Object.values(values).some((v) => v.trim());

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const send = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()));
    if (!Object.keys(send).length) return;
    setBusy(true);
    setResult(null);
    setErrors({});
    try {
      const res = await fetch("/api/setup/env", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values: send }) });
      const body = (await res.json().catch(() => ({}))) as { errors?: Record<string, string>; error?: string; checks?: Record<string, Result>; restart?: boolean };
      if (body.errors) setErrors(body.errors);
      else if (!res.ok) setResult({ ok: false, text: body.error ?? "Couldn't save." });
      else {
        const checks = Object.values(body.checks ?? {}).filter((c): c is { ok: boolean; message: string } => !!c);
        const bad = checks.find((c) => !c.ok);
        const text = bad ? `Saved, but: ${bad.message}` : checks.map((c) => c.message).join(" ") || "Saved.";
        setResult({ ok: !bad, text: body.restart ? `${text} Restart broke to use the new keys.` : text });
        setValues({});
        onSaved();
      }
    } catch {
      setResult({ ok: false, text: "Couldn't reach broke. Is it still running?" });
    }
    setBusy(false);
  }

  if (!canWrite) return <p className="text-sm text-muted">{writeNote}</p>;

  return (
    <form onSubmit={save} className="space-y-3">
      {fields.map((f) => (
        <label key={f.key} className="block space-y-1">
          <span className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium">{f.label}</span>
            {f.set && (
              <span className="text-xs text-good inline-flex items-center gap-1">
                <Check size={12} /> Saved{f.hint && f.hint !== "saved" && <span className="font-mono text-muted">{f.hint}</span>}
              </span>
            )}
          </span>
          {f.help && !f.set && <span className="block text-xs text-muted">{f.help}</span>}
          {f.options ? (
            <Segmented
              label={f.label}
              value={values[f.key] ?? ""}
              onChange={(v) => setValues({ ...values, [f.key]: v })}
              options={f.options.map((o) => ({ value: o, label: MODE_LABELS[o] ?? o }))}
            />
          ) : (
            <span className="relative block">
              <input
                type={f.secret && !show[f.key] ? "password" : "text"}
                autoComplete="off"
                spellCheck={false}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                placeholder={f.set ? "Saved. Paste a new value to replace it" : f.placeholder}
                aria-invalid={!!errors[f.key]}
                className={`select font-mono !text-[13px] ${f.secret ? "pr-10" : ""} ${errors[f.key] ? "!border-bad" : ""}`}
              />
              {f.secret && (
                <button
                  type="button"
                  aria-label={show[f.key] ? "Hide" : "Show"}
                  onClick={() => setShow({ ...show, [f.key]: !show[f.key] })}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-muted hover:text-ink hover:bg-[var(--hover)]"
                >
                  {show[f.key] ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              )}
            </span>
          )}
          {errors[f.key] && <span className="block text-xs text-bad">{errors[f.key]}</span>}
        </label>
      ))}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button className="btn-primary" disabled={busy || !dirty}>{busy ? "Saving and checking…" : "Save"}</button>
        {result && <span className={`text-sm ${result.ok ? "text-good" : "text-bad"}`}>{result.text}</span>}
      </div>
    </form>
  );
}

export function MigrateButton({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        className="btn-primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg("");
          const res = await fetch("/api/setup/migrate", { method: "POST" });
          const body = await res.json().catch(() => ({}));
          setBusy(false);
          setMsg(res.ok ? "Database updated." : body.error ?? "The update didn't finish.");
          onDone();
        }}
      >
        {busy ? "Updating..." : "Update database"}
      </button>
      {msg && <span className="text-sm text-muted">{msg}</span>}
    </div>
  );
}

// One click: Supabase's own sign-in page, then back to /setup with the tables created.
export function ConnectSupabaseButton({ onDone, onFail }: { onDone: () => void; onFail?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        className="btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg("");
          // Supabase opens in its own tab, so broke stays put. Opened now, while the click still counts, or it's blocked.
          const tab = window.open("", "_blank");
          const res = await fetch("/api/setup/supabase/connect", { method: "POST" });
          const body = await res.json().catch(() => ({}));
          if (body.url) {
            if (tab) tab.location.href = body.url;
            else window.location.href = body.url; // pop-ups blocked: this tab, as before
            setMsg("Approve broke in the Supabase tab. This page updates when you're done.");
            return;
          }
          tab?.close();
          setBusy(false);
          if (!res.ok) {
            setMsg(body.error ?? "Couldn't start the Supabase sign-in.");
            onFail?.();
          }
          onDone();
        }}
      >
        {busy ? "Opening Supabase..." : "Connect Supabase"}
      </button>
      {msg && <span className="text-sm text-bad">{msg}</span>}
    </div>
  );
}


const COUNTRY_OPTIONS = [...COUNTRIES, OTHER].map((c) => ({ value: c.code, label: c.name }));

// Step 3 asks where they live first, so it can show that country's bank feed. Saved as BROKE_COUNTRY; onboarding uses it
// instead of asking again. Nothing saved yet: the guess from this computer, with a Continue button.
export function CountryPick({ saved, canWrite, writeNote, onSaved }: { saved: string; canWrite: boolean; writeNote?: string; onSaved: () => void }) {
  const [guess, setGuess] = useState("");
  const [value, setValue] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (saved) return; // the checklist remounts this (key) when the saved country changes
    const g = guessCountry(navigator.languages ?? [navigator.language], Intl.DateTimeFormat().resolvedOptions().timeZone);
    setGuess(g);
    setValue((v) => v || g);
  }, [saved]);

  async function save(code: string) {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/setup/env", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values: { BROKE_COUNTRY: code } }) });
      const body = (await res.json().catch(() => ({}))) as { error?: string; errors?: Record<string, string> };
      if (res.ok) onSaved();
      else setErr(body.errors?.BROKE_COUNTRY ?? body.error ?? "Couldn't save.");
    } catch {
      setErr("Couldn't reach broke. Is it still running?");
    }
    setBusy(false);
  }

  if (!canWrite) return <p className="text-sm text-muted">Where you live: {saved ? countryOf(saved).name : "not set"}. {writeNote} Set BROKE_COUNTRY there.</p>;
  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium">Where do you live?</span>
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-64 max-w-full">
          <Dropdown label="Country" value={value} options={COUNTRY_OPTIONS} onChange={(c) => { setValue(c); if (saved) save(c); }} placeholder="Choose a country" searchable />
        </div>
        {!saved && <button className="btn-primary" disabled={busy || !value} onClick={() => save(value)}>{busy ? "Saving..." : "Continue"}</button>}
        {saved && busy && <span className="text-sm text-muted">Saving...</span>}
      </div>
      {!saved && value && value === guess && <p className="text-xs text-muted">Guessed from this computer&apos;s time zone and language. Change it if that&apos;s wrong.</p>}
      {err && <p className="text-sm text-bad">{err}</p>}
    </div>
  );
}
