"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { createClient } from "@/utils/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  const [firstRun, setFirstRun] = useState<string | null>(null);
  const [devLogin, setDevLogin] = useState(false);
  useEffect(() => {
    fetch("/api/setup/first-run").then((r) => r.json()).then((b: { supabase?: string; devLogin?: boolean }) => {
      setFirstRun(b.supabase ?? null);
      setDevLogin(!!b.devLogin);
    }).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setState("error");
      setMessage(error.message);
    } else setState("sent");
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
      <form onSubmit={submit} className="card p-8 space-y-5">
        <div>
          <Logo />
          <p className="text-sm text-muted mt-1">Sign in with a link sent to your email.</p>
        </div>
        {state === "sent" ? (
          <p className="text-sm">Check {email} for the sign-in link.</p>
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
              {state === "sending" ? "Sending..." : "Send link"}
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
