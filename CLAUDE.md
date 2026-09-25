# Apps Hub — working notes

One repository, one Next.js application, for the portal and every internal app:
the portal (access control), Cash Balancing, and Project Management first. It replaces
the Google Apps Script versions, which keep running until leadership approves the switch.

The reasoning for the stack is in `safe-count-tracker/JACMAR_Tech_Stack_Proposal.md`.
Most of the rules below were learned the hard way in `safe-count-tracker/CLAUDE.md` and
`RBAC/CLAUDE.md`; the section numbers point there.

## 0. Keep this file current

When something significant changes, update this file in the same commit. Write the WHY;
`git log` has the what. When a statement here stops being true, correct it in place and
say what it used to say. A file that disagrees with reality is worse than none.

## 1. Where things are, 2026-09-25

**Staging only. Nothing here touches production.** The demo to leadership is
2026-10-08; the switch happens after approval, by `docs/CUTOVER.md`.

- Staging reads a SNAPSHOT of the production spreadsheets. It never writes to them,
  never runs `clasp`, and never emails a real person (§4).
- Built: `@hub/core`, `@hub/rbac` (`can()`), `@hub/email` (routing), `@hub/db` (schema
  and migrations), the Next.js shell, CI, and Google sign-in with Better Auth (a
  placeholder home page shows who you are and your roster standing), the roster
  loader and `authorize()` for server actions. Code is at
  github.com/JACMAR-Restaurants-Inc/apps-hub (private).
- Supabase staging exists: project `apps-hub-staging`, Canada (Central), Free plan,
  Data API off. Migrations 0000–0002 are applied; the roster tables are empty.
  Connection strings live only in `.env.local` (see §6).
- Google Cloud project `apps-hub`: consent screen External, one web client
  `apps-hub-staging` (redirect `http://localhost:3000/api/auth/callback/google`),
  but left in "Testing", so on staging only listed test users can sign in. That
  is fine for the demo. Publishing needs a home page and privacy policy on our domain,
  so it is a cutover step (`docs/CUTOVER.md`), not a staging one. The 7-day token
  limit in Testing does not matter: we use Google only at sign-in, never its refresh tokens.
- Not built yet: the import scripts, i18n, UI tokens,
  every screen. Accounts not created yet: Vercel, production Supabase, domain,
  production OAuth client, Gmail service account.

## 2. Layout

    apps/web          the one Next.js app. Portal and each app are route sections.
    packages/core     money in cents, Toronto dates, email normalisation
    packages/rbac     can() / explain(): pure, tested, no database
    packages/db       Drizzle schema (rbac, cash, identity), migrations, the client,
                      loadRoster()
    packages/email    where an email actually goes (test vs live)
    docs/CUTOVER.md   the approval-day checklist

One repo on purpose: shared code written once, one sign-in, one deploy. Separate repos
would need versioned shared packages, which is the RBAC library's pinning problem again.
Split an app out only for a concrete reason (a separate team, selling one app).

`apps/web/AGENTS.md` is written by Next.js: this version has breaking changes, so read
`node_modules/next/dist/docs/` before writing Next.js code rather than trusting memory.

## 3. Rules that are load-bearing

**Money is integer cents, everywhere.** Columns end in `_cents`. Convert only at the
edges with `parseCents` / `formatCents`. `sumCents` throws on a non-integer.

**Business dates are Toronto dates, set on the server.** Use `businessDate()` /
`businessTime()`. Never take a count's date or time from the browser: the old app
stamped the time when the screen OPENED, and counts filed later sorted earlier
(safe-count §8).

**The tests run with `TZ=UTC`, and that is the point.** This machine is in Toronto, so
a bug that forgets the time zone passes here. Found by mutation 2026-09-25: removing
the time zone from `businessDate` passed every test until the suite was pinned to UTC,
which is also what Vercel's servers run in. Do not remove it from the `test` script.

**Every server action checks access.** A Next.js server action is a public endpoint
anyone can call with any arguments, exactly like `google.script.run` (safe-count §3).
Start each one with `await authorize(app, resource, action, storeId)`
(`apps/web/src/lib/access.ts`): it calls `can()`, throws `AccessDenied`, fails closed if
the session or roster cannot be read, and audits denials by signed-in people (RBAC §7;
not grants, and not calls with no session, which would let anyone grow the table).
Where it touches an existing record, pass the restaurant ON THE RECORD, not one the
caller names. A perfect UI proves nothing.

**The roster is loaded once per request, never cached across requests**
(`loadRoster` in `@hub/db`, `getRoster()` in `viewer.ts`), so deactivation takes effect
on the next click. It normalises every email it reads, and if two users rows normalise
to the same address that person is inactive: nobody can say which row is right.
Measured 2026-09-25 against staging through the transaction pooler: about 12 ms warm,
about 130 ms for the first load that opens connections. That was with empty tables;
measure again after the import. The old Apps Script sign-in took 7.8 s (RBAC §78).

