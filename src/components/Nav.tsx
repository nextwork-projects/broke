"use client";

import { ArrowLeftRight, ChartPie, Ellipsis, House, Landmark, MessageCircle, Monitor, Moon, Sun } from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAssistant } from "@/components/Assistant";
import { BookmarkButton, SavedList } from "@/components/Bookmarks";

// Home is the three steps. Spending holds Budgets and Recurring as tabs, More holds the rest; every page keeps its own URL.
type Icon = ComponentType<{ size?: number; strokeWidth?: number }>;
const LINKS: { href: string; label: string; icon: Icon }[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/spending", label: "Spending", icon: ChartPie },
  { href: "/transactions", label: "Activity", icon: ArrowLeftRight },
  { href: "/accounts", label: "Accounts", icon: Landmark },
  { href: "/more", label: "More", icon: Ellipsis },
];
const SPENDING = [{ href: "/spending", label: "Overview" }, { href: "/budgets", label: "Budgets" }, { href: "/recurring", label: "Recurring" }];
const PLAN = [{ href: "/plan", label: "Money plan" }, { href: "/optimize", label: "Optimize" }, { href: "/bonuses", label: "Bonuses" }, { href: "/cards", label: "Cards" }];
const under = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
const tabsOf = (path: string) => [SPENDING, PLAN].find((g) => g.some((t) => under(path, t.href)));
const sectionOf = (path: string) => (SPENDING.some((t) => under(path, t.href)) ? "/spending" : LINKS.find((l) => under(path, l.href))?.href ?? (tabsOf(path) || under(path, "/connect-ai") || under(path, "/debt") ? "/more" : undefined));

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
      <Suspense><SavedList /></Suspense>
    </nav>
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
    <nav aria-label="Main" className="fixed bottom-0 inset-x-0 z-30 md:hidden bg-surface border-t border-line grid grid-cols-6 px-1 pt-1 pb-[max(6px,env(safe-area-inset-bottom))]">
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
