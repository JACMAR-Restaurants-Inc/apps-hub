# Cutover: from Apps Script to Apps Hub

Run this only after leadership approves. Until then, everyone keeps using the Apps
Script versions, and this repo runs on staging only.

The principle: **production is built fresh from the spreadsheets as they are on the
day**, by the same import scripts staging has run many times. Nothing from staging is
carried over: it is full of rehearsal counts and test accounts.

## Before the day

- [ ] The import has run cleanly against a fresh snapshot at least three times on staging.
- [ ] Production Supabase project exists, migrations applied, empty.
- [ ] Production Vercel environment has its own secrets, with `EMAIL_MODE=test` for now.
- [ ] **Which address the emails come from.** `GMAIL_SENDER` is the owner's own address on
      staging, so every report and access email looks as if the owner sent it, even
      decisions Pierre made. For production, a shared Workspace mailbox (for example
      `portail@jacmar-restaurants.com`) that the Workspace admin creates. The same
      service account and `gmail.send` scope cover it: only the setting changes.
- [ ] Production's `ACCOUNTANT_EMAIL` is the real accountant's address, and
      `REPORT_EMAIL_OVERRIDE` is NOT set (on staging it sends every restaurant's report
      to the owner; in production it would hide every report). See CLAUDE.md §4.
- [ ] Google sign-in is published. Staging stays in "Testing", where only listed test
      users can sign in (max 100 over the app's life), and real managers can't be added
      one by one. To publish (Google Cloud project `apps-hub` → Google Auth Platform):
      - Host a home page and a privacy policy on jacmar-restaurants.com. The policy says
        we keep only name and email from Google, for sign-in.
      - Branding: add both links, add `jacmar-restaurants.com` under Authorized domains,
        and developer contact `sony@jacmar-restaurants.com`. Still no logo: a logo means
        Google verification, which takes days.
      - Audience → Publish app → "In production". Scopes stay `openid`, `email`,
        `profile` only (non-sensitive, no review).
      - A separate production client (not `apps-hub-staging`) with the production
        redirect URI `https://<domain>/api/auth/callback/google`.
      - Sign in with a personal Gmail that is NOT a test user. It must work.
- [ ] **Where each restaurant's reports go** (found 2026-09-28). In the Cash Balancing
      spreadsheet, 5 of 7 restaurants send their reports to Pierre's mailbox
      (`pierrej+…@jacmar-restaurants.com`): Hull, Mont-Bleu, Maisonneuve, Du Plateau,
      Chelsea. Only Aylmer and Vanier have their own (`<id>@post.mcdonalds.ca`). Decide
      the right address for each before the day. The import brings the sheet's values,
      so either correct `Config_Restaurants` before the snapshot, or correct them on
      Cash Balancing → Admin right after the import (step 4b). Either way the journal on
      the Admin page keeps the change.
- [ ] **Cash Balancing's production settings** (staging has its own; nothing is copied):
      - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` of the PRODUCTION project (the
        secret key, server only), and a PRIVATE Storage bucket `cash` created in it
        (50 MB per file, images and PDFs only: see how staging's was made).
      - `CRON_SECRET`: a new long random value. The sweep that retries reports runs
        every 5 minutes, which needs Vercel Pro (Hobby allows one run a day): on Pro,
        set `apps/web/vercel.json` back to `*/5 * * * *` (once a day since 2026-10-13).
      - `ACCOUNTANT_EMAIL` (above) and no `REPORT_EMAIL_OVERRIDE`.
      - Files: `CASH_FILE_STORE` unset keeps them in Supabase. For Drive instead
        (`drive`, not built yet), the Workspace admin must add the Drive scope to the
        service account's domain-wide delegation, and the production folders must belong
        to the company, not to Pierre, whose Drive holds the old app's PDFs today.
- [ ] **Vercel on a paid plan, and its Firewall rate rules on.** The app limits abuse per
      signed-in person (CLAUDE.md §3, rate limits); a flood of anonymous page loads is
      Vercel's to stop, by IP, in the dashboard. Deferred by the owner until the boss pays
      for Pro rather than the trial (2026-09-30).
- [ ] **An independent security review or penetration test** of production before real
      users sign in. The code's own checks (tests, mutation checks, the headers and the
      nonce policy checked in Chrome) were written by the same hands that wrote the code.
      Deferred with the Firewall, the owner's call (2026-09-30).
- [ ] Managers told the date, the new link, and that they sign in with the same Google account.

## On the day, after the evening counts

1. [ ] Let the Apps Script report queue finish (`PendingReports` has nothing `pending`),
       then pause it: set the `CB_REPORTS_PAUSED` Script Property.
2. [ ] Snapshot the production spreadsheets, so there is a fixed source to import from
       and to check against afterwards. Into `~/apps-hub-snapshots/<date>/`:
       - Access Control - Data: File → Download → Microsoft Excel.
       - Cash Balancing — Data: File → Make a copy, DELETE `Config_Managers` in the
         copy, then download the copy as Excel. Delete the copy from Drive.
3. [ ] Run the import into PRODUCTION from that snapshot: first
       `npm run import -- <folder>` (dry run, must say "No problems"), then with
       `--write --target <production ref>`.
   b. [ ] JM DevOps: download the Projects Management sheet into the same folder
       (File → Download → Microsoft Excel), then `npm run import:devops -- <folder>`
       (dry run, "No problems"), then with `--write --target <production ref>`. It
       verifies itself and must end "All checks passed". Afterwards the old app
       (GitHub Pages, project-manager-app) is left up read only, like the others.
4. [ ] It verifies itself (below) and must end "All checks passed". Stop here if not.
   b. [ ] Cash Balancing → Admin: each restaurant's report address is the one decided
       (above), and each expected total matches the sheet.
5. [ ] Set `EMAIL_MODE=live` in production. Redeploy.
6. [ ] File one real count as a test user; confirm the report reaches the right inbox.
7. [ ] Point the portal card and every shared link at the new app.
8. [ ] Old apps stay up, read-only, as a fallback. Do not delete anything.

## Checks after the import

- [ ] Row counts per sheet match per table, per restaurant.
- [ ] For every count: tills + coins + bills + petty cash = grand total, and
      grand total − expected = variance, recomputed in cents.
- [ ] Every count id from the sheet exists with the same id; each id sequence starts
      above the highest imported id.
- [ ] Every attachment is linked to its count. The imported ones stay in Drive and open
      by their old link (their Drive file id is kept); only new uploads go to Storage.
      This used to say "Every attachment is in Storage": moving them is not built.
- [ ] No old report is sent by surprise: the sweep only retries jobs from the last 7
      days (the spreadsheet holds one that failed in April 2026). Rapports lists them.
- [ ] No `login` or `password` value exists anywhere in the database.
- [ ] Only the admins are on the roster (nobody else is carried over, CLAUDE.md §5).
- [ ] Bureau (office) holds every permission Gérant (manager) holds, in every app: the
      import adds them over the sheet's `Perm_*` tabs (owner, 2026-09-30; CLAUDE.md §3, roles),
      and `--verify` fails if one is missing.
- [ ] No beta tester rows (`rbac.beta_testers` is empty): testers are chosen again on
      the Tests page in production, for whatever beta exists then.
- [ ] Five real people sign in, request access, are approved, and then see only
      their own restaurants.

## After

- Aylmer and Vanier off version 36; then clear the plaintext passwords in the sheet.
- Roll out to the remaining restaurants.
- Retire auth-redirect, the framed pages and GitHub Pages last, when nothing links to them.
