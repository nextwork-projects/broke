"use client";
/* eslint-disable @next/next/no-img-element */ // attached images are data URLs; next/image has nothing to optimise

import { ArrowUp, Check, ChevronRight, LoaderCircle, Paperclip, Plus, Receipt, Repeat, Target, TrendingUp, Wallet, X } from "lucide-react";
import Link from "next/link";
import { PhoneMark } from "@/components/Logo";
import { Dropdown } from "@/components/Dropdown";
import { toastHost } from "@/components/Toast";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { decode, encode, isSmall, QUALITY_NOTE, type ModelChoice, type ModelOption } from "@/lib/llm/models";
import { createClient, updateMeta } from "@/utils/supabase/client";
import { BudgetOffer } from "@/components/BudgetOffer";
import { CategoryIcon } from "@/components/Icons";
import { Merchant } from "@/components/Merchant";
import { useMoney } from "@/components/Money";
import { RuleOffer } from "@/components/RuleOffer";
import { validSave, type GoalPlan } from "@/lib/advice";
import { BUDGET_CONTEXT } from "@/lib/budget";
import { useRouter } from "next/navigation";
import { replyBlocks, type Action, type Breakdown } from "@/lib/reply";

type Msg = { role: "user" | "assistant"; content: string; images?: string[] }; // images: data URLs the user attached
type Ctx = { open: boolean; toggle: () => void; ask: (q: string) => void };
type HowTo = { text: string; href?: string; command?: string };
export type Provider = { id: string; label: string; model: string | null; models?: ModelOption[]; ready: boolean; reason?: string; howTo?: HowTo[]; found?: string; action?: string; helper?: boolean };
export type AiMode = "off" | "summary" | "local";

// A no-op default, so a button rendered outside the panel's provider (an error page, a half-finished render)
// does nothing instead of crashing the page.
const AssistantCtx = createContext<Ctx>({ open: false, toggle: () => {}, ask: () => {} });
export const useAssistant = () => useContext(AssistantCtx);

// The runners' signed-out line (claude-code.ts, cli-snapshot.ts), and which provider each name is.
const SIGNED_OUT = /(Claude Code|ChatGPT|Gemini|opencode) isn't signed in/;
const CLI_ID: Record<string, string> = { "Claude Code": "claude", ChatGPT: "codex", Gemini: "gemini", opencode: "opencode" };
const CLI_NAME = Object.fromEntries(Object.entries(CLI_ID).map(([name, id]) => [id, name]));

// Sent with "Ask AI to sort these"; the chat bubble hides it (CategoryCheck.tsx).
export const CHECK_CONTEXT = /\n\nThese need checking[\s\S]*$/;

const SUGGESTIONS = [
  { icon: Wallet, q: "Where did most of my money go this month?" },
  { icon: Repeat, q: "Which subscriptions should I cancel?" },
  { icon: TrendingUp, q: "Am I spending more than last month?" },
  { icon: Receipt, q: "What bills are coming up before payday?" },
  { icon: Target, q: "Help me make a plan for my goals" },
];

/** One row per model: "Claude", "Claude · Opus", ..., then a row per provider that isn't set up (picking it shows the steps). */
export function modelOptions(providers: Provider[]) {
  return providers.flatMap((p) =>
    !p.ready
      ? [{ value: encode({ provider: p.id as ModelChoice["provider"], model: null }), label: p.label, hint: p.found ? `${p.found}. Pick it to set it up.` : "Not set up yet. Pick it to set it up." }]
      : [
          ...(p.id === "local" ? [] : [{ value: encode({ provider: p.id as ModelChoice["provider"], model: null }), label: p.label, hint: `Default${p.model ? ` · ${p.model}` : ""}` }]),
          ...(p.models ?? []).map((m) => ({ value: encode({ provider: p.id as ModelChoice["provider"], model: m.id }), label: `${p.label} · ${m.label}`, hint: isSmall(p.id, m.id) ? "Smaller, faster" : undefined })),
        ],
  );
}
/** Saves the choice for chat, check-ins and the money plan (user_metadata.ai_model). */
export const saveChoice = (c: ModelChoice) => updateMeta(createClient(), { data: { ai_model: c } });

