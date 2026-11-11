"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { createClient } from "@/utils/supabase/client";

// Sign in with a code from your email. The same email also has a link, which still works (/auth/callback).
// Rate limits and wrong-browser links were the common trouble with links alone; a code works in any tab.
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "checking" | "error">("idle");
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");
  const [firstRun, setFirstRun] = useState<string | null>(null);
  const [devLogin, setDevLogin] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "link") {
      setState("error");
      setMessage("That sign-in link didn't work. Each link works once, for about an hour, and only in the browser you asked for it from. Send a new email and open its link here.");
    }
    fetch("/api/setup/first-run").then((r) => r.json()).then((b: { supabase?: string; devLogin?: boolean }) => {
      setFirstRun(b.supabase ?? null);
      setDevLogin(!!b.devLogin);
    }).catch(() => {});
  }, []);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    setState("sending");
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setState("error");
      setMessage(/rate limit|too many/i.test(error.message) ? "Too many sign-in emails for now. Supabase's free email sends a few an hour. Wait a bit, or use the link from the last email." : error.message);
    } else {
      setSent(true);
      setCode("");
      setState("sent");
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setState("checking");
    const { error } = await createClient().auth.verifyOtp({ email, token: code.replace(/\s/g, ""), type: "email" });
    if (error) {
      setState("error");
      setCode(""); // ready for the right one, not mixed in with the wrong one
      setMessage(/expired|invalid/i.test(error.message) ? "That code didn't work. Codes work once, for about an hour. Check you typed the newest one, or send a new email." : error.message);
    } else window.location.assign("/"); // a full load: the page cache may still hold "/" from before sign-in (a redirect back here)
  }

  return (
    <main className="min-h-screen grid place-items-center px-4 bg-canvas">
      <div className="w-full max-w-sm space-y-4">
      {firstRun && (
        <section className="card p-5 space-y-2 text-sm">
          <p className="font-medium">One step before your first sign-in</p>
          <p className="text-muted">Tell Supabase this site&apos;s address, or the email will link to the wrong place.</p>
          <ol className="space-y-1 list-decimal pl-5">
            <li>Open <a className="underline underline-offset-2" href={firstRun}>URL Configuration in Supabase</a>.</li>
            <li>Set Site URL to <code className="break-all">{window.location.origin}</code> and press Save.</li>
          </ol>
        </section>
      )}
      <form onSubmit={sent ? verify : send} className="card p-8 space-y-5">
        <div>
          <Logo />
          <p className="text-sm text-muted mt-1">{sent ? `We sent an email to ${email}.` : "Sign in with your email."}</p>
        </div>
        {sent ? (
          <>
            <p className="text-sm">Open the sign-in link in that email, in this browser. Or, if the email has a code, type it here.</p>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, ""))}
              placeholder="Code"
              aria-label="Code from the email"
              className="input w-full tabular tracking-[0.2em] text-center text-lg"
            />
            <button disabled={state === "checking" || code.replace(/\s/g, "").length < 6} className="btn-primary w-full">
              {state === "checking" ? "Checking..." : "Sign in"}
            </button>
            {state === "error" && <p className="text-sm text-red-600">{message}</p>}
            <div className="flex justify-between text-sm">
              <button type="button" onClick={() => send()} disabled={state === "sending"} className="text-muted underline underline-offset-4">{state === "sending" ? "Sending..." : "Send a new email"}</button>
              <button type="button" onClick={() => { setSent(false); setState("idle"); }} className="text-muted underline underline-offset-4">Use another email</button>
            </div>
          </>
        ) : (
          <>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="input w-full"
            />
            <button disabled={state === "sending"} className="btn-primary w-full">
              {state === "sending" ? "Sending..." : "Send sign-in email"}
            </button>
            {state === "error" && <p className="text-sm text-red-600">{message}</p>}
            {devLogin && (
              <button type="button" onClick={async () => (window.location.href = (await fetch("/auth/dev", { method: "POST" })).url)} className="block w-full text-center text-sm text-muted underline underline-offset-4">Skip login (dev only)</button>
            )}
          </>
        )}
      </form>
      </div>
    </main>
  );
}
