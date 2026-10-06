# Apps Hub — working notes

One repository, one Next.js application, for the portal and every internal app:
the portal (access control), Cash Balancing, and Project Management first. It replaces
the Google Apps Script versions, which keep running until leadership approves the switch.

The reasoning for the stack is in `safe-count-tracker/JACMAR_Tech_Stack_Proposal.md`.
Most of the rules below were learned the hard way in `safe-count-tracker/CLAUDE.md` and
`RBAC/CLAUDE.md`; the section numbers point there.

## 0. Keep this file current

When something significant changes, update this file in the same commit. Write the WHY;
`git log` has the what. A new rule, or a rule that changed, goes here; what was built, when, and what is
open goes in `docs/STATUS.md` (split out 2026-10-01: this file was half log). When a statement here stops being true, correct it in place and
say what it used to say. A file that disagrees with reality is worse than none.

## 1. Where things are (short; the log is `docs/STATUS.md`)

**Staging only. Nothing here touches production.** The demo to leadership is
2026-10-08, code freeze 2026-10-07; the switch happens after approval, by
`docs/CUTOVER.md`. What was built when, with which PR, what was measured, and the full
open list are in **`docs/STATUS.md`**; this section used to hold all of that (moved
2026-10-01). Keep this section short.

- **Staging:** `https://apps-hub-web-eta.vercel.app` (Vercel, region yul1, a Pro TRIAL
  that ends about 2026-10-11; set up by `docs/DEPLOY_STAGING.md`) on Supabase project
  `apps-hub-staging` (Canada Central, Free plan, Data API off, migrations 0000–0014). It
  reads a SNAPSHOT of the production spreadsheets, never writes to them, never runs
  `clasp`, and DOES email real people (`EMAIL_MODE=live`, §4). Google sign-in is in
  "Testing": only listed test users can sign in (publishing is a cutover step).
- **Built, all in the demo:** the portal at parity with the Apps Script one plus the
  owner's redesign (favourites, Notifications, add to home screen), Cash Balancing, JM
  DevOps (admins only), Tests (beta apps; none exists until the owner's version 2), and
  the security pass (headers, a nonce-based policy, rate limits, `npm audit` at 0).
- **Open, in order** (details in `docs/STATUS.md`):
  1. **Gmail domain-wide delegation** from the owner's boss (Workspace super admin):
     until then NO email is sent; each is audited as not sent. Client ID
     `117203550704415068036`, scope `https://www.googleapis.com/auth/gmail.send`.
  2. Open JM DevOps on the staging site, signed in, with the owner; see the bell as a
     non-admin.
  3. Where each restaurant's report goes (5 of 7 point at Pierre's mailbox): the owner.
  4. Stay on Vercel Pro or not, before the trial ends: the owner's boss. The Firewall
     rules and an independent security review wait for that (`docs/CUTOVER.md`).
  5. Watch the JM DevOps race test (failed once, 2026-09-29; keep the output if again).
  6. After the demo: §7.
- Not built: the Drive file store, moving the 256 imported attachments off Drive.
  Not created: production Supabase, the domain, the production OAuth client.

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
    apps/web/src/lib/beta      beta apps and their testers; the page is app/tests
    packages/email    where an email actually goes (test vs live)
    docs/CUTOVER.md   the approval-day checklist
    docs/STATUS.md    what was built when, with which PR, and what is open (the log)

One repo on purpose: shared code written once, one sign-in, one deploy. Separate repos
would need versioned shared packages, which is the RBAC library's pinning problem again.
Split an app out only for a concrete reason (a separate team, selling one app).

`apps/web/AGENTS.md` is written by Next.js: this version has breaking changes, so read
`node_modules/next/dist/docs/` before writing Next.js code rather than trusting memory.

## 3. Rules that are load-bearing

**Database connections: `pg`, one pool per process, never the session pooler on Vercel.**
The client is node-postgres (`packages/db/src/client.ts`), one query at a time per
connection. postgres.js PIPELINED queries, and through Supabase's transaction pooler
(6543) that left them stuck: in `next dev` (2026-09-25) and on Vercel's first page load
(2026-09-26) every page hung. `pg` returns `{ rows }` from `db.execute`, not the array:
read `.rows`, typed, never cast (a cast hid it once in the import verifier). Vercel uses
the TRANSACTION pooler and must never use the session pooler: on 2026-09-26 it briefly
did, a burst of visits held connections across frozen instances, and every page failed,
the laptop's too. **The session pooler allows 15 clients for the whole project** (Free
plan), across every process (dev, imports, migrations, each Vercel instance); beyond it
every query fails with `EMAXCONNSESSION`. So ONE pool per process on `globalThis`
(`apps/web/src/lib/db.ts`), capped by `DB_POOL_MAX` (default 5), and Vercel's
`attachDatabasePool` closes idle connections before an instance is frozen. Locally
`DATABASE_URL` is the session pooler (a long-running dev server hangs on 6543). Measured
on Vercel after the switch: warm pages 41 to 65 ms (`docs/STATUS.md`).

