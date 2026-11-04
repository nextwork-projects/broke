// Money moved between the user's own accounts shows up twice: out of checking and into the card (or savings).
// Pairs them so a list shows it once: the money-in side is hidden while its partner is in the same list, and the
// money-out side says where it went. Totals don't need this: transfers are kind "transfer" and never count.
// Pure: `node src/lib/transfers.test.ts` runs it.
type Row = { id: string; date: string; amount: number; account: { id: string; name: string; mask: string | null } | null; category: { kind?: string | null } | null };

const DAYS = 4; // the money can land a few days after it leaves

export function pairTransfers(txns: Row[]) {
  const hidden = new Set<string>();
  const to = new Map<string, string>(); // money-out id -> "Capital One ··1234"
  const pairs: [string, string][] = []; // [money-out id, money-in id]
  const ins = txns.filter((t) => t.amount < 0 && t.account);
  for (const out of txns) {
    if (out.amount <= 0 || !out.account) continue;
    const match = ins.find((i) =>
      !hidden.has(i.id) && i.account!.id !== out.account!.id && Math.abs(i.amount + out.amount) < 0.005 &&
      Math.abs(Date.parse(i.date) - Date.parse(out.date)) <= DAYS * 864e5 &&
      (out.category?.kind === "transfer" || i.category?.kind === "transfer"));
    if (!match) continue;
    hidden.add(match.id);
    pairs.push([out.id, match.id]);
    to.set(out.id, `${match.account!.name}${match.account!.mask ? ` ··${match.account!.mask}` : ""}`);
  }
  return { hidden, to, pairs };
}
