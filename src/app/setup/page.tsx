import { redirect } from "next/navigation";
import { isHosted } from "@/lib/llm/providers";
import { setupAccess, setupStatus, supabaseReady } from "@/lib/setup";
import { DB_MESSAGES } from "./messages";
import { SetupChecklist } from "./SetupChecklist";

export const dynamic = "force-dynamic";


// The checklist loads from /api/setup/status in the browser. Keeping provider calls out of this
// server component means none of their request details end up in the page payload.
export default async function Setup({ searchParams }: { searchParams: Promise<{ db?: string }> }) {
  // An online copy missing its keys: nobody can sign in, and they can't be saved from a page.
  if (isHosted() && !supabaseReady()) return (
    <main className="min-h-screen grid place-items-center px-4 bg-canvas">
      <section className="card p-8 max-w-lg space-y-3">
        <h1 className="text-2xl font-semibold">Add your keys in Vercel</h1>
        <ol className="space-y-2 text-sm list-decimal pl-5">
          <li>Open this project in <a className="underline underline-offset-2" href="https://vercel.com/dashboard">Vercel</a>, then Settings, Environment Variables.</li>
          <li>Add <code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>, <code>SUPABASE_SERVICE_ROLE_KEY</code> and <code>SUPABASE_DB_URL</code> from your Supabase project.</li>
          <li>Open Deployments and press Redeploy.</li>
        </ol>
      </section>
    </main>
  );
  const access = await setupAccess();
  if (!access.allowed) redirect("/login");
  const { db } = await searchParams; // result of "Connect Supabase", from its callback
  // Set up and signed in: the checklist is done, settings live inside the app.
  if (access.signedIn && (await setupStatus(true)).ready) redirect(db ? `/settings?db=${encodeURIComponent(db)}` : "/settings");
  return (
    <>
      {db && Object.hasOwn(DB_MESSAGES, db) && <p role="status" className="max-w-3xl mx-auto mt-6 px-4 text-sm">{DB_MESSAGES[db]}</p>}
      <SetupChecklist signedIn={access.signedIn} />
    </>
  );
}
