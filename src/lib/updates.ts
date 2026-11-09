import "server-only";

// Is there a newer broke on GitHub than the code this copy was built from? Compares commit dates, so a copy with its
// own changes (newer commits of its own) isn't told to update. Asks GitHub at most every 6 hours; any failure means no.
const REPO = "nextwork-projects/broke";
const g = globalThis as unknown as { __brokeUpdate?: { at: number; newer: boolean } };

export async function updateReady() {
  const built = process.env.BROKE_BUILT_FROM;
  if (!built) return false;
  if (g.__brokeUpdate && Date.now() - g.__brokeUpdate.at < 6 * 3600_000) return g.__brokeUpdate.newer;
  let newer = false;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/commits/main`, { headers: { accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(3000) });
    const date = res.ok ? ((await res.json()) as { commit?: { committer?: { date?: string } } }).commit?.committer?.date : null;
    newer = !!date && Date.parse(date) > Date.parse(built) + 60_000;
  } catch {
    /* offline: say nothing */
  }
  g.__brokeUpdate = { at: Date.now(), newer };
  return newer;
}
