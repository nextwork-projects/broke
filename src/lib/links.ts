// Same bank linked twice: each Plaid link is its own connection with its own copy of every account and transaction.
// Matched on the institution and the accounts' last four digits, the way Plaid suggests before exchanging a token.
// Pure: `node src/lib/links.test.ts` runs it.
type Acct = { mask: string | null; type?: string | null };

const key = (a: Acct) => `${a.type ?? ""}:${a.mask}`;

/** True when every account in the new link (that has a mask) is already in an existing connection to that bank. */
export function sameAccounts(next: Acct[], existing: Acct[]) {
  const masked = next.filter((a) => a.mask);
  if (!masked.length || !existing.length) return false;
  const have = new Set(existing.filter((a) => a.mask).map((a) => a.mask));
  return masked.every((a) => have.has(a.mask));
}

/** Connections that copy an earlier one at the same bank: id -> the earlier connection's id. */
export function duplicateItems(items: { id: string; institution_id: string | null; created_at: string; accounts: Acct[] }[]) {
  const copies = new Map<string, string>();
  const sorted = [...items].sort((a, b) => a.created_at.localeCompare(b.created_at));
  sorted.forEach((it, i) => {
    const first = sorted.slice(0, i).find((e) => !copies.has(e.id) && e.institution_id && e.institution_id === it.institution_id && sameAccounts(it.accounts, e.accounts) && it.accounts.map(key).sort().join() === e.accounts.map(key).sort().join());
    if (first) copies.set(it.id, first.id);
  });
  return copies;
}
