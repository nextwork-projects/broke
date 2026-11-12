# broke

See where your money goes, get a plan for it, and ask your own AI about it. Your bank data stays in your own database.

Next.js 15, Supabase, Plaid. Free to run. AI uses the app you already pay for, with no API keys.

## Run it on your computer

The easiest way. Needs [Node.js](https://nodejs.org) and [git](https://git-scm.com/downloads). On Mac or Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/nextwork-projects/broke/main/install.sh | sh
```

This puts broke in `~/broke` and opens a setup page. Paste in your keys there, one step at a time:

1. **Supabase** (free): your database and sign-in.
2. **Plaid** (free for test banks): your bank connection.
3. **AI** (optional): broke finds Claude Code, Codex, Gemini CLI, opencode or a local model on your computer. Or connect OpenRouter in one click.

To start it again: open a new Terminal window and type `broke`.

On Windows: `git clone https://github.com/nextwork-projects/broke`, then `npm run app` in that folder.

## Put it online

Use it from your phone, on a site only you own.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fnextwork-projects%2Fbroke&project-name=broke&repository-name=broke&env=NEXT_PUBLIC_SUPABASE_URL%2CNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY%2CSUPABASE_SERVICE_ROLE_KEY%2CSUPABASE_DB_URL%2CPLAID_CLIENT_ID%2CPLAID_SECRET%2CPLAID_ENV&envDescription=Your+Supabase+project+and+Plaid+keys.+Only+your+copy+of+broke+sees+them.&envLink=https%3A%2F%2Fgithub.com%2Fnextwork-projects%2Fbroke%23put-it-online&envDefaults=%7B%22PLAID_ENV%22%3A%22sandbox%22%7D)

1. Create a free [Supabase](https://supabase.com/dashboard/new) project and get [Plaid keys](https://dashboard.plaid.com/developers/keys).
2. Press the button and paste them in. `SUPABASE_DB_URL` is under Supabase, Connect, Session pooler. broke creates its tables as it builds.
3. Open your new site. It shows one step to do in Supabase before your first sign-in.
4. Sign in once, then turn off "Allow new users to sign up" under Authentication, Sign In / Providers, so nobody else can use your copy.

**AI on an online copy:** connect OpenRouter in one click. Or, to use your Claude or opencode plan, press **Connect my computer** on Connect your AI and run the command it gives you. Your AI login stays on your computer. AI answers while that command is running.

## Improve it

broke is yours to change. Open the folder and tell your AI app what you want:

```bash
cd ~/broke && claude
```

`CLAUDE.md` tells it the privacy rules. Run `npm run dev` to see changes as they happen. On an online copy, `git push` publishes them.

**Get the latest broke:** it updates itself each time you start it (`broke`, or the install command), as long as you haven't changed its code. With your own changes, run `npm run update`. To turn auto-update off, start it with `BROKE_NO_AUTO_UPDATE=1`. On an online copy there's nothing to install: in your GitHub repo open Actions, Update broke, Run workflow, and Vercel rebuilds your site. Your changes stay either way.

If you make something others would want, send a pull request.

## Banks

**Banks in other countries (all optional, keys on the Setup page):** Plaid (US, Canada), Akahu (New Zealand), Enable Banking (UK, Europe), Basiq (Australia), Belvo (Brazil). Each shows only for that country. Enable Banking, Basiq and Belvo are built from their public docs and tested against stand-ins, so test against the vendor's sandbox before relying on them. Anywhere else, people import a CSV, OFX, QIF or PDF statement.

In test mode, press **Use a test bank**, or pick any bank in Plaid Link with username `user_good` and password `pass_good`.

## How AI stays private

Every AI path goes through one gate. A cloud model gets a summary: rounded amounts, names replaced by tokens. Full detail goes only to a local model. You can turn AI off in Settings. Each answer runs with no way to change your data.

## Scripts

- `npm run migrate`: apply database changes now. They also apply on start.
- `node --env-file=.env --env-file-if-exists=.env.local scripts/e2e-sandbox.mjs`: throwaway user, test bank, every page, user deleted.
- `node src/lib/format.test.ts` and `node src/lib/llm/config.test.ts`: unit checks.

## Licence

MIT.
