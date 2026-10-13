import 'server-only';
import { notifications } from '@hub/db';
import { and, eq, sql } from 'drizzle-orm';
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

/** A deleted form's notifications go too, so no bell points at nothing. Its own write, after the delete. */
export async function forgetForm(formId: number): Promise<void> {
  try {
    await db()
      .delete(notifications)
      .where(and(eq(notifications.app, 'Forms'), eq(notifications.kind, 'form'), sql`(${notifications.detail} ->> 'formId')::int = ${formId}`));
  } catch (e) {
    console.error('forms: could not remove a deleted form’s notifications', e);
  }
}
