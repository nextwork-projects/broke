"use client";

import { Star, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Bookmark = { id: string; href: string; label: string };
const CHANGED = "broke:bookmarks";

// The current in-app URL, query string included, so a filtered view can be saved.
function useHref() {
  const path = usePathname();
  const params = useSearchParams().toString();
  return params ? `${path}?${params}` : path;
}

export function BookmarkButton({ title }: { title: string }) {
  const href = useHref();
  const params = useSearchParams();
  const [id, setId] = useState<string | null>(null);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    createClient()
      .from("bookmarks")
      .select("id")
      .eq("href", href)
      .maybeSingle()
      .then(({ data, error }) => {
        setAvailable(!error); // table missing until migration 0003 runs: hide the star
        setId((data?.id as string) ?? null);
      });
  }, [href]);

  if (!available || !title) return null;

  async function toggle() {
    const db = createClient();
    if (id) {
      await db.from("bookmarks").delete().eq("id", id);
      setId(null);
    } else {
      if (!/^\/(?![/\\])/.test(href)) return; // in-app paths only: "//host" and "/\\host" leave the site
      const q = params.get("q");
      const label = q ? `${title}: "${q}"` : params.size ? `${title} (filtered)` : title;
      const user = (await db.auth.getSession()).data.session?.user; // local; RLS checks the insert
      const { data } = await db.from("bookmarks").insert({ user_id: user!.id, href, label, kind: "page" }).select("id").single();
      setId((data?.id as string) ?? null);
    }
    window.dispatchEvent(new Event(CHANGED));
  }

  return (
    <button
      onClick={toggle}
      aria-pressed={!!id}
      aria-label={id ? "Remove bookmark" : "Bookmark this page"}
      title={id ? "Remove bookmark" : "Bookmark this page"}
      className={`p-1.5 rounded-lg hover:bg-canvas ${id ? "text-amber-500" : "text-muted hover:text-ink"}`}
    >
      <Star size={17} fill={id ? "currentColor" : "none"} />
    </button>
  );
}

export function SavedList() {
  const current = useHref();
  const [items, setItems] = useState<Bookmark[]>([]);
  const load = useCallback(() => {
    createClient()
      .from("bookmarks")
      .select("id, href, label")
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => setItems((data ?? []) as Bookmark[]));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(CHANGED, load);
    return () => window.removeEventListener(CHANGED, load);
  }, [load]);

  if (!items.length) return null;
  return (
    <div className="pt-4 space-y-1">
      <div className="section-label px-3 pb-1">Saved</div>
      {items.map((b) => (
        <div key={b.id} className="group flex items-center rounded-xl hover:bg-canvas/60">
          <Link href={b.href} className={`flex-1 min-w-0 flex items-center gap-3 px-3 py-2 text-sm truncate ${b.href === current ? "font-medium" : "text-muted"}`}>
            <Star size={14} className="text-amber-500 shrink-0" fill="currentColor" />
            <span className="truncate">{b.label}</span>
          </Link>
          <button
            aria-label={`Remove ${b.label}`}
            onClick={async () => {
              await createClient().from("bookmarks").delete().eq("id", b.id);
              window.dispatchEvent(new Event(CHANGED));
            }}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 mr-1 text-muted hover:text-ink"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
