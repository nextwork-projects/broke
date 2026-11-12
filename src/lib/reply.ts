// Blocks the model writes at the end of a reply (SYSTEM in shared.ts): ```ask {"q", "options"}``` asks a question as
// buttons, ```save``` offers a profile change, ```budget``` and ```rules``` offer changes, ```breakdown``` is a split
// of money drawn as rows, ```actions``` are in-app links drawn as buttons, ```next``` are follow-up questions as chips.
// A block still streaming in is hidden until it closes. Returns the text without the blocks.
export type Breakdown = { title?: string; total?: number; rows: { label: string; amount: number }[] };
export type Action = { label: string; href: string };
const KINDS = "ask|save|budget|rules|breakdown|actions|next";
const str = (v: unknown): v is string => typeof v === "string" && !!v.trim();
export function replyBlocks(text: string) {
  let ask: { q: string; options: string[] } | null = null;
  let save: Record<string, unknown> | null = null;
  let budget: Record<string, unknown> | null = null;
  let rules: unknown[] | null = null;
  let breakdown: Breakdown | null = null;
  let actions: Action[] = [];
  let next: string[] = [];
  const body = text
    .replace(new RegExp(`\`\`\`(${KINDS})\\s*\\n([\\s\\S]*?)\`\`\``, "g"), (_, kind: string, json: string) => {
      try {
        const v = JSON.parse(json);
        if (kind === "ask" && typeof v?.q === "string" && Array.isArray(v.options)) ask = { q: v.q, options: v.options.filter((o: unknown) => typeof o === "string").slice(0, 5) };
        if (kind === "save" && v && typeof v === "object") save = v;
        if (kind === "rules" && Array.isArray(v)) rules = v;
        if (kind === "budget" && v && typeof v === "object" && !Array.isArray(v)) budget = v;
        if (kind === "breakdown" && Array.isArray(v?.rows)) {
          const rows = v.rows.filter((r: { label?: unknown; amount?: unknown }) => str(r?.label) && Number.isFinite(Number(r.amount))).map((r: { label: string; amount: unknown }) => ({ label: r.label, amount: Math.abs(Number(r.amount)) })).slice(0, 6);
          if (rows.length) breakdown = { title: str(v.title) ? v.title : undefined, total: Number.isFinite(Number(v.total)) && v.total != null ? Math.abs(Number(v.total)) : undefined, rows };
        }
        // Only paths inside broke: the model's links never leave the app or run script.
        if (kind === "actions" && Array.isArray(v)) actions = v.filter((a) => str(a?.label) && typeof a.href === "string" && /^\/(?![/\\])/.test(a.href)).slice(0, 3);
        if (kind === "next" && Array.isArray(v)) next = v.filter(str).slice(0, 3);
      } catch {}
      return "";
    })
    .replace(new RegExp(`\`\`\`(${KINDS})[\\s\\S]*$`), "");
  return { body, ask: ask as { q: string; options: string[] } | null, save: save as Record<string, unknown> | null, budget: budget as Record<string, unknown> | null, rules: rules as unknown[] | null, breakdown: breakdown as Breakdown | null, actions, next };
}
