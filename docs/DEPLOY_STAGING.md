# Putting staging online (Vercel)

Staging on the internet, for the owner to see how it performs before Cash Balancing
(2026-09-26). Still STAGING: the same Supabase staging database and the same Google
client, still in "Testing", so only listed test users can sign in. Emails are live, as
on the owner's machine (CLAUDE.md §4).

Plan: **Hobby** for now (owner's call, 2026-09-26). Vercel's terms keep Hobby for
personal, non-commercial use, so move to Pro before the demo or before anyone but the
owner uses it.

Region: **yul1, Montréal** (`apps/web/vercel.json`). It is AWS ca-central-1, the same
region as Supabase's Canada (Central), so each query is a short hop. Vercel's default,
iad1 in Washington, would add a round trip to Montréal on every query.

## Steps (the owner does 1 to 5; nobody else sees a secret)

1. **Create the Vercel account** at vercel.com with "Continue with GitHub", and let it
   see the `JACMAR-Restaurants-Inc/apps-hub` repository only.
2. **Import the project**: Add New → Project → `apps-hub`.
   - Project name: `apps-hub-staging` (it becomes the address,
     `https://apps-hub-staging.vercel.app` if free).
   - Framework: Next.js. **Root Directory: `apps/web`**. Leave the build and install
     commands as detected.
   - Deploy. The build needs no secrets, so it succeeds, but sign-in cannot work yet.
   - Note the address Vercel gives (Settings → Domains shows it).
3. **Environment variables** (Settings → Environment Variables, environment
   **Production**). Copy each value from `.env.local` unless the table says otherwise:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | the **Transaction pooler** (6543): the line kept, commented, in `.env.local`. NEVER the session pooler (5432): see below |
   | `DB_POOL_MAX` | `5` |
   | `BETTER_AUTH_URL` | the Vercel address from step 2, `https://...vercel.app`, no slash at the end |
   | `BETTER_AUTH_SECRET` | a NEW one: run `openssl rand -base64 32` and paste the output |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | from `.env.local` |
   | `CLEARVIEW_CLIENT_ID`, `CLEARVIEW_CLIENT_SECRET`, `CLEARVIEW_AUTH_KEY` | from `.env.local` |
   | `GMAIL_SERVICE_ACCOUNT`, `GMAIL_SENDER` | from `.env.local` |
   | `EMAIL_MODE` | `live` |
   | `EMAIL_TEST_INBOX` | from `.env.local` |

   Not `DIRECT_URL`: only migrations and imports use it, and they run from this machine.
   A new `BETTER_AUTH_SECRET` because it signs the session cookie: the laptop and the
   website should not accept each other's cookies.
4. **Google**: console.cloud.google.com → project `apps-hub` → APIs & Services →
   Credentials → the `apps-hub-staging` web client. Add
   - Authorised JavaScript origin: the Vercel address
   - Authorised redirect URI: the Vercel address + `/api/auth/callback/google`

   Keep the localhost ones: the laptop still signs in through the same client.
5. **Redeploy** (Deployments → the latest → Redeploy) so the variables take effect.
6. **Check** (Claude): sign-in, Home, the directory, a request, and the timings below.

## What happened on the day (2026-09-26)

- The address is `https://apps-hub-web-eta.vercel.app` (Vercel named the project
  `apps-hub-web`). Sign in only there: a deployment's own address
  (`apps-hub-<hash>-jacmar1.vercel.app`) is refused by Better Auth as "Invalid origin",
  on purpose.
- `DATABASE_URL` was first pasted as the session pooler. A burst of 20 visits used up
  its 15 clients and every page failed, the laptop too, until it was switched to 6543.
- On 6543 the first page hung: the postgres.js pipelining hang (CLAUDE.md §1). Fixed by
  moving to node-postgres.

## Then measure

Time what a person waits for, end to end, on the real address: the first visit after a
quiet spell (a cold start), a warm Home, the access directory, a star, a request. Once
through the transaction pooler, once with `DATABASE_URL` switched to the session pooler
(5432) and `DB_POOL_MAX=2`, each under a burst of parallel visits. Write the numbers in
CLAUDE.md §1 and pick one.

Preview deployments (every branch pushed gets its own address) cannot sign in: Google
only knows the one address above. That is fine; they still show that a branch builds.
