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

- Staging reads a SNAPSHOT of the production spreadsheets. It never writes to them and
  never runs `clasp`. It DOES email real people, with `EMAIL_MODE=live` (§4): the owner's
  call, 2026-09-25. This used to say staging "never emails a real person".
- Built: `@hub/core`, `@hub/rbac` (`can()`), `@hub/email` (routing), `@hub/db` (schema
  and migrations), the Next.js shell, CI, and Google sign-in with Better Auth (a
  placeholder home page shows who you are and your roster standing), the roster
  loader, `authorize()` for server actions, the spreadsheet import, and request access:
  the portal catalogue, the request form (employee number checked in Clearview), the
  Grant panel for admins, and the two French emails sent through Gmail. Code is at
  github.com/JACMAR-Restaurants-Inc/apps-hub (private).
- Supabase staging exists: project `apps-hub-staging`, Canada (Central), Free plan,
  Data API off. Migrations 0000–0004 are applied. It holds the 2026-09-25 snapshot:
  552 counts and their lines, the 7 restaurants, 40 tills, and 2 admins (no one else is
  on the roster; see §5).
  Connection strings live only in `.env.local` (see §6).
- Google Cloud project `apps-hub`: consent screen External, one web client
  `apps-hub-staging` (redirect `http://localhost:3000/api/auth/callback/google`),
  but left in "Testing", so on staging only listed test users can sign in. That
  is fine for the demo. Publishing needs a home page and privacy policy on our domain,
  so it is a cutover step (`docs/CUTOVER.md`), not a staging one. The 7-day token
  limit in Testing does not matter: we use Google only at sign-in, never its refresh tokens.
