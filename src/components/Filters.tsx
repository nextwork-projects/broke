"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Dropdown } from "@/components/Dropdown";
import { CategoryIcon } from "@/components/Icons";
import { RangePicker } from "@/components/RangePicker";

type Opt = { id: string; label: string; icon?: string; color?: string };

// Filters apply on change (search after a short pause), and the URL keeps them so back/refresh work.
export function Filters({ categories, accounts, tags = [], today }: { categories: Opt[]; accounts: Opt[]; tags?: string[]; today: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [pending, start] = useTransition();

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("limit");
    start(() => router.replace(`${path}?${next}`, { scroll: false }));
  };

  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const t = setTimeout(() => update("q", q), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const from = params.get("from") ?? "", to = params.get("to") ?? "";
  const [custom, setCustom] = useState(!!(from || to));
  const dates = (a: string, b: string, range = "") => {
    const next = new URLSearchParams(params);
    for (const [k, v] of [["from", a], ["to", b], ["range", range]]) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("limit");
    start(() => router.replace(`${path}?${next}`, { scroll: false }));
  };

  const active = ["q", "range", "from", "to", "category", "account", "tag"].some((k) => params.get(k));

  return (
    <div className="space-y-3 relative z-20">
    <div className={`card @2xl:!rounded-full !overflow-visible relative z-20 flex flex-wrap items-center gap-1 px-3 py-2 transition-opacity ${pending ? "opacity-70" : ""}`}>
      <label className="flex items-center gap-2 flex-1 min-w-48 px-3 rounded-full focus-within:ring-2 focus-within:ring-brand/60">
        <Search size={16} className="text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search merchants" aria-label="Search transactions" className="flex-1 outline-none focus-visible:outline-none text-sm bg-transparent py-1.5" />
      </label>
      <Dropdown
        label="Date range"
        value={custom ? "custom" : params.get("range") ?? ""}
        onChange={(v) => {
          setCustom(v === "custom");
          if (v !== "custom") dates("", "", v);
        }}
        options={[
          { value: "", label: "All dates" },
          { value: "30", label: "Last 30 days" },
          { value: "90", label: "Last 90 days" },
          { value: "365", label: "Last year" },
          { value: "custom", label: "Custom dates" },
        ]}
      />
      <Dropdown
        label="Categories"
        searchable
        value={params.get("category") ?? ""}
        onChange={(v) => update("category", v)}
        options={[{ value: "", label: "All categories" }, ...categories.map((c) => ({ value: c.id, label: c.label, icon: <CategoryIcon icon={c.icon} color={c.color} size={22} /> }))]}
      />
      <Dropdown
        label="Accounts"
        value={params.get("account") ?? ""}
        onChange={(v) => update("account", v)}
        options={[{ value: "", label: "All accounts" }, ...accounts.map((a) => ({ value: a.id, label: a.label }))]}
      />
      {!!tags.length && (
        <Dropdown
          label="Tags"
          searchable
          value={params.get("tag") ?? ""}
          onChange={(v) => update("tag", v)}
          options={[{ value: "", label: "All tags" }, ...tags.map((t) => ({ value: t, label: t }))]}
        />
      )}
      {active && (
        <button
          onClick={() => {
            setQ("");
            setCustom(false);
            start(() => router.replace(path, { scroll: false }));
          }}
          className="filter flex items-center gap-1 text-muted"
        >
          <X size={14} /> Clear
        </button>
      )}
    </div>
    {custom && (
      <section className="card px-5 py-4">
        <RangePicker key={`${from}|${to}`} from={from} to={to} today={today} onApply={(a, b) => dates(a, b)} />
      </section>
    )}
    </div>
  );
}
