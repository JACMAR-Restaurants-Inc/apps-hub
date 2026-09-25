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
- [ ] Managers told the date, the new link, and that they sign in with the same Google account.

## On the day, after the evening counts

1. [ ] Let the Apps Script report queue finish (`PendingReports` has nothing `pending`),
       then pause it: set the `CB_REPORTS_PAUSED` Script Property.
2. [ ] Snapshot the production spreadsheets (File → Make a copy), so there is a fixed
       source to import from and to check against afterwards.
3. [ ] Run the import into PRODUCTION from that snapshot.
4. [ ] Check it (below). Stop here if anything does not match.
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
- [ ] Every attachment is in Storage and linked to its count.
- [ ] No `login` or `password` value exists anywhere in the database.
- [ ] Five real people sign in and see only their own restaurants.

## After

- Aylmer and Vanier off version 36; then clear the plaintext passwords in the sheet.
- Roll out to the remaining restaurants.
- Retire auth-redirect, the framed pages and GitHub Pages last, when nothing links to them.
