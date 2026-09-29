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

## 1. Where things are, 2026-09-29

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
  Grant panel for admins, and the two French emails sent through Gmail. The whole
  portal at parity with the Apps Script one
  (`docs/PORTAL_PARITY.md`): its stylesheet, door, bar, all 18 apps, search and
  categories, the access directory and Grant drawer, and an Administration page for
  what the spreadsheet did (kill switch, admins and notify, restaurants, the log). Then
  the owner's redesign (2026-09-26): Favoris (a star on each card, stored in
  `portal.favourites`), one Applications list and page, a menu for everybody, and a
  Demandes page of the person's pending requests, since replaced by NOTIFICATIONS (owner,
  2026-09-29; `/requests` redirects): a bell in the bar for everyone but admins (the word
  only in the phone menu, and for screen readers), its badge the unread count;
  the page lists the requests still pending, then what the office decided (granted,
  changed, declined; never a removal), written by `lib/requests/service.ts` in the
  decision's own transaction into `portal.notifications` (migration 0012), so the person
  learns of a grant even while Gmail is not authorised. Admins get none (not now, owner).
  Add to home screen (owner's call,
  2026-09-28; the port had "no install button"): a Home banner until installed or
  dismissed, then an item in the avatar menu. Android installs in one tap through the
  browser's own offer; a web page cannot install itself on an iPhone, from any browser,
  so it gets the steps (`components/install.tsx`, rules in `lib/install.ts`). Code is at
  github.com/JACMAR-Restaurants-Inc/apps-hub (private).
