import { Settings } from "lucide-react";
import { AutoSync } from "@/components/AutoSync";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AssistantProvider } from "@/components/Assistant";
import { Logo } from "@/components/Logo";
import { MoneyProvider } from "@/components/Money";
import { Nav, PageTitle, SectionTabs, ThemeToggle, TimeZoneCookie } from "@/components/Nav";
import { countryOf } from "@/lib/countries";
import { getUser, userTz } from "@/lib/data";
import { fmtFor, todayIn } from "@/lib/format";
import { modeOf } from "@/lib/privacy";
import { updateReady } from "@/lib/updates";
import { createClient } from "@/utils/supabase/server";

// Accounts made before country support are treated as US (countryOf default) and get a dashboard nudge instead.
const FIRST_RUN_SINCE = "2026-10-22";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const update = await updateReady();
  const [{ user }, tz] = await Promise.all([getUser(), userTz()]);
  const profile = user?.user_metadata?.profile;
  // created_at isn't in the token, so only users with no country pay for the full user record.
  // If that lookup fails (a dropped call, a dev recompile), treat the user as new: the picker is harmless, skipping it is not.
  if (user && !profile?.country && ((await (await createClient()).auth.getUser()).data.user?.created_at ?? FIRST_RUN_SINCE) >= FIRST_RUN_SINCE) redirect("/welcome");
  // Onboarding left halfway resumes where it stopped. Its "Add accounts another way" link opens /accounts/add.
  if (user && profile?.onboarding && profile.onboarding !== "done" && !(await headers()).get("x-path")?.startsWith("/accounts/add")) redirect("/welcome");
  const today = todayIn(tz);
  // A bank is due a sync when it hasn't synced in 6 hours, or when its last sync came within 4 hours of linking
  // (Plaid fetches older history in the background after a link) and wasn't in the last 10 minutes.
  const { data: items } = user ? await (await createClient()).from("plaid_items").select("created_at, last_synced_at").eq("user_id", user.id) : { data: [] };
  const now = Date.now();
  const due = (items ?? []).some((i) => {
    const synced = i.last_synced_at ? Date.parse(i.last_synced_at) : 0;
    return now - synced > 6 * 3600e3 || (synced - Date.parse(i.created_at) < 4 * 3600e3 && now - synced > 10 * 60e3);
  });
  const cards = countryOf(profile?.country).cards;
  return (
    <MoneyProvider fmt={{ ...fmtFor(profile), tz }}>
    <AssistantProvider aiMode={modeOf(user?.user_metadata)}>
      <TimeZoneCookie />
      <AutoSync due={due} />
      <aside className="md:w-60 md:h-screen md:sticky md:top-0 px-3 pt-4 md:pb-4 flex md:flex-col gap-4 md:gap-6">
        <div className="flex-1 md:flex-none flex items-center justify-between px-2">
          <Logo />
          {/* Settings lives on the gear, on the phone too (the phone bar has no room for it). */}
          <Link href="/settings" prefetch aria-label="Settings" className="text-muted hover:text-ink"><Settings size={18} strokeWidth={1.6} /></Link>
        </div>
        <Nav />
        <div className="hidden md:block mt-auto px-3 space-y-3">
          {update && <Link href="/settings#improve" className="block text-sm underline underline-offset-4">A new version of broke is ready</Link>}
          <ThemeToggle />
          <p className="text-[11px] text-muted leading-relaxed">broke is a personal project. Bank data comes from Plaid.</p>
        </div>
      </aside>
      <div className="flex-1 min-w-0 md:py-3 md:pr-3">
        <header className="px-4 md:px-6 py-4 md:pt-2"><PageTitle today={today} /></header>
        <main className="@container bg-canvas md:rounded-3xl px-4 md:px-6 pt-6 pb-24 md:pb-6 min-h-[calc(100vh-80px)]"><SectionTabs cards={cards} />{children}</main>
      </div>
    </AssistantProvider>
    </MoneyProvider>
  );
}
