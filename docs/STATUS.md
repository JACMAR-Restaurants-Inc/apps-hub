# Apps Hub: status and history

The running log that used to be §1 of `CLAUDE.md` (moved 2026-10-01, CLAUDE.md §7 item 5),
so `CLAUDE.md` can hold the rules. This file says what was built, when, with which PR,
what was measured, and what is open. Newest status first, then the log as it was, with
its own dates; nothing was dropped in the move. When something changes, add it here; when
a statement stops being true, correct it in place and say what it used to say (the same
rule as `CLAUDE.md` §0). A § number in the log below refers to `CLAUDE.md` as it was then: what §1 said
about database connections and roles is now in §3.

## Latest, 2026-10-09: Forms

Forms, in place of Jotform (owner, 2026-10-09; option B: HR edits forms on a screen),
branch `forms`. Built: phase 1 (schema `forms`, versioned definitions, server-side
answer checks, sharing by roles, restaurants and people, the fill page, the answers
page) and phase 4 (HR's editor: questions, preview, sharing, settings, publish, close,
reopen, duplicate; Notifications when a form reaches someone). Migration 0017 applied
to staging 2026-10-09 with the owner's approval (adds only: the `forms` schema and the
Forms app's 4 permissions, 7 role rows). Checked: 457 tests (45 files) on staging in
rolled-back transactions, 17 mutations (16 caught; the 17th showed a redundant line,
removed), lint, `next build`. Not checked by hand yet. Open: phase 3 (email to HR, PDF,
Excel; email waits on the Gmail delegation), phase 5 (the retention job), then
Playwright (owner: after Forms).

## Latest, 2026-10-09

The Appreciation Messages test console passed testing and is ARCHIVED (owner,
2026-10-09): moved from `BETA_APPS` to `ARCHIVED_BETAS` in `lib/beta/apps.ts`, so it
has no card and `authorizeBeta()` denies it; its `rbac.beta_testers` rows are kept, so
moving it back restores its testers. It returns when the Drive file store and the Gmail
sender are connected. The Apps Script console itself is unchanged and still public to
anyone with its address. With no beta listed, nobody sees the Tests menu again.

## Latest, 2026-10-06

Later the same day: the Tests page can list the owner's Apps Script test consoles (a
beta whose `path` is an `https://` address; Open in a new tab). Link only, the owner's
choice: the console stays public to anyone with its address (CLAUDE.md §3, beta). No
console is listed yet: each needs its name, address and a line about it from the owner.


One role and one set of restaurants per person, in every app (owner's rule, 2026-10-06;
CLAUDE.md §3 Roles). PR #58, merged 2026-10-06, the day before the code freeze, at the
owner's wish (it was first planned for after the demo). Migrations 0015 (add, move
the data, refuse a conflict) and 0016 (drop `app_members.role` and `member_stores`).
Betas may now have no live app (`base: null`), for brand-new apps such as the
appreciation-messages console. Checked: 391 tests including 54 on Postgres, all on a
local PGlite copy of staging migrated to 0016; 9 mutations all caught; lint, drizzle check and `next build` pass. Checked by hand by the owner
(2026-10-06, a local dev server on the copy, a temporary second app never committed): a
Gérant granted two restaurants, a second app's role and restaurants shown fixed, a change
applying to both apps; all three right. A Gérant may hold several restaurants (owner and
their boss, 2026-10-06, reversing #47), on the same branch. Staging was moved with no
moment where the deployed code and the database disagree: 0015 alone first (it only
adds, so the old code kept working), then the merge and Vercel's deploy (the new code
needs only what 0015 added), then 0016 once nobody had been granted through the old code
in between. Production gets 0015/0016 with all the others when it is created.

## Earlier, 2026-10-01