**`can()` fails closed, and its order is the contract** (RBAC §6): admin → user active →
app membership active → permission exists → store named, active and held → role
granted. Any exception denies. `explain()` gives the reason for logs and admin screens.

**A blank never grants** (RBAC §4), and here the database enforces it: `active` and
`status` are NOT NULL, and a store grant is a row, so there is no "denied" to mistype.

**Nothing is deleted.** People are deactivated, memberships revoked. There are no
cascading deletes, so a careless delete fails instead of taking history with it.

**Emails are normalised on every read and write** with `normalizeEmail`: lowercase,
trim, and strip dots ONLY for Gmail (Yahoo and Hotmail dots are significant).

**Sign-in accepts any Google account.** Floor managers work for McDonald's directly and
cannot have Workspace accounts (RBAC §2); many use personal Gmail. Never restrict
sign-in to a domain (no `hd` on the Google provider; a test fails if one appears).

**Signing in grants nothing; the roster decides what you see.** Anyone with a Google
account can sign in, because someone not yet on the roster must be signed in to ask
for access (RBAC §2). So sign-in is not refused for being off the roster: pages ask
`getViewer()` (`apps/web/src/lib/viewer.ts`), which reads the roster fresh on every
request, so deactivation takes effect on the next click. Better Auth's tables live in
the `identity` schema (Supabase owns `auth`). Its `users.email` is Google's address as
given, because Better Auth finds returning people by Google account id; normalise it
before joining to the roster. Google's tokens are blanked before they are stored: we
never call Google after sign-in. This used to say "The roster decides who gets in",
which read as "refuse sign-in", and that would have locked out access requests.

**The database is only reached from the server.** Supabase's Data API is OFF, and every
table enables RLS with no policies as a backstop, so the Data API roles see nothing
even if someone turns it back on. The app connects as `postgres`, which owns the tables,
so RLS does not restrict it. This used to say "automatic RLS is ON". That setting
covers only the `public` schema: the first staging migration (2026-09-25) created all
18 `rbac` / `cash` tables with RLS off. Now each table calls `.enableRLS()` in the
schema, and `rls.test.ts` fails if a new table leaves it out. Never use Supabase's
`NEXT_PUBLIC_SUPABASE_*` snippet: it is for browser access, which we do not use. The
service-role key never goes near the browser.

**Never store or log SIN, address or birth date** from Clearview. Drop them on arrival.

## 4. Email: test until approval

`EMAIL_MODE` must be exactly `live` to email real people; anything else, including
unset, sends everything to `EMAIL_TEST_INBOX` with the real recipients in the subject.
The redirect happens at SEND time. Never rewrite addresses in the data: the roster email
is how sign-in recognises people, and approval day should be one setting, not an edit.

## 5. Data carried over from the spreadsheets

- Ids are kept (count 507 stays 507); each identity sequence is moved past the highest
  imported id afterwards.
- `Config_Managers` is NOT imported. Its `login` / `password` columns are plaintext
  credentials and must not be copied anywhere. The pseudo-restaurants `ALL` and `ADMIN`
  were login rows and are dropped.
- A count and its children are written in ONE transaction.
- Imports must be safe to run again: staging will run them many times, production once,
  on the day, from a fresh snapshot.

## 6. Commands

    npm test              unit tests (TZ=UTC)
    npm run typecheck
    npm run db:generate   after any schema change; commit the migration
    npm run db:migrate    staging first, always

There is one `.env.local`, at the repo root. `next.config.ts` loads it with
`process.loadEnvFile`, because Next looks only in `apps/web`, and `@next/env`'s
`loadEnvConfig` is a silent no-op there: Next has already called it and it returns
the cached result. drizzle-kit does not read it at all. Load it first:
`set -a && . ./.env.local && set +a && npm run db:migrate`. In Supabase, go to
Connect → Direct → URI. `DATABASE_URL` is the **Transaction pooler** (6543).
`DIRECT_URL` is the **Session pooler** (5432), not "Direct connection": that one is
IPv6-only without a paid add-on and fails from most office and home networks. Write
lines as `KEY=value`, with no spaces around `=` and no brackets left around the
password.

CI runs typecheck, tests, lint, build, and fails if the committed migrations do not
match the schema.

**Mutation-check new tests.** Break the rule, confirm a test fails, restore. It is how
the time-zone gap above was found. Done for the break-glass admin, fail-closed, store
holding, the live-mode switch, the test-mode cc, Gmail-only dot stripping, the
sign-in rules (no domain restriction, Google only, no Google tokens stored), the
roster loader, `authorize()`, and RLS on every table. One `authorize()` mutation
survives on purpose: letting a no-session caller through is still refused by the
`allowed && email` guard, and removing both fails a test.
