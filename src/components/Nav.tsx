"use client";

import { ArrowLeftRight, ChartPie, ClipboardList, Ellipsis, House, Landmark, MessageCircle, Monitor, Moon, Sun } from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAssistant } from "@/components/Assistant";
import { BookmarkButton, SavedList } from "@/components/Bookmarks";
import { DonateLink, DonatePrompt } from "@/components/Donate";

// Spending holds Budgets and Recurring as tabs, Plan holds Optimize, Bonuses and Cards, More holds the rest. Every page keeps its own URL.
type Icon = ComponentType<{ size?: number; strokeWidth?: number }>;
const LINKS: { href: string; label: string; icon: Icon }[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/spending", label: "Spending", icon: ChartPie },
  { href: "/transactions", label: "Activity", icon: ArrowLeftRight },
  { href: "/plan", label: "Plan", icon: ClipboardList },
  { href: "/accounts", label: "Accounts", icon: Landmark },
  { href: "/more", label: "More", icon: Ellipsis },
];
const SPENDING = [{ href: "/spending", label: "Overview" }, { href: "/budgets", label: "Budgets" }, { href: "/recurring", label: "Recurring" }];
const PLAN = [{ href: "/plan", label: "Money plan" }, { href: "/optimize", label: "Optimize" }, { href: "/bonuses", label: "Bonuses" }, { href: "/cards", label: "Cards" }];
const under = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
const tabsOf = (path: string) => [SPENDING, PLAN].find((g) => g.some((t) => under(path, t.href)));
const sectionOf = (path: string) => (SPENDING.some((t) => under(path, t.href)) ? "/spending" : PLAN.some((t) => under(path, t.href)) ? "/plan" : LINKS.find((l) => under(path, l.href))?.href ?? (under(path, "/connect-ai") || under(path, "/debt") ? "/more" : undefined));

const TITLES: Record<string, string> = {
  "/": "Home", "/transactions": "Activity", "/spending": "Spending", "/budgets": "Budgets", "/recurring": "Recurring", "/plan": "Money plan",
  "/optimize": "Optimize", "/bonuses": "Bonuses", "/cards": "Cards", "/accounts": "Accounts", "/accounts/add": "Add accounts", "/settings": "Settings", "/more": "More", "/debt": "Debt", "/connect-ai": "Connect your AI", "/go-live": "Use your real bank",
};

export function Nav() {
  const path = usePathname();
  const assistant = useAssistant();
  const section = sectionOf(path);
  return (
    <>
    <PhoneBar section={section} />
    <nav className="hidden md:flex flex-col gap-0.5" aria-label="Main">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = href === section;
        return (
          <Link
            key={href}
            href={href}
            prefetch // whole page, data included, so a click shows it at once (production only; dev never prefetches)
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 px-3 py-2 rounded-xl text-[14px] whitespace-nowrap transition-colors ${active ? "bg-canvas text-ink font-medium" : "text-ink/70 hover:text-ink hover:bg-canvas/60"}`}
          >
            <Icon size={18} strokeWidth={active ? 2 : 1.6} />
            {label}
          </Link>
        );
      })}
      <button
        onClick={assistant.toggle}
        aria-pressed={assistant.open}
        className={`mt-5 flex items-center gap-3 px-3 py-2 rounded-xl text-[14px] whitespace-nowrap border transition-colors ${assistant.open ? "bg-canvas border-line font-medium" : "border-line text-ink/80 hover:text-ink hover:bg-canvas/60"}`}
      >
        <MessageCircle size={18} strokeWidth={1.6} />
        <span className="flex-1 text-left">Ask broke ai</span>
      </button>
      <DonateLink className="flex items-center gap-3 px-3 py-2 rounded-xl text-[14px] whitespace-nowrap text-ink/70 hover:text-ink hover:bg-canvas/60" />
      <Suspense><SavedList /></Suspense>
    </nav>
    <DonatePrompt />
    </>
  );
}

// The tab bar on top of Spending and Plan pages. Lives in the layout, so it stays put while a tab loads.
// cards: the Cards tab applies in the user's country (countries.ts).
export function SectionTabs({ cards = true }: { cards?: boolean }) {
  const path = usePathname();
  const tabs = tabsOf(path)?.filter((t) => cards || t.href !== "/cards");
  if (!tabs) return null;
  return (
    <nav data-tabs aria-label="Related pages" className="pill-tabs mb-6 max-w-full overflow-x-auto">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} prefetch aria-current={under(path, t.href) ? "page" : undefined} className={`pill-tab whitespace-nowrap ${under(path, t.href) ? "pill-tab-active" : ""}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

function PhoneBar({ section }: { section?: string }) {
  const assistant = useAssistant();
  const cell = "flex flex-col items-center gap-0.5 text-[11px] py-1.5 rounded-xl";
  return (
    <nav aria-label="Main" className="fixed bottom-0 inset-x-0 z-30 md:hidden bg-surface border-t border-line grid grid-cols-7 px-1 pt-1 pb-[max(6px,env(safe-area-inset-bottom))]">
      {LINKS.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} prefetch aria-current={href === section ? "page" : undefined} className={`${cell} ${href === section ? "text-ink font-medium" : "text-muted"}`}>
          <Icon size={21} strokeWidth={href === section ? 2 : 1.6} />
          {label}
        </Link>
      ))}
      <button onClick={assistant.toggle} className={`${cell} text-brand ${assistant.open ? "font-medium" : ""}`}>
        <MessageCircle size={21} strokeWidth={1.8} />
        Ask AI
      </button>
    </nav>
  );
}

