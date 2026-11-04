"use client";

import { useEffect, useState } from "react";
import { Dropdown } from "@/components/Dropdown";

const TITLE: Record<string, { title: string; body: string }> = {
  enablebanking: { title: "Link your bank", body: "Pick your bank and approve on its own page. broke can only read, it can't move money." },
  basiq: { title: "Link your bank", body: "Approve on a secure page run by Basiq. broke can only read, it can't move money." },
  belvo: { title: "Conectar seu banco", body: "Open Finance needs your CPF and full name. They go to Belvo for your consent and broke doesn't keep them. broke can only read." },
};

// One hosted-consent connection: asks what it needs, then sends the user to the vendor's or the bank's page.
export function FeedConnect({ id, country }: { id: string; country: string }) {
  const [banks, setBanks] = useState<string[] | null>(null);
  const [bank, setBank] = useState("");
  const [cpf, setCpf] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (id !== "enablebanking") return;
    fetch(`/api/bank/connect/${id}/start?country=${country}`).then((r) => r.json()).then((b: { banks?: string[]; error?: string }) => {
      setBanks(b.banks ?? []);
      if (b.error) setErr(b.error);
    }).catch(() => setErr("Couldn't load the bank list."));
  }, [id, country]);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const res = await fetch(`/api/bank/connect/${id}/start`, { method: "POST", body: JSON.stringify({ bank, country, cpf, name }) }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    if (res?.ok && body?.url) return void (window.location.href = body.url);
    setErr(body?.error ?? "Couldn't start the connection.");
    setBusy(false);
  }
  const t = TITLE[id];
  const ready = id === "enablebanking" ? !!bank : id === "belvo" ? !!cpf && !!name : true;
  return (
    <form onSubmit={go} className="card p-5 space-y-3">
      <div>
        <div className="card-title">{t.title}</div>
        <p className="text-sm text-muted mt-0.5">{t.body}</p>
      </div>
      {id === "enablebanking" && <Dropdown label="Your bank" placeholder={banks ? "Choose your bank" : "Loading banks..."} searchable value={bank} options={(banks ?? []).map((b) => ({ value: b, label: b }))} onChange={setBank} />}
      {id === "belvo" && (
        <div className="grid gap-3 @lg:grid-cols-2">
          <input value={cpf} onChange={(e) => setCpf(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="CPF" aria-label="CPF" className="select" />
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Nome completo" aria-label="Nome completo" className="select" />
        </div>
      )}
      <button disabled={!ready || busy} className="btn-primary">{busy ? "Opening..." : "Continue"}</button>
      {err && <p className="text-sm text-bad">{err}</p>}
    </form>
  );
}
