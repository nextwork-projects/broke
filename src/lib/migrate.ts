// Applies supabase/migrations/*.sql in name order, once each, recorded in public.schema_migrations.
// No "@/" imports so scripts/migrate.mjs can load it with plain node.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { mcpConnected, mcpSession, refFromUrl, savedRef } from "./supabase-mcp.ts";

export type MigrationResult = { configured: boolean; connected: boolean; applied: string[]; pending: string[]; total: number; error?: string };

// Projects set up before auto-migrations ran these by hand: a marker table means "already applied".
const MARKERS: Record<string, string> = {
  "0001_init.sql": "categories",
  "0002_tighten_grants.sql": "plaid_items",
  "0003_threads_bookmarks.sql": "chat_threads",
  "0004_budgets.sql": "budgets",
};

const dir = () => join(process.cwd(), "supabase", "migrations");
export const migrationFiles = async () => (await readdir(dir())).filter((f) => f.endsWith(".sql")).sort();

// Connection errors in plain words; the raw message (never containing the password) goes to the server log only.
function explain(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[broke] database:", msg);
  if (/password authentication failed/i.test(msg)) return "The database password in SUPABASE_DB_URL is wrong.";
  if (/invalid_token|unauthorized|\b401\b/i.test(msg)) return "The Supabase sign-in expired. Press Connect Supabase again.";
  if (/ENOTFOUND|getaddrinfo|ECONNREFUSED|timeout/i.test(msg)) return "Couldn't reach the database. Check SUPABASE_DB_URL is the Session pooler address.";
  return "The database rejected an update. Details are in the terminal running broke.";
}

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
type Exec = (sql: string) => Promise<Record<string, unknown>[]>;

// The migration logic, written against "run this SQL, give me rows" so the direct connection and the
// Supabase sign-in (MCP execute_sql) share it. Each file and its record commit together or not at all.
async function run(exec: Exec, files: string[], apply: boolean): Promise<MigrationResult> {
  const exists = async (table: string) => (await exec(`select to_regclass(${lit(`public.${table}`)}) is not null as ok`))[0]?.ok === true;
  const fresh = !(await exists("schema_migrations"));
  await exec(`create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now());
    alter table public.schema_migrations enable row level security;
    revoke all on public.schema_migrations from anon, authenticated;`);
  if (fresh) {
    for (const f of files) if (MARKERS[f] && (await exists(MARKERS[f]))) await exec(`insert into public.schema_migrations (name) values (${lit(f)}) on conflict do nothing`);
  }
  const done = new Set((await exec("select name from public.schema_migrations")).map((r) => r.name as string));
  const pending = files.filter((f) => !done.has(f));
  if (!apply) return { configured: true, connected: true, applied: [], pending, total: files.length };

  const applied: string[] = [];
  for (const f of pending) {
    const sql = await readFile(join(dir(), f), "utf8");
    try {
      await exec(`begin;\n${sql}\n;insert into public.schema_migrations (name) values (${lit(f)});\ncommit;`);
      applied.push(f);
    } catch (e) {
      await exec("rollback").catch(() => {});
      console.error(`[broke] migration ${f} failed`);
      return { configured: true, connected: true, applied, pending: pending.filter((p) => !applied.includes(p)), total: files.length, error: explain(e) };
    }
  }
  return { configured: true, connected: true, applied, pending: [], total: files.length };
}

export async function migrate({ apply = true }: { apply?: boolean } = {}): Promise<MigrationResult> {
  const files = await migrationFiles();
  const url = process.env.SUPABASE_DB_URL;
  if (!url || /YOUR-PASSWORD|your_/i.test(url)) {
    // No connection string: use the "Connect Supabase" sign-in when this computer has one.
    const env = process.env; // an alias: Next inlines process.env.NEXT_PUBLIC_* at build time, this reads it live
    const ref = refFromUrl(env.NEXT_PUBLIC_SUPABASE_URL) ?? savedRef();
    if (!mcpConnected(ref)) return { configured: false, connected: false, applied: [], pending: files, total: files.length };
    let session;
    try {
      session = await mcpSession();
    } catch (e) {
      return { configured: true, connected: false, applied: [], pending: files, total: files.length, error: explain(e) };
    }
    try {
      return await run(session.exec, files, apply);
    } catch (e) {
      return { configured: true, connected: false, applied: [], pending: files, total: files.length, error: explain(e) };
    } finally {
      await session.close().catch(() => {});
    }
  }

  // ponytail: Supabase's pooler cert isn't in Node's default CA list, so TLS is on but unverified; pin Supabase's CA to verify it.
  const client = new pg.Client({ connectionString: url, ssl: /sslmode=/.test(url) ? undefined : { rejectUnauthorized: false }, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
  } catch (e) {
    return { configured: true, connected: false, applied: [], pending: files, total: files.length, error: explain(e) };
  }
  try {
    await client.query("select pg_advisory_lock(7277368)"); // one runner at a time (dev reloads, two tabs)
    return await run(async (sql) => {
      const r = await client.query(sql);
      return (Array.isArray(r) ? r.at(-1)?.rows : r.rows) ?? [];
    }, files, apply);
  } finally {
    await client.query("select pg_advisory_unlock(7277368)").catch(() => {});
    await client.end().catch(() => {});
  }
}
