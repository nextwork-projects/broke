// Applies pending database migrations. Usage: npm run migrate (reads SUPABASE_DB_URL from .env).
import { migrate } from "../src/lib/migrate.ts";

const r = await migrate();
if (!r.configured) {
  console.log("SUPABASE_DB_URL is not set in .env. Open http://localhost:3000/setup for where to find it.");
  process.exit(1);
}
if (r.error) {
  console.error(r.error);
  process.exit(1);
}
console.log(r.applied.length ? `Applied: ${r.applied.join(", ")}` : `Database is up to date (${r.total} migrations).`);