// Docked chat panel that lives in the app layout, so the conversation survives page changes.
// Temporary chat: the conversation lives only in this panel's memory and is gone when it is cleared or the page reloads.
// aiMode comes from Settings, AI assistant ("AI and your data"). Off: the panel only says so and sends nothing.
export function AssistantProvider({ children, aiMode = "summary" }: { children: React.ReactNode; aiMode?: AiMode }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  // null until /api/models answers: the server then uses the saved choice itself.
  const [choice, setChoice] = useState<ModelChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [forceSetup, setForceSetup] = useState(false); // a question hit an AI that isn't set up: keep its setup card up

  const gen = useRef(0); // a new question or new chat stops any wait for a sign-in

  async function send(text: string, images: string[] = []) {
    if ((!text.trim() && !images.length) || busy || aiMode === "off") return;
    const next: Msg[] = [...messages, { role: "user", content: text.trim() || "What does this show?", ...(images.length ? { images } : {}) }];
    await answer(next, ++gen.current);
  }

  async function answer(next: Msg[], run: number, retried = false) {
    setMessages([...next, { role: "assistant", content: "" }]);
    setBusy(true);
    let reply = "";
    try {
      const res = await fetch("/api/assistant", { method: "POST", body: JSON.stringify({ messages: next.map((m, i) => (i === next.length - 1 ? m : { role: m.role, content: m.images ? `${m.content}\n[an image I sent earlier]` : m.content })), ...(choice ?? {}) }) });
      const notReady = res.headers.get("x-signin");
      if (notReady && !retried) {
        setBusy(false);
        return void signIn(next, run, notReady);
      }
      if (res.status === 400) {
        // Not set up and not a sign-in: the setup card above has the button.
        setForceSetup(true);
        setMessages([...next, { role: "assistant", content: "This AI isn't set up yet. Use the button above, or pick another." }]);
        setBusy(false);
        return;
      }
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        setMessages([...next, { role: "assistant", content: reply }]);
      }
    } catch (e) {
      console.error("[broke] assistant:", e);
      setMessages([...next, { role: "assistant", content: "That AI isn't connected yet, or it couldn't answer. Check it on [Connect your AI](/connect-ai), or pick another above." }]);
    }
    setBusy(false);
    const out = !retried && reply.match(SIGNED_OUT);
    if (out) signIn(next, run, CLI_ID[out[1]]);
  }

  // Signed out of a CLI: open Terminal on its sign-in, then ask the question again by itself once it's signed in.
  async function signIn(next: Msg[], run: number, id: string) {
    const name = CLI_NAME[id];
    setMessages([...next, { role: "assistant", content: `${name} isn't signed in. Opening Terminal...` }]);
    const body = await fetch("/api/models/setup", { method: "POST", body: JSON.stringify({ id, force: true }) }).then((r) => r.json()).catch(() => ({}));
    if (gen.current !== run) return;
    if (!body.opened) return setMessages([...next, { role: "assistant", content: `${name} isn't signed in, and Terminal couldn't open from here. Follow the steps on [Connect your AI](/connect-ai).` }]);
    setMessages([...next, { role: "assistant", content: `Terminal just opened so you can sign in to ${name}. Finish there and broke asks again by itself.` }]);
    const ready = async () => {
      const b = await fetch("/api/models?fresh=1").then((r) => r.json()).catch(() => ({ providers: [] }));
      return !!(b.providers as Provider[]).find((p) => p.id === id)?.ready;
    };
    const stale = await ready(); // says signed in while the run said otherwise: nothing to wait for, so they ask again themselves
    if (stale) return setMessages([...next, { role: "assistant", content: `Terminal just opened so you can sign in to ${name}. Finish there, then ask again.` }]);
    for (let i = 0; i < 45 && gen.current === run; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      if (gen.current === run && (await ready())) return void answer(next, run, true);
    }
  }

  const ctx: Ctx = {
    open,
    toggle: () => setOpen((o) => !o),
    ask: (q) => {
      setOpen(true);
      send(q);
    },
  };

  return (
    <AssistantCtx.Provider value={ctx}>
      <div className="min-h-screen bg-surface md:flex">
        {children}
        {open && (
          <Panel
            messages={messages}
            busy={busy}
            send={send}
            close={() => setOpen(false)}
            choice={choice}
            setChoice={setChoice}
            aiMode={aiMode}
            forceSetup={forceSetup}
            newChat={() => { gen.current++; setMessages([]); }}
          />
        )}
      </div>
    </AssistantCtx.Provider>
  );
}