- **MUST DO, week of 2026-09-28: Gmail domain-wide delegation.** Clearview works
  (credentials in `.env.local`, checked 2026-09-25). Gmail does not: the key is in
  `.env.local`, but Google answers `unauthorized_client` until a Workspace super admin
  (the owner's boss; the owner is asking Monday) adds, in admin.google.com → Security →
  API controls → Domain-wide Delegation: Client ID `117203550704415068036`, scope
  `https://www.googleapis.com/auth/gmail.send`. Then send one test email to confirm.
  Until then every email is skipped and audited as not sent; requests and approvals work
  without it (admins see requests in the portal). Someone approved meanwhile never gets
  the grant email.
- **OPEN, decide before production: the transaction pooler hangs.** 2026-09-25, in
  `next dev`, queries through `DATABASE_URL` (Supabase's TRANSACTION pooler, 6543) began
  to hang: Postgres showed them `active`, waiting on the client (`ClientRead`), and once
  a few were stuck every page queued behind them. The same pages through the SESSION
  pooler (5432, `DIRECT_URL`) answered in 0.1 s, round after round; 25 parallel queries
  from a plain script through 6543 were fine. So it is the long-running server plus the
  transaction pooler, not the page code. For now dev runs with
  `DATABASE_URL="$DIRECT_URL" npm run dev`. Before Vercel: test both poolers there, and
  pick one (likely the session pooler with a small `max`), with a load test.
- Not built yet: moving the 256
  attachments from Drive to Storage (they are imported with their Drive file id and no
  `storage_path`), i18n, UI tokens, every screen. Accounts not created yet: Vercel,
  production Supabase, domain, production OAuth client, Gmail service account.

## 2. Layout

    apps/web          the one Next.js app. Portal and each app are route sections.
    packages/core     money in cents, Toronto dates, email normalisation
    packages/rbac     can() / explain(): pure, tested, no database
    packages/db       Drizzle schema (rbac, cash, identity), migrations, the client,
                      loadRoster()
    packages/import   the spreadsheet import: xlsx -> transform -> load -> verify
    packages/clearview  employee lookup in Clearview (HR): name, HR email, active, store
    apps/web/src/lib/requests  asking for access and granting it: rules, store, emails
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

**A request grants nothing.** Asking adds the person with `active = false` and a
`pending` row with no role; `can()` refuses both. Only a system admin can grant,
change, decline or remove (`requireSystemAdmin`, RBAC §48), and every admin write
checks under a row lock that the row is still what the page showed, or answers
`changed`. A declined or removed person may ask again (RBAC §45). The rules live in
`lib/requests/service.ts`, tested on an in-memory roster AND against Postgres
(`store.db.test.ts`, inside a transaction that is always rolled back; it runs when
`.env.local` has a `DATABASE_URL` and is skipped in CI). The employee number is required
and checked in Clearview (RBAC §65), and "wrong number" is kept apart from "Clearview is
down". From Clearview only name, HR email, active and store are kept (`toEmployee`
picks them by name; a test feeds it a full record with birth date, address, phone and
SIN and checks none come out). `rbac.users.active = false` alone is therefore NOT
"switched off": the portal says that only to someone who holds an app while off.

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

## 4. Email: live on staging, by the owner's choice

`EMAIL_MODE` must be exactly `live` to email real people. Anything else, including
unset, is test mode: everything goes to `EMAIL_TEST_INBOX` with the real recipients in
the subject. So a missing or misspelled setting fails safe.

**Staging runs `live`** (owner's call, 2026-09-25): "any user who requests access [is]
emailed as per normal; no one will get a link to this app unless I give it to them. I
want the switch to production as easy as launch." So there is no list of testers: the
people the owner hands the link to ARE the users, and they get exactly the emails
production will send. Google sign-in is still in "Testing" on staging, so only listed
test users can sign in at all, which is a second gate. An allowlist of testers was built
and removed the same day for this reason; do not bring it back without asking.

**Cash Balancing's report emails: decided, not built yet** (owner approved, 2026-09-25).
`live` covers every email, so without this a practice count on staging would email its
report to the REAL restaurant and accountant. The addresses are redirected by SETTINGS,
never by editing data:

| Address | Comes from | Staging | Production |
|---|---|---|---|
| The accountant | `ACCOUNTANT_EMAIL`, a setting (the old app's `CB_ACCOUNTANT_EMAIL` Script Property) | the owner's address | the real accountant |
| Each restaurant's report | `cash.restaurant_settings.report_email`, imported from `Config_Restaurants` | `REPORT_EMAIL_OVERRIDE` = the owner's address, used for every restaurant | not set: each goes to its own address |

Why not edit the addresses in the staging data and leave a "change in production"
comment, which was the first idea: a re-import would silently put the real addresses
back, and a comment is a launch-day step someone can forget. Production's values are
set once when it is created (`docs/CUTOVER.md`), so launch day changes nothing.
Mail goes through Gmail as `GMAIL_SENDER`, using a service account with domain-wide
delegation for `gmail.send` only (`packages/email/src/gmail.ts`, no Google SDK). A send
never throws: the request or grant it follows has already happened, and the outcome is
audited. `.invalid` addresses are never sent to. Three emails: the request (to admins
with `notify` on), the grant, and the decline (both to the person). The decline email
is the owner's call, 2026-09-25, reversing RBAC §48, where a decline told nobody;
removing access or changing it still emails nobody. The emails are French only, ported
from RBAC Notify.gs (§46), and name the Grant panel's real button labels; a test holds
them to it.
In test mode the redirect happens at SEND time. Never rewrite addresses in the data:
the roster email is how sign-in recognises people.

## 5. Data carried over from the spreadsheets

- Ids are kept (count 507 stays 507); each identity sequence is moved past the highest
  imported id afterwards.
- `Config_Managers` is NOT imported. Its `login` / `password` columns are plaintext
  credentials and must not be copied anywhere. The pseudo-restaurants `ALL` and `ADMIN`
  were login rows and are dropped.
- **Only admins are carried over from the roster.** Owner's decision, 2026-09-25: the
  import brings the Access Control `Admins` (and their `Users` rows), `Restaurants` and
  the `Perm_*` tabs, which are configuration, not people. It does NOT bring `App_*`
  members or any other user. Everyone else, office staff included, signs in with their
  own Google account and requests access, so Request access and approval must work on
  day one. This replaces the old usernames and passwords, and old grants are not carried
  over unreviewed. Cash Balancing history still imports in full: a count's
  `manager_name` is text and needs no roster row.
- A count and its children are written in ONE transaction.
- Imports must be safe to run again: staging will run them many times, production once,
  on the day, from a fresh snapshot. Every row is an upsert on its key, in ONE
  transaction; a second run from the same snapshot changes nothing (checked 2026-09-25).
- The snapshot is two .xlsx downloads (File → Download → Microsoft Excel), kept OUTSIDE
  the repo in `~/apps-hub-snapshots/<date>/`. Cash Balancing is downloaded from a COPY
  with `Config_Managers` deleted, so the passwords never reach disk; the import refuses
  a workbook that still has that tab. No Google credentials, no `clasp`.
- What the 2026-09-25 snapshot taught the transforms (`packages/import`):
  - Sheets stores Toronto WALL-CLOCK times with no zone, and the xlsx reader returns
    them as if UTC. `torontoWallClock` in `@hub/core` turns them into real instants;
    read as UTC, every timestamp would be 4 or 5 hours early.
  - Amounts are floats (41.49 arrives as 41.489999999999995). They become cents, and
    anything that is not a whole number of cents is refused, not rounded.
  - A blank stays a blank where it means unknown: 3 till fixes predate `intake_delta`
    and 3 petty-cash lines have no description, so those columns are nullable
    (migration 0003). They used to be NOT NULL.
  - Two comments read `#ERROR!` in the sheet itself (a note starting with `=` or `+`
    became a formula). They are imported as the sheet shows them.
  - 255 of 256 attachments predate their `restaurant_id` column; each takes its count's.
  - Report status `done` becomes `sent`. A `pending` job is refused: the new app would
    email it, so the old queue must be drained first (CUTOVER step 1). Counts that never
    had a job do not get one.
  - Every number reconciled to the cent (totals, variances, every total against its
    lines). The verifier re-checks that from the database after each import.

## 6. Commands

    npm test              unit tests (TZ=UTC)
    npm run typecheck
    npm run db:generate   after any schema change; commit the migration
    npm run db:migrate    staging first, always
    npm run import -- <snapshot folder>                        dry run: reads, checks, writes nothing
    npm run import -- <snapshot folder> --write --target <ref> import, then verify
    npm run import -- <snapshot folder> --verify --target <ref>

`<ref>` is the Supabase project ref that `DATABASE_URL` points at (staging:
`rdfzqfztzhvgvjzfmxwx`), typed out so an import cannot reach the wrong database. The
import prints counts and cell positions, never names, emails or amounts.

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
roster loader, `authorize()`, the import transforms (14, all caught), the access rules
(14), the Clearview client, the Gmail sender and the admin check (10), the decline
email, and RLS on every
table. The import VERIFIER was checked the other way: staging was damaged inside a
transaction (a total, a coin line changed and one deleted, tills relabelled, a
restaurant deactivated), and it caught every one, then rolled back. One `authorize()`
mutation survives on purpose: letting a no-session caller through is still refused by
the `allowed && email` guard, and removing both fails a test.
