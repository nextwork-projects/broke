"use client";

// One file per icon: the package barrel pulls in all ~1,500 icons and slowed every dev compile.
import { BankIcon } from "@phosphor-icons/react/dist/ssr/Bank";
import { CarIcon } from "@phosphor-icons/react/dist/ssr/Car";
import { CheckIcon } from "@phosphor-icons/react/dist/ssr/Check";
import { CaretRightIcon } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { ChartLineUpIcon } from "@phosphor-icons/react/dist/ssr/ChartLineUp";
import { CreditCardIcon } from "@phosphor-icons/react/dist/ssr/CreditCard";
import { CurrencyBtcIcon } from "@phosphor-icons/react/dist/ssr/CurrencyBtc";
import { FileArrowUpIcon } from "@phosphor-icons/react/dist/ssr/FileArrowUp";
import { HouseIcon } from "@phosphor-icons/react/dist/ssr/House";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { MoneyIcon } from "@phosphor-icons/react/dist/ssr/Money";
import { PiggyBankIcon } from "@phosphor-icons/react/dist/ssr/PiggyBank";
import { WalletIcon } from "@phosphor-icons/react/dist/ssr/Wallet";
import type { Icon } from "@phosphor-icons/react";
import { X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Dropdown } from "@/components/Dropdown";
import { ImportStatement } from "@/components/ImportStatement";
import { Modal } from "@/components/Modal";
import { useMoney } from "@/components/Money";
import { FeedConnect } from "@/components/FeedConnect";
import { linkedText, TestModeNote, useAkahu, useLinkBank } from "@/components/PlaidButtons";
import { toast } from "@/components/Toast";
import type { AddChoices } from "@/lib/providers";
import { createClient } from "@/utils/supabase/client";

type Acct = { id: string; label: string };

// Overlapping circles. Soft = brand tint, dark = ink with light icons.
function Cluster({ icons, dark = false }: { icons: Icon[]; dark?: boolean }) {
  return (
    <span className="flex">
      {icons.map((I, i) => (
        <span key={i} className={`size-11 rounded-full grid place-items-center ring-[3px] ring-surface ${i ? "-ml-3" : ""} ${dark ? "bg-ink text-on-ink" : "bg-brand-soft text-brand"}`}>
          <I size={22} weight="duotone" />
        </span>
      ))}
    </span>
  );
}

function Card({ icons, dark, title, body, onClick, busy, error }: { icons: Icon[]; dark?: boolean; title: string; body: string; onClick: () => void; busy?: string | false; error?: string }) {
  return (
    <button onClick={onClick} disabled={!!busy} className="card-link w-full text-left p-5 flex items-center gap-4 disabled:opacity-60">
      <span className="flex-1 min-w-0 space-y-4">
        <Cluster icons={icons} dark={dark} />
        <span className="block">
          <span className="block card-title">{title}</span>
          <span className="block text-sm text-muted mt-0.5">{busy || body}</span>
          {error && <span className="block text-xs text-bad mt-1">{error}</span>}
        </span>
      </span>
      <CaretRightIcon size={20} className="text-muted shrink-0" />
    </button>
  );
}

type LinkState = ReturnType<typeof useLinkBank>;
const importing = (l: LinkState) => (l.kind === "investments" ? "Importing holdings..." : "Importing transactions...");

function PlaidCard({ link }: { link: LinkState }) {
  return <Card icons={[BankIcon, CreditCardIcon, WalletIcon]} title="Link a bank or card" body="Checking, savings and credit cards" onClick={() => link.start()} busy={link.busy && link.kind === "bank" && importing(link)} />;
}
function AkahuCard() {
  const { start, busy, error } = useAkahu();
  return <Card icons={[BankIcon, CreditCardIcon, WalletIcon]} title="Link a bank or card" body="Every NZ bank on your Akahu login" onClick={start} busy={busy && "Importing transactions..."} error={error} />;
}
function InvestCard({ link }: { link: LinkState }) {
  return <Card icons={[ChartLineUpIcon, PiggyBankIcon]} title="Link investments or retirement" body="Brokerage, 401(k), IRA or HSA" onClick={() => link.start(false, "investments")} busy={link.busy && link.kind === "investments" && importing(link)} />;
}

// Plaid Link has its own institution search. Its link token takes no search term (plaid.com/docs/api/link, read 2026-10-22), so this only opens Link.
function Search({ link }: { link: LinkState }) {
  return (
    <button onClick={() => link.start()} disabled={link.busy} className="input w-full !py-3 flex items-center gap-3 text-left text-muted hover:border-ink">
      <MagnifyingGlassIcon size={18} />
      {link.busy ? importing(link) : "Search for your bank"}
    </button>
  );
}

function TestBanks({ link, investments }: { link: LinkState; investments: boolean }) {
  const cls = "underline underline-offset-2 hover:text-ink disabled:opacity-50";
  return (
    <div className="px-1 space-y-2">
    <TestModeNote />
    <p className="text-sm text-muted flex flex-wrap gap-x-3 gap-y-1">
      <span>Or add one straight away:</span>
      <button className={cls} disabled={link.busy} onClick={() => link.start(true)}>{link.busy && link.kind === "bank" ? "Importing..." : "Test bank"}</button>
      {investments && <button className={cls} disabled={link.busy} onClick={() => link.start(true, "investments")}>{link.busy && link.kind === "investments" ? "Importing..." : "Test investments"}</button>}
    </p>
    </div>
  );
}

