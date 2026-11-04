# broke

Personal finance app. Next.js 15 (app router), Supabase (sign-in, Postgres, row-level security), Plaid and other bank feeds.

## Rules for any change

- **Bank data stays private.** Every AI path goes through `src/lib/llm/gate.ts`. A cloud model gets the summary only: rounded amounts, names replaced by tokens. Full detail goes only to a local model. Never add another path.
- **No AI API keys.** AI runs on the person's own signed-in app (Claude Code, Codex, Gemini CLI, opencode), a local model, or their OpenRouter sign-in.
- **Tools stay off for prompts from a website.** The helper (`public/broke-connect.cjs`) only runs AI apps with no tools at all. Don't add one that can read files.
- **Every table has row-level security.** Secrets like `plaid_items.access_token` have no policies, so only the server's secret key reads them.
- **Advice depends on country.** Use `countryOf` and the tax modules in `src/lib/countries.ts`. Never assume the US.
- **Never show test data to someone on real banks.**
- **Tests use throwaway `@broke.test` users**, created and deleted with the admin client. Never read a real person's rows to test.

## Writing

Sentence case. Plain short sentences. No em dashes.

## Working here

- `npm run dev`: reloads on every edit. Keys go in on http://localhost:3000/setup.
- Database changes: add the next numbered file in `supabase/migrations/`. It applies on start, or with `npm run migrate`.
- Checks: `npm run lint`, `npx tsc --noEmit`, and pure libraries with `node src/lib/<name>.test.ts`.
- `scripts/e2e-sandbox.mjs` runs a throwaway user through every page.