- Supabase staging exists: project `apps-hub-staging`, Canada (Central), Free plan,
  Data API off. Migrations 0000–0005 are applied. It holds the 2026-09-25 snapshot:
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
- **The transaction pooler hang: found and fixed, 2026-09-26 (it used to be OPEN).**
  2026-09-25, in `next dev`, queries through Supabase's TRANSACTION pooler (6543) began
  to hang: Postgres showed them `active`, waiting on the client (`ClientRead`), and every
  page queued behind them. 2026-09-26 on Vercel the same happened on the first page load.
  The cause was the driver: postgres.js pipelines queries (sends several down one
  connection without waiting), and through the transaction pooler that left queries
  stuck. The database client is now node-postgres (`pg`, `packages/db/src/client.ts`),
  one query at a time per connection. Proved locally with a production build on 6543:
  267 signed-in page loads, bursts of up to 40 at once, none failed or hung (with
  postgres.js the same pooler froze every page). Watch for: `pg` returns `{ rows }`
  from `db.execute`, not the array; a cast hid that in the import verifier, whose
  credential check would have passed without looking, so read `.rows`, typed, never
  cast. Locally `.env.local` still sets `DATABASE_URL` to the session pooler (same as
  `DIRECT_URL`), so a plain `npm run dev` works; the 6543 value is kept there, commented.
  **Staging is online on Vercel** (owner's call, 2026-09-26, before Cash Balancing):
  `https://apps-hub-web-eta.vercel.app`, set up by `docs/DEPLOY_STAGING.md`. On a Pro
  TRIAL since 2026-09-28 (the owner's word: it ends about 2026-10-11; the 5-minute cron
  needs Pro, and Hobby is for non-commercial use; this used to say "Hobby plan for
  now"), region yul1
  Montréal (`apps/web/vercel.json`), the same AWS region as the database, on the
  TRANSACTION pooler. It must never use the session pooler: on 2026-09-26 it briefly
  did (the wrong line was pasted), a burst of 20 visits spread over a few instances,
  each holding up to 5 connections while frozen between requests, and the 15-client
  limit below was used up: every page failed, and so did the laptop. `lib/db.ts` now
  calls Vercel's `attachDatabasePool`, which closes idle connections before an
  instance is frozen (it understands `pg` pools, not postgres.js).
  **Measured on Vercel, 2026-09-26, after the switch** (signed in as an admin, from
  Toronto, in the browser): warm pages answer in 41 to 65 ms (median; Home 51,
  Applications 47, Demandes 44, directory 48, Administration 41, journal 65); a full load
  of the directory, as a person sees it, 0.37 s. Bursts of 5, 10, 20, 40 and 40 parallel
  loads: 135 in all, none failed, medians 0.2 s. Afterwards the database held no stuck
  queries, only Supavisor's own 20 idle connections, and the session pooler was free.
  The Apps Script portal's sign-in took 7.8 s (RBAC §78). So production uses the
  transaction pooler with `pg`; re-measure there with real users before the demo.
  **The session pooler allows 15 clients for the whole project** (Free plan), across
  every process: dev, imports, migrations, and each Vercel instance. Exceeding it fails
  every query with `EMAXCONNSESSION max clients reached in session mode`, which is how
  the access directory broke on 2026-09-25 when each module copy briefly had its own
  pool. So: ONE pool per process on `globalThis` (`apps/web/src/lib/db.ts`), capped by
  `DB_POOL_MAX` (default 5). On Vercel, instances x `max` must stay under 15, which is
  the strongest argument for testing the transaction pooler properly.
- **Cash Balancing is built** (2026-09-28, at parity with the Apps Script app;
  `apps/web/src/app/cash`, `lib/cash`): dashboard, New Count, daily view, count detail,
  restaurant page, attachments, the report PDF and emails, Rapports, Admin. In the old
  app's OWN dark/light theme, not the portal's (owner: "i dont like it having the same
  theme as the portal"); Clair / Sombre in the avatar menu, a `cb_theme` cookie.
  Its own bar too (owner, 2026-09-29: "I want it to feel like its own app";
  `components/cash/cash-bar.tsx`): its name, its tabs (behind ≡ below 1024px), and the
  shared avatar menu (`AccountMenu`), "Retour au portail" first, then Langue and Thème
  (segments the same width), then sign out. The browser tab says
  Cash Balancing. This used to be the portal's bar with the app's tabs under it. Only
  the look is separate: the sign-in is the portal's, so nobody signs in twice.
  Files (attachments, PDFs) are in a PRIVATE Supabase Storage bucket `cash`, standing in
  for Drive until the Workspace grants Drive access (§4); `CASH_FILE_STORE` switches.
  Checked end to end on 2026-09-28 with test count 611 at Hull (its report job 603 is set
  to 8 attempts so the sweep never sends it).
- **JM DevOps is built** (2026-09-29, PRs #29 to #36, merged; `apps/web/src/app/devops`,
  `lib/devops`): Project Management rebuilt, under the old app's own name (owner's call).
  System admins ONLY (the owner and Pierre), no emails, no "my issues" (both see
  everything). Its own app like Cash Balancing: the old app's look (DM Sans, navy
  sidebar of projects), light by default with Clair / Sombre (`dv_theme` cookie), the
  same avatar menu. Overview, each project's Dashboard / Board / List (Dashboard
  first and by default, owner 2026-09-29; the old app opened on the Board), an issue at
  its own address (`/devops/<project id>/66`). No prefixes (owner, 2026-09-29: the sheet
  needed CHK-066 to tell projects apart; a database does not): issues show as #066
  inside their project, projects are found by id, colours come from the id (migration
  0011; it used to be CHK-066 at /devops/CHK/66). Staging's ids are large (Check-In
  System is 164): rolled-back tests still use up sequence values; production starts at
  1. Beyond the old app, agreed with the owner:
  Annulée with a required reason, comments (they replace the one-line Notes),
  history per issue, a "Déplacer vers" menu on every card besides drag and drop, real
  admins as assignees. The old "Requested by" field is gone (owner, 2026-09-29:
  "useless"; migration 0009 dropped the column, the import no longer reads it). An issue
  is deleted by typing its key; a project is deleted COMPLETELY by typing its exact name,
  as the old app did (archiving was built, then removed the same day; migration 0010).
  The portal card now opens `/devops` and says JM DevOps. Staging holds the 2026-09-29
  snapshot: 8 projects, 92 issues, 11 notes as comments, every one of the 88 assignees
  matched to an admin; run twice, the second changed nothing. The owner has since added
  a project named "test" there. Seen on the laptop only: NOT yet opened on the Vercel
  staging site.
