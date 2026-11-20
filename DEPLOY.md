# Deploying to Vercel + Supabase

The Express server, the chat page (`public/`) and the admin pages all deploy as one
Vercel project. The database is a Supabase Postgres project. Two things need your
accounts and secrets, so you do them; everything else is scripted.

## Once: create the accounts' pieces

1. **Supabase** (https://supabase.com): New project. Pick region **East US (N. Virginia)**
   (the Vercel function is set to `iad1` in `vercel.json`, so they sit next to each other).
   Then: Project Settings, Database, Connection string, **Transaction pooler** (port 6543).
   Copy it, replace `[YOUR-PASSWORD]` with the database password, and add one line to `.env`:
   `DATABASE_URL=postgresql://...`
2. **Vercel** (https://vercel.com): sign in with `npx vercel login` (opens your browser),
   then in this folder `npx vercel link` and accept the defaults to create the project.

## Prepare the live database (needs DATABASE_URL in .env)

```powershell
npm run db:migrate     # creates the tables (with row level security on every table)
npm run ingest         # loads the four documents
npm run embed          # embeds them with Voyage (one request)
```

## Put the secrets on Vercel, then deploy

```powershell
powershell -File scripts/push-env-to-vercel.ps1     # copies keys from .env; prints names, never values
npx vercel deploy --prod
```

After the first deploy, tell Vercel the site's own address (used in escalation emails):

```powershell
powershell -File scripts/push-env-to-vercel.ps1 -BaseUrl https://YOUR-PROJECT.vercel.app
npx vercel deploy --prod
```

## Check it

- `https://YOUR-PROJECT.vercel.app/api/health` should say `"database": "postgres"`,
  `"database_ok": true`, 4 documents, 29 chunks, both keys set.
- Ask the chat page a question: that exercises the database, Voyage and Claude together.
- Make yourself a reviewer: sign up on the live site, then
  `npm run set-reviewer -- you@example.com` (with DATABASE_URL pointing at Supabase).

## Things to know

- **Local development** needs no database setup: with no `DATABASE_URL`, the app uses a local
  Postgres (PGlite) in `data/pgdata`. Only one process can use it at a time, so stop the server
  before running `npm run set-reviewer` / `ingest` / `embed` locally.
- **Voyage free tier** allows 3 requests a minute; each chat question uses one. Real traffic
  will hit that and silently fall back to keyword search. Add a payment method at Voyage to lift it.
- **Cost protection:** every visitor address is limited to 20 chat messages per 10 minutes, 10 logins
  per 15 minutes and 5 sign-ups per hour (`CHAT_RATE_LIMIT` etc.). Opus answers are capped at 10 a day.
- **Backups:** Supabase backs the database up per its plan; the old SQLite files and code are kept
  in `chat.db*` and `legacy-sqlite/` and are not deployed (`.vercelignore`).
- **Re-embedding** after changing the documents: `npm run ingest && npm run embed` against the live
  database; running servers pick it up within a minute.