function Panel(props: {
  messages: Msg[]; busy: boolean; send: (t: string, images?: string[]) => void; close: () => void;
  choice: ModelChoice | null; setChoice: (c: ModelChoice) => void; aiMode: AiMode; forceSetup: boolean; newChat: () => void;
}) {
  const { messages, busy, send, close, choice, setChoice, aiMode, forceSetup, newChat } = props;
  const provider = choice?.provider ?? "openrouter";
  const off = aiMode === "off";
  const [input, setInput] = useState("");
  const [attached, setAttached] = useState<string[]>([]);
  const [attachErr, setAttachErr] = useState("");
  const [providers, setProviders] = useState<Provider[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  // Pasted, dropped or picked images: PNG, JPEG, WebP or GIF, up to 4 a message and 5 MB each (the server checks again).
  async function attach(files: Iterable<File>) {
    setAttachErr("");
    const ok = [...files].filter((f) => /^image\/(png|jpeg|webp|gif)$/.test(f.type));
    if (ok.some((f) => f.size > 5e6)) setAttachErr("Images over 5 MB are left out.");
    const urls = await Promise.all(ok.filter((f) => f.size <= 5e6).map((f) => new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = rej;
      r.readAsDataURL(f);
    })));
    setAttached((a) => {
      const all = [...a, ...urls];
      if (all.length > 4) setAttachErr("Up to 4 images a message.");
      return all.slice(0, 4);
    });
  }
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const back = useRef<HTMLElement | null>(null);

  // A modal sheet on phones (focus trap, inert page), a docked non-modal panel from md up. Focus goes back on close.
  useEffect(() => {
    const d = dialog.current!;
    let drop = () => {};
    if (!d.open) {
      back.current = document.activeElement as HTMLElement | null;
      if (matchMedia("(max-width: 767px)").matches) {
        d.showModal();
        drop = toastHost(d);
      } else d.show();
    }
    return () => {
      drop();
      back.current?.focus();
    };
  }, []);
  useEffect(() => {
    // Only the chat scrolls. scrollIntoView would move the page behind it too.
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages]);
  useEffect(() => {
    field.current?.focus({ preventScroll: true });
  }, [busy]);
  const loadModels = (fresh = false) =>
    fetch(`/api/models${fresh ? "?fresh=1" : ""}`)
      .then((r) => (r.ok ? r.json() : { providers: [] }))
      .then((b: { providers?: Provider[]; choice?: ModelChoice | null }) => {
        setProviders(b.providers ?? []);
        if (!choice) setChoice(b.choice ?? { provider: "openrouter", model: null });
        return b.providers ?? [];
      })
      .catch(() => (setProviders([]), [] as Provider[]));
  useEffect(() => void loadModels(), []); // eslint-disable-line react-hooks/exhaustive-deps
  // Picking one that isn't ready brings up its setup right away, even mid-chat.
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    if (picked) scroller.current?.scrollTo({ top: 0, behavior: "smooth" }); // the setup card sits at the top of the chat
  }, [picked]);
  const pickModel = (v: string) => {
    const c = decode(v);
    setChoice(c);
    setPicked(c.provider);
    saveChoice(c).then(({ error }) => error && console.error("[broke] model choice:", error.message));
  };

  const current = providers.find((p) => p.id === provider);
  const icon = "grid place-items-center size-8 rounded-full text-muted hover:text-ink hover:bg-[var(--hover)] transition-colors";
  const submit = () => {
    if ((!input.trim() && !attached.length) || busy) return;
    send(input, attached);
    setInput("");
    setAttached([]);
    setAttachErr("");
  };

  return (
    <dialog
      ref={dialog}
      aria-label="broke ai chat"
      onKeyDown={(e) => e.key === "Escape" && !e.defaultPrevented && (e.preventDefault(), close())}
      onCancel={(e) => (e.preventDefault(), close())}
      className="fixed inset-0 z-40 size-full max-w-none max-h-none bg-transparent text-inherit md:static md:inset-auto md:w-[420px] md:shrink-0 md:h-screen md:sticky md:top-0 md:py-3 md:pr-3"
    >
      <div className="h-full bg-surface text-ink md:rounded-3xl md:border md:border-line md:shadow-[var(--shadow-card)] flex flex-col text-[14px] overflow-hidden">
        <header className="flex items-center gap-2 pl-4 pr-2 h-14 border-b border-line shrink-0">
          <PhoneMark size={22} />
          <span className="font-semibold tracking-tight shrink-0">broke ai</span>
          <div className="min-w-0 flex-1 flex">
            <Dropdown
              label="AI model"
              value={encode(choice ?? { provider: "openrouter", model: null })}
              onChange={pickModel}
              options={modelOptions(providers.length ? providers : [{ id: "openrouter", label: "OpenRouter", model: null, ready: true }])}
            />
          </div>
          <button onClick={newChat} aria-label="New chat" title="New chat" className={icon}><Plus size={17} /></button>
          <button onClick={close} aria-label="Close" title="Close" className={icon}><X size={17} /></button>
        </header>

        <div className="px-4 py-2 border-b border-line text-xs text-muted space-y-0.5 shrink-0">
          {off ? (
            <p>AI is off. Nothing goes to a model.</p>
          ) : (
            <>
              <p>{aiMode === "local" && provider === "local" ? "Runs on this Mac" : aiMode === "local" ? "Sees a summary of your money. Full detail is for the local model only." : "Sees a summary of your money"}</p>
              <p>Temporary chat: not saved</p>
              {current?.ready && isSmall(provider, choice?.model ?? (provider === "local" ? current.model : null)) && <p className="text-ink">{QUALITY_NOTE}</p>}
            </>
          )}
        </div>

        <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
          {off && (
            <section className="rounded-2xl border border-line p-4 space-y-2">
              <p className="font-semibold">AI is off</p>
              <p className="text-sm text-muted">You turned off AI, so broke ai can&apos;t answer. Everything else in broke still works.</p>
              <Link href="/settings#ai" onClick={close} className="btn inline-block !py-1.5 text-sm">Change in Settings</Link>
            </section>
          )}
          {!off && current && !current.ready && (!messages.length || picked === provider || forceSetup) && <SetupCard p={current} recheck={() => loadModels(true)} />}
          {!off && !messages.length && current?.ready !== false && (
            <div className="pt-6 space-y-5">
              <div className="space-y-1.5">
                <p className="text-xl font-semibold tracking-tight">Ask anything about your money</p>
                <p className="text-muted">{aiMode === "local" && provider === "local" ? "I read your accounts, transactions and bills on this Mac." : "I see monthly totals and rounded amounts, not your transactions."} Keep using the app while we talk.</p>
              </div>
              <div className="grid gap-2">
                {SUGGESTIONS.map(({ icon: Icon, q }) => (
                  <button key={q} onClick={() => send(q)} className="flex items-center gap-3 text-left rounded-2xl border border-line px-3.5 py-3 hover:bg-[var(--hover)] hover:border-muted/40 transition-colors">
                    <span className="grid place-items-center size-8 rounded-full bg-canvas text-muted shrink-0"><Icon size={16} /></span>
                    <span>{q}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] flex flex-col items-end gap-1.5">
                  {m.images?.length ? <div className="flex flex-wrap justify-end gap-1.5">{m.images.map((src, j) => <img key={j} src={src} alt="" className="max-h-40 max-w-full rounded-2xl border border-line" />)}</div> : null}
                  <p className="rounded-2xl rounded-br-md bg-ink text-on-ink px-4 py-2.5 whitespace-pre-wrap leading-relaxed">{m.content.replace(BUDGET_CONTEXT, "").replace(CHECK_CONTEXT, "")}</p>
                </div>
              </div>
            ) : (
              <div key={i} className="leading-relaxed space-y-2.5">
                <Reply text={m.content} live={busy && i === messages.length - 1} onPick={!busy && i === messages.length - 1 ? send : undefined} />
              </div>
            ),
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          onDragOver={(e) => e.dataTransfer.types.includes("Files") && e.preventDefault()}
          onDrop={(e) => {
            if (!e.dataTransfer.files.length) return;
            e.preventDefault();
            attach(e.dataTransfer.files);
          }}
          className="p-3 pt-0 shrink-0"
        >
          {attached.length > 0 && (
            <div className="pb-2 space-y-1.5">
              <div className="flex flex-wrap gap-2">
                {attached.map((src, i) => (
                  <span key={i} className="relative">
                    <img src={src} alt={`Attached image ${i + 1}`} className="size-16 rounded-xl object-cover border border-line" />
                    <button type="button" aria-label={`Remove image ${i + 1}`} onClick={() => setAttached((a) => a.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-ink text-on-ink grid place-items-center"><X size={12} /></button>
                  </span>
                ))}
              </div>
              {!(aiMode === "local" && provider === "local") && (
                <p className="text-xs text-muted">Images go to {current?.label ?? "the AI"} as they are, not as a summary. Crop out account numbers first.</p>
              )}
            </div>
          )}
          {attachErr && <p className="text-xs text-bad pb-2">{attachErr}</p>}
          <div className="flex items-end gap-2 rounded-2xl border border-line bg-canvas/60 pl-2 pr-2 py-2 focus-within:border-muted/60 focus-within:bg-surface transition-colors">
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={(e) => { if (e.target.files) attach(e.target.files); e.target.value = ""; }} />
            <button
              type="button"
              aria-label="Add an image"
              onClick={() => fileInput.current?.click()}
              disabled={busy || off || current?.ready === false}
              className="grid place-items-center size-8 rounded-full text-muted hover:text-ink hover:bg-[var(--hover)] shrink-0 disabled:opacity-40"
            >
              <Paperclip size={17} />
            </button>
            <textarea
              onPaste={(e) => {
                const files = [...e.clipboardData.files];
                if (files.length) {
                  e.preventDefault();
                  attach(files);
                }
              }}
              ref={field}
              rows={1}
              aria-label="Ask broke ai"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              disabled={busy || off || current?.ready === false}
              placeholder={off ? "AI is off" : busy ? "Working on it..." : current?.ready === false ? `Set up ${current.label} to start` : "Ask about your spending"}
              className="flex-1 resize-none bg-transparent outline-none focus-visible:outline-none py-1.5 leading-6 placeholder:text-muted disabled:opacity-60"
            />
            <button
              type="submit"
              aria-label="Send"
              disabled={busy || (!input.trim() && !attached.length)}
              className="grid place-items-center size-8 rounded-full bg-ink text-on-ink shrink-0 transition-opacity disabled:opacity-25"
            >
              {busy ? <LoaderCircle size={16} className="animate-spin" /> : <ArrowUp size={16} strokeWidth={2.4} />}
            </button>
          </div>
          <p className="text-[11px] text-muted text-center mt-2">Runs on your own {current?.label ?? "AI"} {provider === "openrouter" ? "account" : "plan"}. Not financial advice.</p>
        </form>
      </div>
    </dialog>
  );
}

// Shown in place of the chat when the picked model isn't ready, and on Connect your AI: its steps with copyable commands,
// a button that opens Terminal with them typed in, and a re-check that keeps looking for a few minutes.
export function SetupCard({ p, recheck, auto }: { p: Provider; recheck: () => Promise<Provider[]>; auto?: boolean }) {
  // Hosted, and their computer has gone offline: the command to reconnect is on Connect your AI.
  if (p.helper) return <section className="rounded-2xl border border-line p-4 space-y-3"><p className="text-sm">{p.reason}</p><Link href="/connect-ai" className="btn !py-2 text-sm inline-block">Connect your AI</Link></section>;
  if (p.id !== "openrouter") return <CliSetup p={p} recheck={recheck} auto={auto} />;
  // OpenRouter has nothing to install: its whole setup is one sign-in, and the Connect your AI page has every other way.
  return (
      <section className="rounded-2xl border border-line p-4 space-y-3">
        <p className="font-semibold">Connect an AI to ask questions</p>
        <p className="text-sm text-muted">Make a free OpenRouter account and approve broke. No install, no key to copy, and free models cost nothing.</p>
        <div className="flex flex-wrap gap-2">
          <a href="/api/ai/openrouter/start" className="btn-primary !py-2 text-sm">Connect OpenRouter</a>
          <Link href="/connect-ai" className="btn !py-2 text-sm">Other ways</Link>
        </div>
      </section>
  );
}

// auto: opens Terminal as soon as it shows, because the user just pressed Sign in or Install.
function CliSetup({ p, recheck, auto }: { p: Provider; recheck: () => Promise<Provider[]>; auto?: boolean }) {
  const [state, setState] = useState<"idle" | "opening" | "waiting" | "manual">("idle");
  const [copied, setCopied] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const again = useRef(recheck);
  again.current = recheck;

  // After Terminal opens, check every 4 s for up to 3 minutes; the card disappears once it's ready.
  useEffect(() => {
    if (state !== "waiting") return;
    let n = 0;
    const t = setInterval(async () => {
      const list = await again.current();
      if (list.find((x) => x.id === p.id)?.ready || ++n >= 45) clearInterval(t);
    }, 4000);
    return () => clearInterval(t);
  }, [state, p.id]);

  async function openTerminal() {
    setState("opening");
    const res = await fetch("/api/models/setup", { method: "POST", body: JSON.stringify({ id: p.id }) });
    const body = await res.json().catch(() => ({}));
    if (body.ready) return void recheck();
    setState(body.opened ? "waiting" : "manual");
  }

  useEffect(() => {
    if (auto) void openTerminal();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = (cmd: string) => {
    navigator.clipboard?.writeText(cmd).then(() => { setCopied(cmd); setTimeout(() => setCopied(null), 1500); }).catch(() => {});
  };

  return (
    <section className="rounded-2xl border border-line p-4 space-y-4">
      <div className="space-y-1">
        <p className="font-semibold">{p.action === "Sign in" ? `Sign in to ${p.label}` : `${p.action ?? "Set up"} ${p.label}`}</p>
        <p className="text-sm text-muted">{(p.found ?? "It isn't ready on this computer yet").replace(/[.!]?$/, ".")} Press the button and Terminal opens for you. It runs on your own plan, so there&apos;s no API bill.</p>
      </div>
      {/* The steps are only needed when Terminal can't open by itself. */}
      {state === "manual" && <ol className="space-y-3">
        {(p.howTo ?? []).map((h, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <span className="grid place-items-center size-5 rounded-full bg-canvas text-xs text-muted shrink-0 mt-0.5 tabular">{i + 1}</span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <p>{h.href ? <a href={h.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{h.text}</a> : h.text}</p>
              {h.command && (
                <button type="button" onClick={() => copy(h.command!)} className="w-full flex items-center justify-between gap-2 rounded-lg bg-canvas px-3 py-2 font-mono text-xs text-left hover:bg-[var(--hover)]">
                  <span className="truncate">{h.command}</span>
                  <span className="text-muted shrink-0">{copied === h.command ? "Copied" : "Copy"}</span>
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={openTerminal} disabled={state === "opening" || state === "waiting"} className="btn-primary !py-2 text-sm">
          {state === "opening" ? "Opening Terminal..." : state === "waiting" ? "Waiting for you to finish..." : p.action ?? "Set up in Terminal"}
        </button>
        <button
          type="button"
          onClick={async () => { setChecking(true); await recheck(); setChecking(false); }}
          className="btn !py-2 text-sm"
        >
          {checking ? "Checking..." : "Check again"}
        </button>
      </div>
      {state === "waiting" && <p className="text-xs text-muted">Finish the steps in Terminal. This switches over by itself when {p.label} is ready.</p>}
      {state === "manual" && <p className="text-xs text-muted">Couldn&apos;t open Terminal from here. Copy the commands above into a terminal, then press Check again.</p>}
    </section>
  );
}

export function AskButton({ q, className, children }: { q?: string; className?: string; children: React.ReactNode }) {
  const { ask, toggle } = useAssistant();
  return (
    <button onClick={() => (q ? ask(q) : toggle())} className={className}>
      {children}
    </button>
  );
}

const TOOL_LABEL: Record<string, string> = {
  spending_summary: "Adding up your spending",
  search_transactions: "Searching your transactions",
  list_recurring: "Checking recurring charges",
  list_accounts: "Reading account balances",
  list_holdings: "Reading your investments",
  get_profile: "Reading your money profile",
  contribution_room: "Checking contribution room",
  fund_fees: "Checking fund fees",
  safe_to_spend: "Working out safe to spend",
  idle_cash: "Looking for idle cash",
  match_check: "Checking your employer match",
  subscription_alerts: "Looking for price hikes",
  cancel_info: "Finding how to cancel",
  card_recommendations: "Comparing credit cards",
  money_plan: "Reading your money plan",
  web_search: "Searching the web",
  WebSearch: "Searching the web",
  WebFetch: "Reading a web page",
};
// A tool without a label still reads as words: "mcp__x__new_tool" or "NewTool" becomes "New tool".
const toolLabel = (name: string) => {
  if (TOOL_LABEL[name]) return TOOL_LABEL[name];
  const words = name.replace(/^mcp__\w+?__/, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim().toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : "Working";
};

const Dots = () => (
  <span className="inline-flex gap-1 py-2" aria-label="Thinking">
    {[0, 150, 300].map((d) => <span key={d} className="size-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
  </span>
);

// Links in a reply: http(s) opens in a new tab, a path inside broke ("/recurring") is an in-app link. Anything else
// (javascript:, mailto:, relative text) stays plain text.
const APP_PATH = "(?:transactions|recurring|budgets|spending|plan|optimize|cards|accounts|settings|insights|setup)\\b[^\\s)<>,]*";
const INLINE = new RegExp(`(\\*\\*[^*]+\\*\\*)|\\[([^\\]\\n]+)\\]\\(([^)\\n]+)\\)|(https?:\\/\\/[^\\s<>()\\]]+)|((?<![\\w/.])\\/${APP_PATH})`, "g");
const linkCls = "underline underline-offset-2 decoration-muted/60 hover:decoration-ink";
function ReplyLink({ href, children }: { href: string; children: React.ReactNode }) {
  const h = href.trim();
  if (/^https?:\/\/[^\s]+$/i.test(h)) return <a href={h} target="_blank" rel="noopener noreferrer" className={linkCls}>{children}</a>;
  if (/^\/(?![/\\])/.test(h)) return <Link href={h.replace(/ /g, "%20")} className={linkCls}>{children}</Link>;
  return <>{children}</>;
}
function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    let [all] = m;
    const at = m.index!;
    // A bare link drops the full stop or comma that ends its sentence.
    const trail = m[4] || m[5] ? /[.,;:!?'"]+$/.exec(all)?.[0] ?? "" : "";
    if (trail) all = all.slice(0, -trail.length);
    out.push(text.slice(last, at));
    const k = out.length;
    if (m[1]) out.push(<strong key={k} className="font-semibold">{inline(m[1].slice(2, -2))}</strong>);
    else if (m[2]) out.push(<ReplyLink key={k} href={m[3]}>{m[2]}</ReplyLink>);
    else out.push(<ReplyLink key={k} href={all}>{all}</ReplyLink>);
    last = at + all.length;
  }
  out.push(text.slice(last));
  return out;
}

// Saves only what this country's profile questions allow (validSave), merged into the existing profile.
function SaveOffer({ proposed }: { proposed: Record<string, unknown> }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  async function save() {
    setState("saving");
    const sb = createClient();
    const { data } = await sb.auth.getUser();
    const profile = (data.user?.user_metadata?.profile ?? {}) as Record<string, unknown> & { goals?: string[]; goalPlans?: GoalPlan[] };
    const { fields, goals, goalPlans } = validSave(profile.country as string | undefined, proposed);
    // A new target replaces the old one for the same goal, and turns that goal on.
    const plans = [...(profile.goalPlans ?? []).filter((g) => !goalPlans.some((n) => n.goal === g.goal)), ...goalPlans];
    const next = { ...profile, ...fields, goals: [...new Set([...(profile.goals ?? []), ...goals, ...goalPlans.map((g) => g.goal)])], goalPlans: plans };
    const { error } = await updateMeta(sb, { data: { profile: next } });
    setState(error ? "failed" : "saved");
    if (!error) router.refresh();
  }
  return (
    <button onClick={save} disabled={state === "saving" || state === "saved"} className="btn !py-1 text-sm inline-flex items-center gap-1.5">
      {state === "saved" ? <><Check size={14} />Saved to your profile</> : state === "failed" ? "Couldn't save. Try again" : "Save to my profile"}
    </button>
  );
}

// The user's categories, read once per page: a breakdown row named after one gets its icon and colour.
type Cat = { label: string; icon: string | null; color: string | null };
let catsP: Promise<Cat[]> | null = null;
const loadCats = () => (catsP ??= Promise.resolve(createClient().from("categories").select("label, icon, color")).then((r) => (r.data ?? []) as Cat[]).catch(() => []));
function useCats() {
  const [cats, setCats] = useState<Cat[]>([]);
  useEffect(() => void loadCats().then(setCats), []);
  return cats;
}

function RowMark({ label, cats, size }: { label: string; cats: Cat[]; size: number }) {
  const c = cats.find((x) => x.label.toLowerCase() === label.toLowerCase());
  if (c) return <CategoryIcon icon={c.icon} color={c.color} size={size} />;
  return <Merchant name={label} />;
}

// A split of money: a total, then one row per category or merchant, largest first.
function BreakdownBlock({ b }: { b: Breakdown }) {
  const cats = useCats();
  const { money0 } = useMoney();
  const total = b.total ?? b.rows.reduce((n, r) => n + r.amount, 0);
  const max = Math.max(...b.rows.map((r) => r.amount));
  return (
    <section className="space-y-3">
      <div className="space-y-0.5">
        {b.title && <p className="text-[13px] text-muted">{b.title}</p>}
        <p className="text-[32px] leading-tight font-semibold tabular tracking-[-0.03em]">{money0(total)}</p>
      </div>
      <ul className="space-y-3">
        {b.rows.map((r) => (
          <li key={r.label} className="flex items-center gap-3">
            <RowMark label={r.label} cats={cats} size={32} />
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex justify-between gap-3"><span className="truncate">{r.label}</span><span className="tabular">{money0(r.amount)}</span></div>
              <div className="h-1 rounded-full bg-[var(--hover)] overflow-hidden"><div className="h-full rounded-full bg-ink/70" style={{ width: `${Math.max(2, (r.amount / max) * 100)}%` }} /></div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Things to do about the answer, as links to the broke page that does them.
function Actions({ actions }: { actions: Action[] }) {
  const href = (h: string) => h.replace(/ /g, "%20");
  return (
    <div className="rounded-2xl border border-line divide-y divide-line overflow-hidden">
      {actions.map((a) => (
        <Link key={a.label} href={href(a.href)} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--hover)] transition-colors">
          <span className="font-medium">{a.label}</span>
          <ChevronRight size={16} className="text-muted shrink-0" />
        </Link>
      ))}
    </div>
  );
}

// Follow-up questions: tapping one asks it.
function Next({ qs, onPick }: { qs: string[]; onPick: (q: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {qs.map((q) => (
        <button key={q} onClick={() => onPick(q)} className="rounded-full px-3.5 py-1.5 text-sm text-left transition-colors border border-line hover:bg-[var(--hover)]">
          {q}
        </button>
      ))}
    </div>
  );
}

// Tiny markdown: status lines (\u001e) become a step list, "- " bullets, "### " headings, **bold** and links.
function Reply({ text: raw, live, onPick }: { text: string; live: boolean; onPick?: (answer: string) => void }) {
  const { body: text, ask, save, budget, rules, breakdown, actions, next } = replyBlocks(raw);
  const lines = text.split("\n");
  // Each kind of step once, however many times the model repeats it. The latest stays last, so the spinner stays on it.
  const steps = [...new Set(lines.filter((l) => l.startsWith("\u001e")).map((l) => l.slice(1)).reverse())].reverse();
  const body = lines.filter((l) => !l.startsWith("\u001e"));
  const writing = body.some((l) => l.trim());
  const bold = inline;
  return (
    <>
      {!!steps.length && (
        <ul className="space-y-1.5 text-[13px] text-muted">
          {steps.map((name, i) => {
            const running = live && !writing && i === steps.length - 1;
            return (
              <li key={i} className="flex items-center gap-2">
                {running ? <LoaderCircle size={14} className="animate-spin shrink-0" /> : <Check size={14} className="text-good shrink-0" />}
                <span className={running ? "text-ink" : ""}>{toolLabel(name)}</span>
              </li>
            );
          })}
        </ul>
      )}
      {!writing && live && !steps.length && <Dots />}
      {body.map((line, i) => {
        if (!line.trim()) return null;
        if (/^#{1,4} /.test(line)) return <p key={i} className="font-semibold pt-1">{bold(line.replace(/^#+ /, ""))}</p>;
        const li = line.match(/^\s*([-*]|\d+\.) (.*)/);
        if (li)
          return (
            <p key={i} className="flex gap-2.5">
              <span className="text-muted tabular shrink-0 min-w-3">{/\d/.test(li[1]) ? li[1] : "•"}</span>
              <span>{bold(li[2])}</span>
            </p>
          );
        return <p key={i}>{bold(line)}</p>;
      })}
      {breakdown && !live && <BreakdownBlock b={breakdown} />}
      {!!actions.length && !live && <Actions actions={actions} />}
      {save && !live && <SaveOffer proposed={save} />}
      {budget && !live && <BudgetOffer proposed={budget} />}
      {rules && !live && <RuleOffer proposed={rules} />}
      {ask && !live && (
        <div className="space-y-2 pt-1">
          <p className="font-medium">{ask.q}</p>
          <div className="flex flex-wrap gap-2">
            {ask.options.map((o) => (
              <button key={o} onClick={() => onPick?.(o)} disabled={!onPick} className="rounded-full border border-line px-3.5 py-1.5 text-sm hover:bg-[var(--hover)] disabled:opacity-50 disabled:hover:bg-transparent">
                {o}
              </button>
            ))}
          </div>
        </div>
      )}
      {!!next.length && !ask && !live && onPick && <Next qs={next} onPick={onPick} />}
    </>
  );
}