// While a link runs (about 20 s on a big bank), then what it brought in, or why it failed.
function LinkStatus({ link }: { link: LinkState }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!link.busy) return;
    setSecs(0);
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [link.busy]);
  if (link.busy)
    return (
      <section className="card p-5 space-y-3" role="status" aria-live="polite">
        <div className="flex items-center justify-between gap-3">
          <span className="card-title">{importing(link)}</span>
          <span className="text-sm text-muted tabular">{secs} s</span>
        </div>
        <div className="h-1.5 rounded-full bg-line overflow-hidden"><div className="h-full w-1/3 rounded-full bg-brand animate-[slide_1.2s_ease-in-out_infinite]" /></div>
        <p className="text-sm text-muted">This can take up to 30 seconds. Keep this page open.</p>
      </section>
    );
  if (link.error) return <section className="card p-5 text-sm text-bad" role="status">{link.error}</section>;
  if (link.result)
    return (
      <section className="card p-5 flex flex-wrap items-center gap-4" role="status">
        <span className="size-9 rounded-full bg-brand-soft text-brand grid place-items-center shrink-0"><CheckIcon size={18} weight="bold" /></span>
        <span className="flex-1 min-w-0 font-medium">{linkedText(link.result)}</span>
        <span className="flex gap-2">
          <Link href="/accounts" className="btn">See accounts</Link>
          <Link href="/" className="btn-primary">Open dashboard</Link>
        </span>
      </section>
    );
  return null;
}

// Manual accounts (migration 0012). type decides the Accounts group and whether it counts as a debt there.
const KINDS = [
  { value: "vehicle", label: "Car or other vehicle", type: "other", placeholder: "e.g. 2019 Corolla" },
  { value: "property", label: "Home or property", type: "other", placeholder: "e.g. Our house" },
  { value: "crypto", label: "Crypto", type: "investment", placeholder: "e.g. Bitcoin wallet" },
  { value: "cash", label: "Cash", type: "depository", placeholder: "e.g. Cash at home" },
  { value: "other", label: "Something else you own", type: "other", placeholder: "e.g. Watch" },
  { value: "owed", label: "Something you owe", type: "loan", placeholder: "e.g. Car loan" },
];

function AddAsset() {
  const router = useRouter();
  const { money, parseAmount } = useMoney();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ kind: KINDS[0].value, name: "", value: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const kind = KINDS.find((k) => k.value === f.kind)!;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = Math.abs(parseAmount(f.value));
    if (!f.name.trim()) return setErr("Add a name.");
    if (Number.isNaN(value)) return setErr("Add a value.");
    setBusy(true);
    setErr("");
    const { error } = await createClient().from("accounts").insert({
      name: f.name.trim(), type: kind.type, subtype: kind.value === "owed" ? "other" : kind.value, current_balance: value, manual: true,
    });
    setBusy(false);
    if (error) return setErr(/manual/.test(error.message) ? "Manual accounts need a database update. Open Setup to run it." : "Couldn't save that account.");
    setOpen(false);
    toast(`${f.name.trim()} added`);
    router.push("/accounts");
    router.refresh();
  }

  return (
    <>
      <Card icons={[MoneyIcon, CarIcon, HouseIcon, CurrencyBtcIcon]} dark title="Add something else" body="Cash, a car, a home, or crypto" onClick={() => setOpen(true)} />
      {open && (
        <Modal label="Add something else" onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="card-title">Add something else</div>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="p-2 -mr-2 rounded-full hover:bg-[var(--hover)]"><X size={18} /></button>
            </div>
            <div className="space-y-1.5">
              <span className="block text-sm font-medium">Type</span>
              <Dropdown label="Type" value={f.kind} onChange={(k) => setF({ ...f, kind: k })} placeholder="Choose a type" options={KINDS.map(({ value, label }) => ({ value, label }))} />
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Name</span>
              <input data-autofocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={kind.placeholder} className="select" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{kind.type === "loan" ? "Amount owed" : "Value"}</span>
              <input inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} placeholder={money(0)} className="select tabular" />
            </label>
            {err && <p className="text-sm text-bad">{err}</p>}
            <button disabled={busy} className="btn-primary w-full !py-2.5">{busy ? "Saving..." : "Add account"}</button>
          </form>
        </Modal>
      )}
    </>
  );
}

export function AddAccounts({ choices, accounts, locale, currency, country }: { choices: AddChoices; accounts: Acct[]; locale: string; currency: string; country: string }) {
  // One link at a time, so every button shares one hook and one status card.
  const link = useLinkBank(undefined, { quiet: true });
  return (
    <div className="space-y-4">
      <LinkStatus link={link} />
      {choices.bank === "plaid" && <Search link={link} />}
      {choices.feeds.map((f) => <FeedConnect key={f} id={f} country={country} />)}
      <div className="grid grid-cols-1 @xl:grid-cols-2 gap-4">
        {choices.bank === "plaid" && <PlaidCard link={link} />}
        {(choices.bank === "akahu" || choices.alsoAkahu) && <AkahuCard />}
        {choices.investments && <InvestCard link={link} />}
        <ImportStatement accounts={accounts} locale={locale} currency={currency} trigger={(open) => (
          <Card icons={[FileArrowUpIcon]} dark title="Import a statement" body="A CSV, OFX, QFX, QIF or PDF file from your bank" onClick={open} />
        )} />
        <AddAsset />
      </div>
      {choices.sandbox && <TestBanks link={link} investments={choices.investments} />}
    </div>
  );
}