// Tells the server the browser's time zone, so "today" and "this month" match the user's clock. Refreshes once when it changes.
export function TimeZoneCookie() {
  const router = useRouter();
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz || document.cookie.split("; ").includes(`tz=${tz}`)) return;
    document.cookie = `tz=${tz}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [router]);
  return null;
}

// today (YYYY-MM-DD) comes from the server (user's time zone) so Home's "October 2026" renders the same on server and client.
export function PageTitle({ today }: { today: string }) {
  const path = usePathname();
  const key = "/" + (path.split("/")[1] ?? "");
  const title = TITLES[path] ?? TITLES[key] ?? "";
  const month = new Date(today + "T00:00:00Z").toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  return (
    <div className="flex items-center gap-1.5">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">{key === "/" ? <>{month} <span className="text-muted font-normal">{today.slice(0, 4)}</span></> : title}</h1>
      <Suspense><BookmarkButton title={key === "/" ? "Home" : title} /></Suspense>
    </div>
  );
}

const THEMES = [["system", "System", Monitor], ["light", "Light", Sun], ["dark", "Dark", Moon]] as const;

// System / Light / Dark. Saved in localStorage; layout.tsx applies it before paint.
export function ThemeToggle() {
  const [theme, setTheme] = useState("system");
  useEffect(() => setTheme(document.documentElement.dataset.theme ?? "system"), []);
  function pick(t: string) {
    setTheme(t);
    if (t === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    try {
      if (t === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", t);
    } catch {}
  }
  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex gap-0.5 rounded-full border border-line p-0.5">
      {THEMES.map(([t, label, Icon]) => (
        <button
          key={t}
          role="radio"
          aria-checked={theme === t}
          aria-label={label}
          title={label}
          onClick={() => pick(t)}
          className={`p-1.5 rounded-full ${theme === t ? "bg-canvas text-ink" : "text-muted hover:text-ink"}`}
        >
          <Icon size={14} strokeWidth={1.8} />
        </button>
      ))}
    </div>
  );
}

const SKINS = [
  { id: "default", label: "Default", what: "Clean and quiet", preview: { background: "#fff" }, side: { background: "#f6f6f5", borderRight: "1px solid #ececea" }, body: { background: "linear-gradient(#fff 0 38%, #e2e5fb 38% 46%, #fff 46%)" } },
  { id: "retro", label: "Retro", what: "Aqua gel and brushed metal", preview: { background: "repeating-linear-gradient(0deg,#e4e7ec 0 2px,#eef0f3 2px 4px)" }, side: { background: "linear-gradient(#eceef1,#c3c8cf)", borderRight: "1px solid #adb3bd" }, body: { background: "linear-gradient(transparent 0 32%, #5ea6f6 32% 46%, transparent 46%) 10px 0/42% 100% no-repeat" } },
] as const;

// Default or Retro (globals.css, :root[data-skin="retro"]). Saved in localStorage; layout.tsx applies it before paint.
export function SkinPicker() {
  const [skin, setSkin] = useState("default");
  useEffect(() => setSkin(document.documentElement.dataset.skin ?? "default"), []);
  function pick(s: string) {
    setSkin(s);
    if (s === "default") delete document.documentElement.dataset.skin;
    else document.documentElement.dataset.skin = s;
    try {
      if (s === "default") localStorage.removeItem("skin");
      else localStorage.setItem("skin", s);
    } catch {}
  }
  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-3 max-w-md">
      {SKINS.map((s) => (
        <button key={s.id} role="radio" aria-checked={skin === s.id} onClick={() => pick(s.id)}
          className={`text-left rounded-xl border p-2 space-y-2 ${skin === s.id ? "border-brand ring-1 ring-brand" : "border-line hover:border-muted"}`}>
          <span className="grid grid-cols-[28%_1fr] h-16 rounded-md overflow-hidden border border-black/10" style={s.preview} aria-hidden><i style={s.side} /><i style={s.body} /></span>
          <span className="block text-sm font-medium px-0.5">{s.label}</span>
          <span className="block text-xs text-muted px-0.5">{s.what}</span>
        </button>
      ))}
    </div>
  );
}
