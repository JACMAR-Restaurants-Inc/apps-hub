import 'server-only';
import { notifications } from '@hub/db';
import { db } from '../db';

/**
 * Tells people a form is waiting for them, in Notifications (portal.notifications, kind
 * 'form'). Its own write, after the form's: a notification is not history, and Forms
 * never writes to another schema inside its own transaction (CLAUDE.md §3, separable).
 * If this fails, the share stands and the form is still on their Forms page.
 */
export async function tellReached(emails: string[], formId: number, title: string): Promise<void> {
  if (!emails.length) return;
  try {
    await db()
      .insert(notifications)
      .values(emails.map((email) => ({ email, app: 'Forms', kind: 'form', detail: { formId, title } })));
  } catch (e) {
    console.error('forms: could not write notifications', e);
  }
}
