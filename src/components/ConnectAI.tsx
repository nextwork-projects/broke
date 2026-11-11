/* eslint-disable @next/next/no-img-element */ // tiny local SVG marks
"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveChoice, SetupCard, type Provider } from "@/components/Assistant";
import { Dropdown } from "@/components/Dropdown";
import { OPENROUTER_FREE, type ModelChoice } from "@/lib/llm/models";

const PLANS = ["claude", "codex", "gemini"], HERE = ["local", "opencode"];
// Brand marks (Simple Icons; ChatGPT from LobeHub icons), on a white tile so dark marks show in dark mode.
const LOGO: Record<string, string> = { claude: "claude", codex: "chatgpt", gemini: "gemini", local: "ollama", opencode: "opencode", openrouter: "openrouter" };
const AiLogo = ({ id }: { id: string }) =>
  LOGO[id] ? <span className="size-9 shrink-0 rounded-xl bg-white grid place-items-center"><img src={`/logos/ai/${LOGO[id]}.svg`} alt="" className="size-5" /></span> : null;

// The one place to connect an AI, easiest first. broke works without any of it: AI is only for asking questions.
export function ConnectAI({ initial, choice: saved, hosted, connected, failed }: { initial: Provider[]; choice: ModelChoice | null; hosted: boolean; connected: boolean; failed: boolean }) {
  const router = useRouter();
  const [providers, setProviders] = useState(initial);
  const [choice, setChoice] = useState(saved);
  const [setting, setSetting] = useState<string | null>(null);
  const openRouter = providers.find((p) => p.id === "openrouter");
  const recheck = () => fetch("/api/models?fresh=1").then((r) => r.json()).then((b: { providers: Provider[] }) => (setProviders(b.providers), b.providers));
  const use = (c: ModelChoice) => {
    setChoice(c);
    setSetting(null);
    saveChoice(c).then(({ error }) => error && console.error("[broke] model choice:", error.message));
  };
  async function disconnect() {
    await fetch("/api/ai/openrouter/disconnect", { method: "POST" });
    if (choice?.provider === "openrouter") setChoice(null);
    await recheck();
    router.refresh();
  }

  // Hosted: the command that connects the AI app on their own computer. The code in it works once, for 10 minutes.
  const [helperCmd, setHelperCmd] = useState<string | null>(null);
  async function connectComputer() {
    const res = await fetch("/api/ai/helper/pair", { method: "POST" });
    if (!res.ok) return setHelperCmd("");
    const { code } = (await res.json()) as { code: string };
    const site = window.location.origin;
    setHelperCmd(`curl -fsSL ${site}/broke-connect.cjs | node - ${site} ${code}`);
  }

  const row = (p: Provider) => (
    <li key={p.id} className="border-t border-line py-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 flex items-center gap-3">
          <AiLogo id={p.id} />
          <span className="min-w-0">
          <span className="block font-medium">{p.label}</span>
          {p.found && <span className={`block text-sm ${p.ready ? "text-good" : "text-muted"}`}>{p.found}</span>}
          </span>
        </span>
        {p.helper && !p.ready ? null : !p.ready ? <button className="btn shrink-0" onClick={() => setSetting(setting === p.id ? null : p.id)}>{p.action ?? "Set up"}</button>
          : choice?.provider === p.id ? <span className="text-sm text-muted flex items-center gap-1.5"><Check size={15} /> In use</span>
          : <button className="btn" onClick={() => use({ provider: p.id as ModelChoice["provider"], model: null })}>Use this</button>}
      </div>
      {setting === p.id && !p.ready && <SetupCard p={p} recheck={recheck} auto />}
    </li>
  );
  const group = (ids: string[]) => providers.filter((p) => ids.includes(p.id)).sort((a, b) => Number(b.ready) - Number(a.ready)).map(row);

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-muted">Connect an AI to ask questions about your money. The rest of broke works without one.</p>
      {connected && <p className="card px-5 py-3 text-sm" role="status">OpenRouter is connected. Press Ask broke ai to try it.</p>}
      {failed && <p className="card px-5 py-3 text-sm text-bad" role="alert">That didn&apos;t connect. Try again.</p>}

      <section className="card p-6 space-y-4">
        <div className="space-y-1">
          <h2 className="card-title flex items-center gap-3"><AiLogo id="openrouter" />OpenRouter</h2>
          <p className="text-sm text-muted">The easiest way if you don&apos;t have an AI yet. Make a free account, approve broke, and you&apos;re done. No install, no key to copy. Free models cost nothing. Paid ones use credits you add yourself.</p>
        </div>
        {openRouter?.ready ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-64">
              <Dropdown label="OpenRouter model" placeholder="Model" value={choice?.provider === "openrouter" ? choice.model ?? OPENROUTER_FREE : ""} options={(openRouter.models ?? []).map((m) => ({ value: m.id, label: m.label }))}
                onChange={(model) => use({ provider: "openrouter", model })} />
            </div>
            <button className="btn" onClick={disconnect}>Disconnect</button>
          </div>
        ) : (
          // A full page visit: the route redirects to OpenRouter, and a client-side link can't follow that.
          <a href="/api/ai/openrouter/start" className="btn-primary inline-block">Connect OpenRouter</a>
        )}
        <p className="text-xs text-muted">Free models can keep what they&apos;re sent. They only get a summary of your money: rounded totals with names hidden, never single transactions or account numbers.</p>
      </section>

      {hosted && (
        <section className="card p-6 space-y-3">
          <div className="space-y-1">
            <h2 className="card-title">Already pay for Claude, or use opencode?</h2>
            <p className="text-sm text-muted">Use it from your own computer, at no extra cost. Run one command there and leave it open. Your AI login stays on your computer, and broke only sends it the same summary of your money.</p>
          </div>
          <ul>{providers.filter((p) => p.helper).map(row)}</ul>
          {helperCmd === null && <button className="btn" onClick={connectComputer}>Connect my computer</button>}
          {helperCmd === "" && <p className="text-sm text-bad" role="alert">That didn&apos;t work. Try again.</p>}
          {helperCmd && (
            <div className="space-y-2">
              <p className="text-sm">Paste this in Terminal, then press Check again. The code in it works once, for 10 minutes.</p>
              <code className="block text-xs break-all rounded-lg border border-line p-3">{helperCmd}</code>
              <div className="flex gap-2">
                <button className="btn" onClick={() => navigator.clipboard.writeText(helperCmd)}>Copy</button>
                <button className="btn" onClick={recheck}>Check again</button>
              </div>
            </div>
          )}
          <p className="text-xs text-muted">AI only answers while that command is running. Claude and opencode run with every tool off. ChatGPT and Gemini only work when broke runs on your own computer.</p>
        </section>
      )}
      {!hosted && (
        <>
          <section className="card p-6 space-y-2">
            <h2 className="card-title">Already pay for Claude, ChatGPT or Gemini?</h2>
            <p className="text-sm text-muted">Use that plan, at no extra cost. broke checked this computer, and pressing a button opens Terminal for you.</p>
            <ul className="pt-1">{group(PLANS)}</ul>
          </section>
          <section className="card p-6 space-y-2">
            <h2 className="card-title">Run AI on this computer</h2>
            <p className="text-sm text-muted">The most private. A local model never sends anything out, but it&apos;s a few GB to download and can give weaker answers. opencode runs open-source models.</p>
            <ul className="pt-1">{group(HERE)}</ul>
          </section>
        </>
      )}
      <Link href="/" className="btn inline-block">Back to home</Link>
    </div>
  );
}