- Not built yet: the Drive file store (`CASH_FILE_STORE=drive`), moving the 256 imported
  attachments from Drive (they keep their Drive file id and open by their old link).
  Accounts not created yet: production Supabase, domain, production
  OAuth client. Staging on Vercel needs, besides the database: `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY` (the secret key, server only), `CRON_SECRET`,
  `ACCOUNTANT_EMAIL`, `REPORT_EMAIL_OVERRIDE`. This used to say "every screen", then
  listed Project Management.
- **Pick up here (end of 2026-09-29).** `main` = 55dde4f, CI green, every branch
  merged. The last changes of the day: JM DevOps' overview (each card's counts are
  three equal boxes that line up across a row, "en retard" a badge at the top, no
  prefix anywhere; #34 to #36), then the portal's Notifications, a bell in place of
  Demandes (#38). Roles, for the record: three (manager / Gérant, office / Bureau,
  viewer / Consultation), per app with restaurants; system admin is not a role but
  passes every check. Open, in order:
  1. Gmail domain-wide delegation, from the owner's boss (the MUST DO above): no email
     is sent until then. Drive's scope too, only if files are to move to Drive.
  2. Open JM DevOps on the Vercel staging site, signed in (it has only been seen on the
     laptop), and let the owner walk through it on real data. Also see the bell as a
     NON-admin (the owner's Gmail tester, Gérant at Hull): grant it something and check
     the badge says 1; neither the real non-admin bar nor "En attente" has been seen.
  3. Where each restaurant's report goes: 5 of 7 point at Pierre's mailbox
     (`docs/CUTOVER.md`, "Before the day"). The owner decides.
  4. Before the Pro trial ends (about 2026-10-11): stay on Pro or not.
  5. Watch the JM DevOps race test (`store.db.test.ts`, "two people creating at the
     same moment"): it failed ONCE on 2026-09-29, in a full run while the dev server
     was restarting, in 0.18 s, error not captured; then 3 full runs and 15 alone
     passed. Probably a refused connection (§1's 15 clients), unproven. If it fails
     again, keep the output.
  Demo 2026-10-08, freeze 2026-10-07. Everything built is in the demo: the portal, Cash
  Balancing, JM DevOps.

## 2. Layout

    apps/web          the one Next.js app. Portal and each app are route sections.
    packages/core     money in cents, Toronto dates, email normalisation
    packages/rbac     can() / explain(): pure, tested, no database
    packages/db       Drizzle schema (rbac, cash, identity, portal), migrations, the client
                      (node-postgres),
                      loadRoster()
    packages/import   the spreadsheet import: xlsx -> transform -> load -> verify
    packages/clearview  employee lookup in Clearview (HR): name, HR email, active, store
    apps/web/src/lib/requests  asking for access and granting it: rules, store, emails
    apps/web/src/lib/devops    JM DevOps: rules, store, i18n; the app is app/devops
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
SIN and checks none come out). Clearview often appends the employee number to
`lastName` ("Doe 3791"); `withoutNumber` drops it, but only when it is exactly that
person's number, so a real surname is never cut. The one roster name saved before this
fix was corrected on 2026-09-25, audited as `name_corrected`. `rbac.users.active = false` alone is therefore NOT
"switched off": the portal says that only to someone who holds an app while off.

**The spreadsheet's jobs have screens now, with guards** (`lib/admin/settings.ts`,
tested on Postgres in rolled-back transactions). Nobody can switch themselves off or
remove themselves as admin, the last admin cannot be removed (with none, the
break-glass address would silently become the only admin), and a new restaurant is
added CLOSED so it grants nothing until someone opens it. Restaurants are closed, never
deleted, and the portal can OPEN one but not close one (owner's call, 2026-09-25: one
stray click stopped everyone at that restaurant, for a job needed once in years). The
action refuses it too (`portalAllows`), not only the page; closing is done on request,
by a deliberate script calling `setRestaurantActive`. This used to be one click. Removing an admin deletes the `admins` row (a role, not history); the audit
row keeps who, whom and when.

**The roster is loaded once per request, never cached across requests**
(`loadRoster` in `@hub/db`, `getRoster()` in `viewer.ts`), so deactivation takes effect
on the next click. It normalises every email it reads, and if two users rows normalise
to the same address that person is inactive: nobody can say which row is right.
Measured 2026-09-25 against staging through the transaction pooler: about 12 ms warm,
about 130 ms for the first load that opens connections. That was with empty tables;
measure again after the import. The old Apps Script sign-in took 7.8 s (RBAC §78).

**Each app stays separable into its own database** (owner's call, 2026-09-26). Today
one Postgres holds `identity`, `rbac` and `cash`. If an app ever needs its own database
(a separate team, budget, compliance, or selling it; size alone is unlikely to force it:
Cash Balancing is about 5,000 counts and 30,000 detail rows a year), the split should be
a day or two, not weeks. So, for Cash Balancing and every app after it:
1. The app reaches the portal's data through ONE narrow door only: `authorize()` /
   `can()`, the roster, and a restaurants-list function. No SQL joins between an app's
   schema and `rbac` or `identity` in the app's code.
2. Never write to an app's schema and to `rbac` in the same transaction.
3. The app gets its own connection setting from day one (`CASH_DATABASE_URL`, falling
   back to `DATABASE_URL`) and its own `db()` getter, so moving it is a setting.
4. The one hard link today, `cash.*.restaurant_id` referencing `rbac.restaurants`, stays
   for now: it protects the data. At a split it becomes an application check against
   the restaurants list, and it is the only foreign key to drop.
A database cannot enforce a foreign key into another database, nor run one transaction
across two; these rules keep every such crossing out of the code in the first place.

**Cash Balancing computes every total on the server** (`lib/cash/math.ts`). The browser
sends only what was counted (each till's amount, rolls and loose coins, bills, receipts);
the old server summed line totals the browser sent. Expected total and till bases are
read from settings. A count, its lines, fixes, report job and attachment links are ONE
transaction, dated by the server in Toronto, under a per-restaurant advisory lock (never
a global one, safe-count §17), one per restaurant per minute. Counts are never edited.

**The report queue retries, but never by surprise** (`lib/cash/reports.ts`). A job runs
right after its count (`after()`), then `/api/cash/sweep` every 5 minutes (Vercel cron,
`CRON_SECRET`; the old queue was callable by anyone) retries pending or failed jobs, up
to 8 attempts and ONLY from the last 7 days: the import brought one job that failed in
April, and an old report must be a person's decision (Rapports, "Réessayer"). An email
already sent is never resent. Every email is recorded in `cash.report_emails`, sent or
not, with why: that is the Rapports page. The PDF is drawn once with @react-pdf/renderer
and kept; attached PDFs are merged with pdf-lib (the old jacmar-pdf-merge Cloud
Function took requests from anyone). Text a person typed is escaped in the email.

**Cash Balancing's files are private.** Served only by `/cash/files/[id]` and
`/cash/count/[id]/pdf`, after authorising against the COUNT's restaurant (a staged upload:
its uploader only); a refusal is "not found". The type is read from the bytes at upload
(JPEG, PNG, GIF, WebP, PDF only). No CSP sandbox on those responses: it blanked Chrome's
PDF viewer. The old app shared everything as "anyone with the link".

**Cash Balancing's Admin page changes settings, never history** (`lib/cash/settings.ts`).
Expected total (two steps: it re-bases every later variance), report address, tills
(retired, never deleted). The restaurant number is not editable. Every change is
journaled before and after in `cash.settings_log`, and refused as `changed` if the row is
no longer what the page showed. The admin panel's permission (office and admins).

**Tailwind is loaded, so a class named like a utility is one.** `fixed` is
`position:fixed`: the "Corrigé" badges vanished (2026-09-28). Prefix app classes (`cb-`,
`is-`).

**`can()` fails closed, and its order is the contract** (RBAC §6): admin → user active →
app membership active → permission exists → store named, active and held → role
granted. Any exception denies. `explain()` gives the reason for logs and admin screens.

**A blank never grants** (RBAC §4), and here the database enforces it: `active` and
`status` are NOT NULL, and a store grant is a row, so there is no "denied" to mistype.

**Nothing is deleted, with TWO guarded exceptions.** People are deactivated,
memberships revoked. There are no cascading deletes, so a careless delete fails instead
of taking history with it. The exception (owner's call, 2026-09-26): an admin can DELETE
a person from the directory, so their next sign-in is a first visit. It is guarded
(`deletePerson` in `lib/admin/settings.ts`): the admin must type the person's address,
it is never allowed on an admin or on yourself, their Better Auth sign-in goes too (so
they are signed out at once), and the audit row `person_deleted` keeps a full copy of
what they held (name, HR email, employee number, switch, every app row with role and
restaurants) and the apps they had starred. Their stars (`portal.favourites`) are deleted
too. So the record of what they could do moves into the journal rather than being lost.
Unstarring an app also deletes its row: a star is a preference, not history. So is a
notification: a read one is deleted 30 days after it was read (owner's call), when its
owner next opens Notifications (`lib/notifications.ts`); rbac.audit keeps the decision.
The second exception (owner's calls, 2026-09-29): JM DevOps. An issue can be deleted
(`deleteIssue` in `lib/devops/store.ts`): the admin types its number (66 or #066), its number is
never given out again, its history stays under the project and number, and a `deleted`
event keeps a full copy of it and its comments. A PROJECT can be deleted completely
(`deleteProject`, as the old app did): the admin types its exact name, and the project,
its issues, their comments and its whole history go, children first, in one
transaction. Nothing of it is kept: the owner asked for "completely". Projects used to be
archived, never deleted (migration 0010 dropped `archived_at`). This used to say, without
exception, "Nothing is deleted", then "ONE guarded exception".

**JM DevOps numbers issues under a row lock, and saves only what the page showed**
(`lib/devops/store.ts`). A new issue takes its project's `next_number` in the same
UPDATE that raises it, so two people creating at once never share a number (the old
`nextId` took max+1 from the sheet, and deleting the newest issue let its number come
back). Every field saves on its own, sending the value the page showed; if the issue
no longer has it, nothing is written and the answer is `changed` (with two people on
one issue, the second save must not silently undo the first). Every change is an event.
Dates are `date` columns in Toronto: the old API sent them through UTC and showed them
a day early. Every action is `requireSystemAdmin` first; a test calls each one as a
non-admin and with no session and checks the store is never reached.

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

**Cash Balancing's report emails: built** (owner approved, 2026-09-25; built 2026-09-28; this used to say "not built yet").
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
- **JM DevOps** comes from its own spreadsheet ("Projects Management": a Config tab of
  projects, a tab per project), by `npm run import:devops`, a download in the same
  snapshot folder. Columns are found by header (the old code read them by position, so
  the usual spellings are accepted). Issue numbers are kept (the sheet's CHK-066 is #066); the
  sheet's prefix is read only to make sense of its IDs, and a project is matched again
  by its name, since the app has no prefixes. A
  status, type or priority that is not the old app's word, a duplicate or foreign ID,
  or a titled row the sheet never stamped is a problem and nothing is written. The
  assignee becomes an admin only when the text is exactly one admin's first or full
  name ("Sony"); anything else ("Teammate A") keeps its text. Notes become the issue's
  first comment with no author, shown with its day only (the sheet kept no time).
  Imported issues have no creator: the sheet never said. An .xlsx tab name is at most
  31 characters, so the download cuts long ones ("ClearviewService Library Refactor"
  arrives as "...Refact") while Config keeps the full name: the import accepts that
  exact cut and nothing looser (found on the first real download, 2026-09-29).

## 6. Commands

    npm test              all tests (TZ=UTC): `unit` in parallel, then `postgres`, the
                          *.db.test.ts files, one file at a time (see vitest.config.ts)
    npm run typecheck
    npm run db:generate   after any schema change; commit the migration
    npm run db:migrate    staging first, always
    npm run import -- <snapshot folder>                        dry run: reads, checks, writes nothing
    npm run import -- <snapshot folder> --write --target <ref> import, then verify
    npm run import -- <snapshot folder> --verify --target <ref>
    npm run import:devops -- <snapshot folder> [--write | --verify] --target <ref>
                          JM DevOps, from the Projects Management sheet (its own
                          command, so the app stays separable)

`<ref>` is the Supabase project ref that `DATABASE_URL` points at (staging:
`rdfzqfztzhvgvjzfmxwx`), typed out so an import cannot reach the wrong database. The
import prints counts and cell positions, never names, emails or amounts.

There is one `.env.local`, at the repo root. `next.config.ts` loads it with
`process.loadEnvFile`, because Next looks only in `apps/web`, and `@next/env`'s
`loadEnvConfig` is a silent no-op there: Next has already called it and it returns
the cached result. drizzle-kit does not read it at all. Load it first:
`set -a && . ./.env.local && set +a && npm run db:migrate`. In Supabase, go to
Connect → Direct → URI. Locally, both `DATABASE_URL` and `DIRECT_URL` are the
**Session pooler** (5432): the transaction pooler (6543) hangs in a long-running dev
server (§1). `DATABASE_URL` used to be the transaction pooler; which one production uses
is decided on Vercel. Not "Direct connection" either: that one is
IPv6-only without a paid add-on and fails from most office and home networks. Write
lines as `KEY=value`, with no spaces around `=` and no brackets left around the
password.

**A test that reads several rows and compares them as a list says ORDER BY.** Without
it Postgres returns rows as they lie on disk, and the rolled-back tests leave space that
cleanup hands to new rows, so disk order stops being insertion order (seen 2026-09-28:
7 of 74 `rbac.audit` rows). The access-rules test compared its audit events in order
and failed now and then for exactly this; it was first blamed on parallel database
tests, wrongly. Separately, tests that touch the database are named `*.db.test.ts`:
that puts them in the `postgres` group, one file at a time in a single process, so they
never add up against the session pooler's 15 clients (§1) beside a dev server.

**A Drizzle table has its own `.name`, so a wrong column name can typecheck.**
`users.name` compiled (the column is `fullName`) and failed at run time with "Cannot
convert undefined or null to object" from inside Drizzle (2026-09-29, the JM DevOps
layout). When that error appears, check the column names in the select.

**Restart `next dev` after a schema change.** The database client lives on `globalThis`
across hot reloads (§1), and drizzle keeps a column-name cache inside it: a column added
while the server runs has no name, and every query touching it fails with
"Cannot read properties of undefined (reading 'replace')" in drizzle's `escapeName`
(2026-09-28, the Admin page). A deploy starts fresh, so only a long dev server hits it.

CI runs typecheck, tests, lint, build, and fails if the committed migrations do not
match the schema.

**Mutation-check new tests.** Break the rule, confirm a test fails, restore. It is how
the time-zone gap above was found. Done for the break-glass admin, fail-closed, store
holding, the live-mode switch, the test-mode cc, Gmail-only dot stripping, the
sign-in rules (no domain restriction, Google only, no Google tokens stored), the
roster loader, `authorize()`, the import transforms (14, all caught), the access rules
(14), the Clearview client, the Gmail sender and the admin check (10), the decline
email, favourites (only a visible app can be starred, the order starred, a deleted
person's stars go), the add-to-home-screen rules (7), Cash Balancing (10: the variance
against settings, negative amounts, the double-tap guard, linking only your own uploads,
the sweep's 7 days, never resending, both stale-value checks on Admin, HTML escaping in
the emails, the file type from the bytes), JM DevOps (21, all caught: numbering from
max+1 instead of the lock, a stale save, cancelling without a reason, delete without
the key or losing its history, a non-admin assignee, the
admin check skipped, overdue and completion, GitHub links, and in its import: dates
through UTC, a guessed assignee, status or duplicate ID, numbering moving backwards,
notes written twice, the verifier ignoring a field; then project delete, 5: without the
exact name, in any case, keeping history rows, touching another project, no admin
check; then no prefix, 3: a task deleted without its number and "CHK-066" read as 66
were caught; removing the duplicate-name check survives on purpose, because the unique
index on the name still refuses it and the same test sees that), Notifications (9:
grant, change or decline telling nobody, a removal telling them, a grant's note written
outside its transaction, read ones never cleared or cleared at 1 or 60 days instead of 30,
marking everyone's read), and RLS on every
table. The import VERIFIER was checked the other way: staging was damaged inside a
transaction (a total, a coin line changed and one deleted, tills relabelled, a
restaurant deactivated), and it caught every one, then rolled back. One `authorize()`
mutation survives on purpose: letting a no-session caller through is still refused by
the `allowed && email` guard, and removing both fails a test.
