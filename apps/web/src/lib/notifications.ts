/**
 * A person's Notifications (owner, 2026-09-29): what the office decided about their
 * access (granted, changed, declined), written by the access rules in the decision's
 * own transaction (requests/service.ts). Here: reading them, the unread count for the
 * bar, and marking them read.
 *
 * A notification is not history (rbac.audit is). A read one is deleted 30 days after it
 * was read (owner's call), when its owner next opens Notifications: no scheduled job.
 */

import { notifications, type Db } from '@hub/db';
import { and, count, desc, eq, isNull, lt } from 'drizzle-orm';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Conn = Db | Tx;

export const KEEP_READ_DAYS = 30;

export interface NotificationRow {
  id: number;
  app: string;
  /** 'testing': invited to test a beta app (lib/beta/testers.ts). 'form': a form shared with them (lib/forms/notify.ts). */
  kind: 'granted' | 'changed' | 'declined' | 'testing' | 'form';
  /** { role, stores } for granted and changed; { formId, title } for a form. */
  detail: { role: string; stores: string[] } | { formId: number; title: string } | null;
  createdAt: Date;
  readAt: Date | null;
}

/** Newest first. */
export async function listNotifications(db: Conn, email: string): Promise<NotificationRow[]> {
  const rows = await db
    .select({ id: notifications.id, app: notifications.app, kind: notifications.kind, detail: notifications.detail, createdAt: notifications.createdAt, readAt: notifications.readAt })
    .from(notifications)
    .where(eq(notifications.email, email))
    .orderBy(desc(notifications.createdAt), desc(notifications.id));
  return rows as NotificationRow[];
}

/** The bar's badge. */
export async function unreadCount(db: Conn, email: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.email, email), isNull(notifications.readAt)));
  return Number(row?.n ?? 0);
}

/**
 * Opening Notifications: everything unread becomes read now, and what was read more
 * than 30 days ago goes. Only this person's.
 */
export async function markAllRead(db: Conn, email: string, now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - KEEP_READ_DAYS * 24 * 60 * 60 * 1000);
  await db.update(notifications).set({ readAt: now }).where(and(eq(notifications.email, email), isNull(notifications.readAt)));
  await db.delete(notifications).where(and(eq(notifications.email, email), lt(notifications.readAt, cutoff)));
}
