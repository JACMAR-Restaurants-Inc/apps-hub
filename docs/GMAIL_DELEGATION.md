# Email from the portal: what the Workspace admin does

For Sony, to pass to the Workspace super admin. Written 2026-10-06.

## Why

The portal sends its emails through Gmail: access requests to the admins, "you now have
access" and "declined" to the person, and Cash Balancing's count reports. It is all
built, but Google has not given it permission to send yet, so today every email is
recorded as "not sent". One entry in the Admin console fixes that. No code changes.

## The steps (about 2 minutes)

Signed in to the Admin console as a **super admin**:

1. Go to **admin.google.com**.
2. Open **Security → Access and data control → API controls**.
3. At the bottom, click **Manage Domain Wide Delegation**.
4. Click **Add new** and enter:
   - **Client ID:** `117203550704415068036`
   - **OAuth scopes:** `https://www.googleapis.com/auth/gmail.send`
5. Click **Authorize**.

It can take a few minutes to apply, and occasionally up to 24 hours.

## What this allows, and what it does not

- The portal can **send** email as one address in the Workspace: the one set as
  `GMAIL_SENDER`.
- It **cannot read** any mailbox, and it cannot do anything else in Google.

## The sender address

- Every email comes **from** the `GMAIL_SENDER` address, whoever approved. Replies go
  to that mailbox. Today it is sony@jacmar-restaurants.com.
- It must be a **real user account** in the Workspace, with its own login. A Google
  Group or an alias does not work.
- To check an address such as hr@jacmar-restaurants.com: Admin console →
  **Directory → Users**. If it is listed there, it works. If it is under **Groups**, it
  does not.
- If hr@ is used, HR receives the replies, and every email (Cash Balancing's reports
  to the accountant too) comes "from HR".
- For production, the plan (`docs/CUTOVER.md`) is a shared mailbox such as
  portail@jacmar-restaurants.com. Changing the sender is a setting only; the step
  above does not need redoing.

## After it is done

Tell Claude. The next access request or count report on staging will arrive, or be
recorded as not sent with the reason, which confirms it works.

## Questions that come up

- **Who gets a request email?** Every admin with notifications on (today Sony and
  Pierre, both on). One email, both addressed. If nobody has notifications on, it
  goes to Sony.
- **Do old emails suddenly all go out?** No. Access emails are never retried. Count
  reports retry only from the last 7 days with fewer than 8 attempts, and on staging
  none qualify today (2026-10-06).
- **What if we move to a different Vercel plan or account (Enterprise)?** Nothing
  changes in Google. The Client ID belongs to the Google Cloud service account, not
  Vercel. Only the portal's settings are copied to the new Vercel project
  (`GMAIL_SERVICE_ACCOUNT`, `GMAIL_SENDER`, `EMAIL_MODE` and the rest).
- **When would this entry need changing?**
  - A **new service account** is created (new Client ID): remove the old entry, add
    the new one.
  - The portal needs **another permission**: add its scope to this same entry, after
    a comma. Replacing the service account's key does NOT change the Client ID.
- **Drive access?** Not now. Storing files in Drive is not built yet, and granting it
  early gives a permission nothing uses. When it is built, the same entry gets one
  more scope:
  - `drive.file`: only files the portal creates. The narrowest choice.
  - `drive`: everything in that mailbox's Drive. Needed only to reach the old app's
    folders, for example to move the 256 imported attachments.

  Which one is decided then.
