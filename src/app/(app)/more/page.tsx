import { ChevronRight, Sparkles } from "lucide-react";
import { DonateLink } from "@/components/Donate";
import Link from "next/link";

const PAGES = [
  { href: "/debt", label: "Debt", what: "What you owe, what you're paying and what it costs." },
];

// What isn't in the main menu: Debt, connecting your AI and supporting broke.
export default function More() {
  return (
    <div className="max-w-2xl space-y-4">
      <section className="card overflow-hidden">
        {PAGES.map((p) => (
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
      {/* The sidebar has this link too; on a phone, More is the only place. */}
      <DonateLink className="card-link flex items-center gap-3 px-6 py-4 font-medium [&_svg]:text-muted" />
    </div>
  );
}