`main` = 9917d8e (and the docs PR that moved this file, #57), CI green, every branch
merged. Since the log below: §7 item 4 done (#56: role names and "1647 - Hull" from one
module, `lib/labels.ts`, with a guard test; Administration and the JM DevOps sidebar read
through `lib`; the Vitest config is `.mts`). Restaurant labels stay AS THEY ARE everywhere,
the owner's decision (2026-09-30): Notifications says "Hull", Cash Balancing keeps its own
styles ("Hull", "Hull (1647)" on the PDF, names alone in the accountant's emails), "since
throughout the app it's different". This file was split out of `CLAUDE.md` (#57).

## The log, as it stood on 2026-09-30

### Where things were, 2026-09-29 to 2026-09-30

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
  `portal.favourites`), one Applications list and page (favourites first, then
  alphabetical, each part in the reader's language; owner, 2026-09-29; Home keeps its
  own order), a menu for everybody, and a
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
  Data API off. Migrations 0000–0013 are applied (this said 0000–0005). It holds the 2026-09-25 snapshot:
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
  A day's counts are listed NEWEST first, on the Daily view and a restaurant's page
  (owner, 2026-09-29; the old app, and this one until then, listed oldest first).
  On a touch screen New Count's totals bar keeps clear of an iPhone's rounded corners,
  its three totals in equal centred columns (#41, #42).
  SYSTEM admins may do whatever a manager can (owner, 2026-09-29, chosen over a "view as
  manager" toggle): file counts at any restaurant and send to the accountant
  (`cashAbilities` in `lib/cash/viewer.ts`, tested). This used to say admins never file
  counts (safe-count §4). OFFICE staff (Bureau) may too (owner, 2026-09-30): "office can
  do whatever managers can do on top of whatever we say office roles can do". The import
  gives office every permission a manager holds (`officeAsManager` in
  `packages/import/src/transform.ts`, over the sheet's `Perm_*` tabs, so production gets
  it on the day and the verifier agrees); staging got the same 5 rows by hand, audited
  as `permission_add`. This used to say office staff never file counts and the server
  refuses them. Viewers (Consultation) still only look. On the portal, roles change
  nothing: Development (JM DevOps, GitHub, Twilio, Intuit) is admins only for everyone.
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
- **Tests: beta apps for chosen people** (owner, 2026-09-30; `lib/beta`, `app/tests`).
  A beta is a new version of a live app (`BETA_APPS` in `lib/beta/apps.ts`, kept OUT of
  the catalogue so Home, Applications, favourites and Request access never show one),
  built here with its own schema like Cash Balancing. An admin picks testers on the
  Tests page from the people active in the live app; a tester keeps the role and
  restaurants they hold THERE (owner: "a manager who works for Hull keeps the same on
  testing"), so the only thing stored is `rbac.beta_testers` (migration 0013). The
  Tests menu item shows for admins, and for a tester only while they can open a beta.
  The tester is told in Notifications ("testing"), not by email. Going live: take it
  out of `BETA_APPS`, clear its schema with a deliberate script (never a button),
  delete its tester rows; the emptied schema is the live one. There is NO beta today:
  the placeholder (`BetaDemo`, `/beta/demo`) was removed on 2026-09-30 once the owner had
  tried Tests with it and two fakes, and its one tester row and invitation were deleted
  from staging. With no beta, nobody sees the Tests menu, admins included. The owner will
  say when the real one (their version 2) is ready; it goes in `BETA_APPS`, its actions
  call `authorizeBeta()`. The tests bring their own beta (`vi.mock` of `lib/beta/apps`).
- Not built yet: the Drive file store (`CASH_FILE_STORE=drive`), moving the 256 imported
  attachments from Drive (they keep their Drive file id and open by their old link).
  Accounts not created yet: production Supabase, domain, production
  OAuth client. Staging on Vercel needs, besides the database: `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY` (the secret key, server only), `CRON_SECRET`,
  `ACCOUNTANT_EMAIL`, `REPORT_EMAIL_OVERRIDE`. This used to say "every screen", then
  listed Project Management.
- **Pick up here (2026-09-30, night).** `main` = 2b90e34 (and this docs PR after it),
  CI green, every branch merged. Late on 2026-09-30, a security pass after the owner
  asked "is our application protected from web app attacks?": browser security headers
  (#50), rate limits in Postgres (#51), tool packages with `npm audit` at 0 (#52), a
  nonce-based Content-Security-Policy (#53); each is described in §3 and §6, and the
  owner checked the signed-in pages for #50 and #53, #53 on staging too. Two items left,
  both deferred by the owner until the boss pays for Vercel Pro (no longer the trial):
  Vercel Firewall rate rules by IP (dashboard, no code), and an independent security
  review or penetration test before real users; both are in `docs/CUTOVER.md`. Earlier
  on 2026-09-30: Tests, beta apps for chosen testers
  (#46; its placeholder removed in #47, so no beta exists until the owner's version 2);
  a Gérant holds one restaurant (#47); Bureau does whatever Gérant does (#48). A
  nightly export of Cash Balancing to a Drive sheet was discussed and PARKED (purpose
  not decided: backup, or a sheet people work in). Since 2026-09-29: JM DevOps' overview (counts that line up,
  "en retard" badge, no prefix; #34 to #36); the portal's Notifications, a bell in place
  of Demandes (#38); Applications sorted favourites first then alphabetical (#40); Cash
  Balancing's New Count totals bar clear of an iPhone's corners and evenly spaced (#41,
  #42, owner confirmed on an iPhone), a day's counts newest first (#43), and system
  admins may file counts and send to the accountant like managers (#44, owner tested on
  staging). Roles, for the record: three (manager / Gérant, office / Bureau, viewer /
  Consultation), per app with restaurants; system admin is not a role but passes every
  check. Bureau does whatever Gérant does plus the consolidated view and Admin (#48); a
  Gérant holds one restaurant (#47). Open, in order:
  1. Gmail domain-wide delegation, from the owner's boss (the MUST DO above): no email
     is sent until then. Drive's scope too, only if files are to move to Drive. The
     owner met the boss about it on 2026-09-29; the outcome is not recorded here yet.
     Every email goes out from `GMAIL_SENDER`, today the OWNER's own address, whoever
     granted: access emails even show no display name (the Cash reports say "Cash
     balancing - Jacmar"). For production, a shared Workspace mailbox is better (see
     `docs/CUTOVER.md`); a display name on the access emails is a small code change, not
     made yet.
  2. Open JM DevOps on the Vercel staging site, signed in (it has only been seen on the
     laptop), and let the owner walk through it on real data. Also see the bell as a
     NON-admin (the owner's Gmail tester, Gérant at Hull): grant it something and check
     the badge says 1; neither the real non-admin bar nor "En attente" has been seen.
  3. Where each restaurant's report goes: 5 of 7 point at Pierre's mailbox
     (`docs/CUTOVER.md`, "Before the day"). The owner decides.
  4. Before the Pro trial ends (about 2026-10-11): stay on Pro or not. The owner's boss
     decides; the Firewall and the independent review wait for that (above).
  5. Watch the JM DevOps race test (`store.db.test.ts`, "two people creating at the
     same moment"): it failed ONCE on 2026-09-29, in a full run while the dev server
     was restarting, in 0.18 s, error not captured; then 3 full runs and 15 alone
     passed. Probably a refused connection (§1's 15 clients), unproven. If it fails
     again, keep the output.
  6. Tests (beta apps, PR #46, migration 0013 applied to staging): the owner tried it
     on localhost, 2026-09-30 ("looks great"). No beta exists now (placeholder removed),
     so the menu is hidden until the owner's version 2 arrives.
  Demo 2026-10-08, freeze 2026-10-07. Everything built is in the demo: the portal, Cash
  Balancing, JM DevOps, and Tests.
