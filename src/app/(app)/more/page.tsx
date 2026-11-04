import { ChevronRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { countryOf } from "@/lib/countries";
import { getUser } from "@/lib/data";

const PAGES = [
  { href: "/debt", label: "Debt", what: "What you owe, what you're paying and what it costs." },
  { href: "/plan", label: "Money plan", what: "Every move broke found for you, in order." },
  { href: "/optimize", label: "Optimize", what: "Tax and savings ideas for your country." },
  { href: "/bonuses", label: "Bonuses", what: "Sign-up bonuses from banks and cards." },
  { href: "/cards", label: "Cards", what: "Your cards and which one to use." },
];

// Everything that isn't part of the three steps on Home.
export default async function More() {
  const { user } = await getUser();
  const cards = countryOf(user?.user_metadata?.profile?.country).cards;
  return (
    <div className="max-w-2xl space-y-4">
      <section className="card overflow-hidden">
        {PAGES.filter((p) => cards || p.href !== "/cards").map((p) => (
          <Link key={p.href} href={p.href} prefetch className="row-hover flex items-center gap-3 px-6 py-4 border-b border-line last:border-0">
            <span className="flex-1 min-w-0"><span className="block font-medium">{p.label}</span><span className="block text-sm text-muted">{p.what}</span></span>
            <ChevronRight size={18} className="text-muted shrink-0" />
          </Link>
        ))}
      </section>
      <Link href="/connect-ai" className="card-link flex items-center gap-3 px-6 py-4">
        <Sparkles size={18} className="text-muted shrink-0" />
        <span className="flex-1 font-medium">Connect your AI</span>
        <ChevronRight size={18} className="text-muted shrink-0" />
      </Link>
    </div>
  );
}