**Roles, for the record.** Three per app, each with restaurants: Gérant (manager),
Bureau (office), Consultation (viewer). Any role may hold several restaurants, a Gérant
too (owner and their boss, 2026-10-06: two managers run two stores; this used to say "A
Gérant holds ONE restaurant (#47)"). Bureau does
whatever a Gérant does, plus the all-restaurants view and Admin (#48; the import's
`officeAsManager`). Consultation only looks. A system admin is not a role but passes
every check, and may do whatever a manager can (#44). On the portal, roles change
nothing: Development (JM DevOps, GitHub, Twilio, Intuit) is admins only for everyone.
**A person has ONE role and ONE set of restaurants, the same in every app they are
given** (owner's call, 2026-10-06: "a manager will always be a manager", "same
restaurants everywhere"). Apps differ only in WHETHER someone has access. This is why a
brand-new app's beta can take a tester's role and restaurants from the access directory
with no second grant (the appreciation-messages app was the case). The database holds it
by construction (migrations 0015/0016): `rbac.users.role` and `rbac.person_stores` are
the person's, and `app_members` says only WHETHER they hold an app (its `role` column
and `member_stores` are gone), so two roles cannot be written. `loadRoster` hands each
membership the person's role and restaurants, so `can()` did not change. The first grant
sets them; granting another app while the person holds one only switches it on with what
they have (the Grant panel shows them fixed, and the server answers `changed` to
anything else); a change applies in every app they hold, is refused if one of those apps
lacks the role, and tells them once per app. Their role stays on the person when an app
is removed, as the record. 0015 REFUSES to run if anybody's active apps disagree: settle
it by hand, never by picking one. An app row shows the role only once that app was
granted (`grantedAt`), which is what tells a removal from a decline now. This used to
say only "Three per app", then (the same day) that the code did not enforce it yet.

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

**A beta app checks `authorizeBeta()`, never `authorize()`** (`lib/access.ts`, rules in
`lib/beta/rules.ts`). In order: an unknown beta denies; a system admin passes; anyone
else must be on the beta's tester list; then `can()` decides on the LIVE app, with the
person's role and restaurants there, read fresh on every click. A BRAND-NEW app's beta
has `base: null` (owner, 2026-10-06): `can()` then decides on the beta's own
permissions, as if the tester held it with their own role and restaurants, for as long
as they hold ANY live app. So there is no second grant to keep in step: removing a
tester, switching someone off, or changing their restaurants takes effect in the beta on
the next click. A tester can only be added while switched on, not an admin, with a role,
and active in the live app (for a brand-new app: in any app; the owner's "every user in
the access directory after we grant them access becomes eligible"), checked under row
locks in `lib/beta/testers.ts`, not only by the page's list. Denials are audited under
the beta's key. This used to require a live app for every beta.

**A request grants nothing.** Asking adds the person with `active = false` and a
`pending` row with no role; `can()` refuses both. Only a system admin can grant,
change, decline or remove (`requireSystemAdmin`, RBAC §48), and every admin write
checks under a row lock that the row is still what the page showed, or answers
`changed`. A declined or removed person may ask again (RBAC §45). A Gérant may hold
several restaurants (owner and their boss, 2026-10-06), like every role: the Grant panel
shows boxes for all. From 2026-09-30 (#47) to then, a Gérant held ONE: radio buttons, and
`validChoice` refused more. The rules live in
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
what they held (name, HR email, employee number, switch, their role and restaurants,
every app row) and the apps they had starred. Their stars (`portal.favourites`) are deleted
too. So the record of what they could do moves into the journal rather than being lost.
Unstarring an app also deletes its row: a star is a preference, not history. Removing a
beta tester deletes their `rbac.beta_testers` row, like an admins row (a permission, not
history; the audit keeps `tester_add` / `tester_remove`), and deleting a person takes
their tester rows too, the journal listing which betas. A notification is not history
either: a read one is deleted 30 days after it was read (owner's call), when its
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

**Every response carries the browser security headers** (`apps/web/src/lib/security-headers.ts`;
2026-09-30, the owner asked whether the app is protected from web attacks and it sent
none). X-Frame-Options, nosniff, Referrer-Policy `same-origin`, a Permissions-Policy and
no "X-Powered-By" come from `next.config.ts`; HSTS from Vercel.
The Content-Security-Policy is NONCE-based (#53, the same evening; #50 had Next's
"without nonces" policy, which let any inline script run): `apps/web/src/proxy.ts` makes
a fresh random nonce for every page request and puts the policy on the request, where
Next reads it and stamps its own scripts, and on the response. Only scripts with that
nonce run, so an injected `<script>` does not. It needs every page rendered per
request (a page built in advance carries no nonce and its scripts are refused): the
root layout calls `connection()`; before that the 404 page and /requests were built in
advance. Styles keep 'unsafe-inline' (the pages use style attributes, which a nonce
cannot cover, and a nonce in style-src would switch 'unsafe-inline' off). Otherwise:
only this site's scripts, styles, images and fonts; no plugins; no posting forms
elsewhere; nobody may frame the pages. The proxy skips API routes, built files, brand
images, the manifest and the two private file addresses (`/cash/files/*`,
`/cash/count/*/pdf`): a policy on a PDF blanked Chrome's viewer once. Anything new loaded
from ANOTHER site (a script, font, image, an iframe), or a hand-written `<script>`, will
be refused until it is added on purpose. Checked in headless Chrome through its
debugging protocol on a production build: the door, the 404 page and /requests run
with 0 violations and every script carries the nonce, and a script without the nonce
was refused. Signed-in pages: the owner clicked through them on a local production build for
#50 and again for #53, then on the deployed staging site after #53 merged
("everythings working and looking good", 2026-09-30).

**Abuse is rate-limited, in Postgres** (`apps/web/src/lib/rate-limit.ts`,
`portal.rate_limits`, migration 0014; 2026-09-30). Per person, in fixed windows counted
by one atomic upsert (a count in memory would be per Vercel instance): access requests 5
per 15 minutes (each reaches Clearview and emails the admins; the form says "Trop de
tentatives"); refusal rows in the journal 30 an hour, and "signed in with no access"
rows 5 an hour, because ANYONE with a Google account can sign in and would otherwise
grow `rbac.audit` without end. Past a journal limit the refusal still stands; its row is
skipped and ONE `rate_limited` row says so (`journalUnderLimit`). Limits FAIL OPEN (a
brake, not an access rule; `authorize()` still fails closed). Uploads, counts and report
emails were already bounded. Not covered here: a flood of anonymous page loads, which is
Vercel's job (its Firewall can rate-limit by IP on Pro, set in the dashboard).

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
                          *.db.test.ts files, one file at a time (see vitest.config.mts)
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
server (§3, database connections). `DATABASE_URL` used to be the transaction pooler; which one production uses
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
that puts them in the `postgres` group, one file at a time (`maxWorkers: 1`), so they
never add up against the session pooler's 15 clients (§3, database connections) beside a dev server. Vitest 4
REMOVED the old way (`poolOptions.forks.singleFork`) and would have run them in
parallel without a word but a deprecation line; checked 2026-09-30 with two sleeping
test files, sequential with the setting and overlapping without it. The same run prints
a `pg` warning, "client.query() when the client is already executing a query": `main`
printed it before the upgrade too; some test sends two queries at once on one
transaction. Harmless in pg 8, an error in pg 9: find it before upgrading `pg`.

**A migration staging cannot take yet is tested on a local copy** (2026-10-06, one role
per person, built while staging served the demo). No Postgres or Docker on this machine,
so PGlite (Postgres in WebAssembly) behind `@electric-sql/pglite-socket`, installed in a
scratch folder, NOT in the repo: apply the migrations up to the last one staging has,
copy rbac, cash, portal and devops from staging with SELECTs only (never `identity`,
which holds sign-in sessions), apply the new ones, then run `npm test` with
`DATABASE_URL` and `DIRECT_URL` pointing at it. The data move was also tried on seeded
old-shape rows, including the conflict it must refuse. drizzle-kit cannot answer its own
"rename or create?" prompt here, so a change that drops a table and adds one is
generated in two steps: an add-only migration with the data move written in by hand,
then a drop-only one.

**A Drizzle table has its own `.name`, so a wrong column name can typecheck.**
`users.name` compiled (the column is `fullName`) and failed at run time with "Cannot
convert undefined or null to object" from inside Drizzle (2026-09-29, the JM DevOps
layout). When that error appears, check the column names in the select.

**Restart `next dev` after a schema change.** The database client lives on `globalThis`
across hot reloads (§3, database connections), and drizzle keeps a column-name cache inside it: a column added
while the server runs has no name, and every query touching it fails with
"Cannot read properties of undefined (reading 'replace')" in drizzle's `escapeName`
(2026-09-28, the Admin page). A deploy starts fresh, so only a long dev server hits it.

CI runs typecheck, tests, lint, build, and fails if the committed migrations do not
match the schema.

**`npm audit` is clean, with two pins** (`overrides` in the root `package.json`,
2026-09-30). drizzle-kit (already latest) still loads `@esbuild-kit/core-utils`, which
asks for esbuild 0.18, open to a dev-server advisory: pinned to drizzle-kit's own 0.25.
exceljs (already latest) asks for uuid 8, which has a buffer bounds advisory: pinned to
11.1.1, which keeps the same `v4()`. Both are laptop-only tools (migrations, the import).
npm 11 marks both "invalid" in `npm ls`: that is how it shows an override, not a fault.
Proved: `db:generate` finds no changes, `drizzle-kit check` passes, both imports read
the real snapshots with no problems, `--verify` passes against staging. npm does NOT
re-resolve an override inside an existing lockfile: it silently left the packages
missing, and `npm audit` then said 0 because they were gone. The two entries were taken
from a freshly generated lockfile instead (a whole new lockfile moved 302 entries,
`pg` included). Remove a pin when drizzle-kit or exceljs no longer needs it.
Vitest went 3.2.7 to 4.1.11 for its own advisory. Nothing the website runs changed.

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
the emails, the file type from the bytes; then office as manager, 5: the import
forgetting it, giving office viewer rows or duplicates, office not counting, a viewer
counting), JM DevOps (21, all caught: numbering from
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
marking everyone's read), beta testing (13, all caught: no tester check, deciding on
the beta's key instead of the live app, no admin bypass, an unknown beta allowed, the
tab showing every beta, a denial audited under the live app, adding someone switched
off, without live access or an admin, no invitation, a removal not audited, switched-off
people offered as candidates, a deleted person keeping tester rows), one role per
person (8, all caught, 2026-10-06: a grant ignoring the role they hold, counting removed
apps as held, a change skipping another app's roles or telling only one app, the roster
keeping a collided person's restaurants or not giving memberships the person's, a
brand-new app's beta open without any app, or a tester added without one), and RLS on
every table. The import VERIFIER was checked the other way: staging was damaged inside a
transaction (a total, a coin line changed and one deleted, tills relabelled, a
restaurant deactivated), and it caught every one, then rolled back. One `authorize()`
mutation survives on purpose: letting a no-session caller through is still refused by
the `allowed && email` guard, and removing both fails a test.

## 7. After the demo: architecture work

An architecture review on 2026-09-30 (the owner asked "are we following great design
architecture?"), checked in the code that night, not from memory. By the same hands
that wrote most of the code, so it is a careful self-review, not the independent one
in `docs/CUTOVER.md`. NOTHING here is for before the demo (freeze 2026-10-07).

**What holds, and must keep holding:** pure rules in packages (`@hub/rbac` has no
database); per area the same shape, pure rules, a store, server actions that check
access first (requests, Cash Balancing, JM DevOps, Tests); no app code reaches the
portal's `rbac` / `identity` tables except through the narrow door (§3, separable;
none found); every server action checks its caller; no database code in components and
no client component importing server-only code; rules tested in memory and on Postgres
in rolled-back transactions, mutation-checked, pinned to UTC.

**What to do, in this order:**
1. **End-to-end tests of the paths that matter** (sign in, file a count, grant access),
   e.g. Playwright against a production build. There are 40 test files and NONE for
   components: screen problems are caught by the owner's hands today (the memory note
   "owner tests by hand"), which works but does not scale. The biggest gain.
2. **Error monitoring before production** (Sentry, or Vercel's own). Today errors go to
   the server log only; in production nobody learns of a failure until someone
   complains.
3. **Split New Count** (`components/cash/count-form.tsx`, 710 lines, the largest file):
   its calculations into tested `lib` code, the screen into smaller parts. The access
   directory (`components/directory.tsx`, 516) is next.
4. ~~**Small consistency fixes**~~ DONE (#56, 2026-09-30, started before the demo at the
   owner's wish; display unchanged). Role names and the "1647 - Hull" label come from
   ONE module, `lib/labels.ts` (`roleLabel`, `restaurantLabel`; they were mapped in 3
   files and built in 7), and `labels.test.ts` fails if any other file maps role keys or
   builds "id - name" by hand again. Administration's and the JM DevOps sidebar's reads
   moved into `lib` (`settingsPageData`, `sidebarProjects`), tested on Postgres. Cash
   Balancing keeps names alone, its own look. Notifications still shows "Hull" without
   the number, and Cash Balancing keeps its own styles, the accountant's PDF and emails
   included: the owner's decision, 2026-09-30, "leave it as is" since the app differs
   throughout.
5. ~~**Move the status log out of this file**~~ DONE (#57, 2026-10-01): the log is
   `docs/STATUS.md`, word for word; §1 is short; the rules that lived in the log
   (database connections, roles) moved into §3.
6. **One styling approach, over time.** Tailwind is loaded beside the hand-written CSS
   and has already bitten (§3: a class named like a utility is one; the "Corrigé"
   badges vanished).

Also noted, not architecture: the `pg` warning "client.query() when the client is
already executing a query" (§6) must be found before upgrading to pg 9.
