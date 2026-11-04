// Runs once when the server starts: bring the database up to date before the first request.
// The import sits inside the NEXT_RUNTIME check so the edge bundle drops it (pg needs Node's fs/net).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { migrate } = await import("./lib/migrate");
    const r = await migrate().catch((e) => {
      console.error("[broke] migrations:", e instanceof Error ? e.message : e);
      return null;
    });
    if (r?.applied.length) console.log(`[broke] database updated: ${r.applied.join(", ")}`);
    else if (r?.error) console.error(`[broke] ${r.error}`);
  }
}
