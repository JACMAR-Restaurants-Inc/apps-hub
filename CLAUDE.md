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
  and first migration), the Next.js shell, CI.
- Not built yet: Better Auth, the roster loader, the import scripts, i18n, UI tokens,
  every screen. Accounts not created yet: Vercel, Supabase, domain, OAuth client,
  Gmail service account.

## 2. Layout

    apps/web          the one Next.js app. Portal and each app are route sections.
    packages/core     money in cents, Toronto dates, email normalisation
    packages/rbac     can() / explain(): pure, tested, no database
    packages/db       Drizzle schema (rbac, cash), migrations, the client
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
Call `can()` at the top of each one. Where it touches an existing record, check the
restaurant ON THE RECORD, not one the caller names. A perfect UI proves nothing.

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
sign-in to a domain. The roster decides who gets in.

**The database is only reached from the server.** Supabase's Data API is OFF, automatic
RLS is ON as a backstop. The service-role key never goes near the browser.

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

CI runs typecheck, tests, lint, build, and fails if the committed migrations do not
match the schema.

**Mutation-check new tests.** Break the rule, confirm a test fails, restore. It is how
the time-zone gap above was found. Done for the break-glass admin, fail-closed, store
holding, the live-mode switch, the test-mode cc, and Gmail-only dot stripping.
