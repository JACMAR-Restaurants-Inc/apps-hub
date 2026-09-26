/**
 * Asking for access, and an admin granting, changing, declining or removing it.
 * Ported from RBAC library Request.gs and portal AdminWrite.gs; the rules are theirs.
 *
 * It reaches the database only through AccessStore, so every rule here is tested
 * against an in-memory roster (service.test.ts). Callers (actions.ts) have already
 * established WHO is acting: a signed-in person for a request, a system admin for
 * everything else.
 *
 * A REQUEST GRANTS NOTHING. It adds the person INACTIVE and a 'pending' membership with
 * no role; can() refuses both (steps 2 and 3). An admin has to act.
 *
 * Every write is one transaction. Emails go AFTER it commits and never change the
 * outcome: a request that was saved is not reported as a failure because the mail leg
 * broke (Request.gs). Both outcomes of every email are audited.
 */

import type { Clearview, Employee } from '@hub/clearview';
import type { SendResult } from '@hub/email';
import type { MemberStatus, Role } from '@hub/rbac';
import { BREAK_GLASS_ADMIN } from '@hub/rbac';
import { appByKey } from './apps';
import { accessDeclinedMail, accessGrantedMail, accessRequestMail, storeLabel, type Mail } from './messages';

export interface MemberRow {
  status: MemberStatus;
  role: Role | null;
  notifiedOn: Date | null;
  stores: string[];
}

export interface UserRow {
  fullName: string | null;
  hrEmail: string | null;
  employeeNumber: string | null;
  clearviewStore: string | null;
  active: boolean;
}

export interface AuditEntry {
  actorEmail: string;
  app: string;
  event: 'request' | 'grant' | 'update' | 'decline' | 'revoke' | 'notify';
  targetEmail: string;
  detail: Record<string, unknown>;
}

/** Everything the rules need from the database. Emails are already normalised. */
export interface AccessStore {
  transaction<T>(fn: (tx: AccessStore) => Promise<T>): Promise<T>;
  /** Locks the row for the rest of the transaction. */
  findMember(app: string, email: string): Promise<MemberRow | null>;
  findUser(email: string): Promise<UserRow | null>;
  insertUser(email: string, row: Omit<UserRow, 'active'> & { active: false; addedBy: string }): Promise<void>;
  /** Sets only the fields that are null on the row: a filled cell may be an admin's correction. */
  fillUserBlanks(email: string, fields: Partial<Omit<UserRow, 'active'>>): Promise<void>;
  setUserActive(email: string): Promise<void>;
  insertMember(app: string, email: string, row: { status: 'pending' }): Promise<void>;
  updateMember(
    app: string,
    email: string,
    patch: { status?: MemberStatus; role?: Role | null; grantedBy?: string; notifiedOn?: Date | null },
  ): Promise<void>;
  /** Makes the member's stores exactly this list. */
  setMemberStores(app: string, email: string, stores: string[]): Promise<void>;
  restaurants(): Promise<{ id: string; name: string; active: boolean }[]>;
  /** The roles an app's permissions mention: the only ones that can be granted there. */
  rolesFor(app: string): Promise<Role[]>;
  /** Admins who asked to be told about requests. */
  notifyAdmins(): Promise<string[]>;
  audit(entry: AuditEntry): Promise<void>;
}

export interface AccessDeps {
  store: AccessStore;
  clearview: Pick<Clearview, 'lookupEmployee'>;
  send: (mail: Mail & { to: string[] }) => Promise<SendResult>;
  /** Absolute URLs, for the emails. */
  urls: { admin: string; app: (path: string) => string };
}

export type RequestOutcome =
  | 'pending'
  | 'duplicate'
  | 'unknown_app'
  | 'employee_required'
  | 'employee_not_found'
  | 'clearview_unavailable';

export async function requestAccess(deps: AccessDeps, email: string, appKey: string, employeeNumber: string): Promise<RequestOutcome> {
  const app = appByKey(appKey);
  if (!app) return 'unknown_app';
  const { store } = deps;
  const refuse = async (outcome: RequestOutcome, detail: Record<string, unknown>) => {
    await store.audit({ actorEmail: email, app: appKey, event: 'request', targetEmail: email, detail: { result: outcome, ...detail } });
    return outcome;
  };

  // A pending or active row means there is nothing to add. A second ask is still
  // logged: it is the sign the first went unanswered. A REVOKED row is somebody asking
  // again, which the office should hear about (RBAC §45).
  const before = await store.findMember(appKey, email);
  if (before && before.status !== 'revoked') return refuse('duplicate', { status: before.status });

  // The employee number is required and must match (RBAC §65). The two failures are
  // told apart: a wrong number is theirs to fix, Clearview being down is not.
  const number = employeeNumber.trim();
  if (!number) return refuse('employee_required', {});
  const found = await deps.clearview.lookupEmployee(number);
  if (found.status === 'not_found') return refuse('employee_not_found', { employeeNumber: number });
  if (found.status === 'unavailable') return refuse('clearview_unavailable', { employeeNumber: number, reason: found.reason });
  const employee: Employee = found.employee;

  const known = new Map((await store.restaurants()).map((r) => [r.id, r]));
  // Only a store the roster has can be ticked in the Grant panel.
  const suggested = employee.storeNumber && known.has(employee.storeNumber) ? employee.storeNumber : null;

  const outcome = await store.transaction(async (tx) => {
    const member = await tx.findMember(appKey, email);
    if (member && member.status !== 'revoked') return 'duplicate' as const;

    if (!(await tx.findUser(email))) {
      await tx.insertUser(email, {
        fullName: employee.fullName || null,
        hrEmail: employee.hrEmail,
        employeeNumber: employee.number,
        clearviewStore: suggested,
        active: false,
        addedBy: 'self-service request',
      });
    } else {
      await tx.fillUserBlanks(email, {
        fullName: employee.fullName || null,
        hrEmail: employee.hrEmail,
        employeeNumber: employee.number,
        clearviewStore: suggested,
      });
    }

    if (member) {
      // Asking again: the same row, back to pending. Role and stores stay as the
      // record of what they held; pending grants nothing whatever they say.
      // notifiedOn is cleared, or a re-grant would never tell them (RBAC §45).
      await tx.updateMember(appKey, email, { status: 'pending', notifiedOn: null });
    } else {
      await tx.insertMember(appKey, email, { status: 'pending' });
    }
    await tx.audit({
      actorEmail: email,
      app: appKey,
      event: 'request',
      targetEmail: email,
      detail: {
        result: 'pending',
        askedAgain: Boolean(member),
        ...(member ? { was: member.status } : {}),
        employeeNumber: employee.number,
        clearviewActive: employee.active,
      },
    });
    return 'pending' as const;
  });
  if (outcome !== 'pending') return refuse(outcome, { raced: true });

  // Told after the commit. If no admin asked to be told, the break-glass admin is:
  // the wrong admin told beats no admin told.
  const flagged = await store.notifyAdmins();
  const to = flagged.length ? flagged : [BREAK_GLASS_ADMIN];
  const mail = accessRequestMail({
    email,
    appName: app.name.fr,
    adminUrl: deps.urls.admin,
    employee: { number: employee.number, fullName: employee.fullName, active: employee.active, storeLabel: employee.storeLabel },
    storeTicked: Boolean(suggested),
    askedAgain: Boolean(before),
  });
  const sent = await deps.send({ ...mail, to });
  await store.audit({
    actorEmail: email,
    app: appKey,
    event: 'notify',
    targetEmail: email,
    detail: { mail: 'request', to, fellBack: !flagged.length, ...sent },
  });
  return 'pending';
}

/** 'done_unsent': granted, but the email to the person did not go (the page says to tell them). */
export type AdminOutcome = 'done' | 'done_unsent' | 'changed' | 'invalid';

// Every admin write checks, under a row lock, that the row is still in the state the
// admin saw, or answers 'changed': two admins, or a page left open, cannot grant over a
// decline (RBAC §48).

async function validChoice(store: AccessStore, appKey: string, role: Role, stores: string[]) {
  if (!appByKey(appKey)) return false;
  if (!(await store.rolesFor(appKey)).includes(role)) return false;
  if (!stores.length) return false;
  const open = new Set((await store.restaurants()).filter((r) => r.active).map((r) => r.id));
  // Only open restaurants: a closed one denies whatever a row says (can() step 5).
  return stores.every((s) => open.has(s));
}

/** Pending -> active, with a role and restaurants. Switches the person on, and emails them once. */
export async function grantAccess(
  deps: AccessDeps,
  admin: string,
  appKey: string,
  email: string,
  role: Role,
  stores: string[],
): Promise<AdminOutcome> {
  const { store } = deps;
  const chosen = [...new Set(stores)].sort();
  if (!(await validChoice(store, appKey, role, chosen))) return 'invalid';

  const result = await store.transaction(async (tx) => {
    const member = await tx.findMember(appKey, email);
    if (!member || member.status !== 'pending') return { outcome: 'changed' as const };
    // Granting switches the person on (RBAC §30): a request added them inactive.
    await tx.setUserActive(email);
    await tx.updateMember(appKey, email, { status: 'active', role, grantedBy: admin });
    await tx.setMemberStores(appKey, email, chosen);
    await tx.audit({
      actorEmail: admin,
      app: appKey,
      event: 'grant',
      targetEmail: email,
      detail: { before: { status: member.status, role: member.role, stores: member.stores }, after: { role, stores: chosen } },
    });
    return { outcome: 'done' as const, alreadyTold: member.notifiedOn !== null };
  });
  if (result.outcome !== 'done' || result.alreadyTold) return result.outcome;

  const app = appByKey(appKey)!;
  const names = new Map((await store.restaurants()).map((r) => [r.id, r.name]));
  const mail = accessGrantedMail({
    email,
    appName: app.name.fr,
    url: deps.urls.app(app.path),
    stores: chosen.map((id) => storeLabel(id, names.get(id) ?? id)),
  });
  const sent = await deps.send({ ...mail, to: [email] });
  if (sent.sent) await store.updateMember(appKey, email, { notifiedOn: new Date() });
  await store.audit({ actorEmail: admin, app: appKey, event: 'notify', targetEmail: email, detail: { mail: 'granted', ...sent } });
  return sent.sent ? 'done' : 'done_unsent';
}

/** Change the role or restaurants of somebody who has access. Emails nobody; the person's switch is untouched. */
export async function updateAccess(
  deps: AccessDeps,
  admin: string,
  appKey: string,
  email: string,
  role: Role,
  stores: string[],
): Promise<AdminOutcome> {
  const { store } = deps;
  const chosen = [...new Set(stores)].sort();
  if (!(await validChoice(store, appKey, role, chosen))) return 'invalid';
  return store.transaction(async (tx) => {
    const member = await tx.findMember(appKey, email);
    if (!member || member.status !== 'active') return 'changed';
    await tx.updateMember(appKey, email, { role, grantedBy: admin });
    await tx.setMemberStores(appKey, email, chosen);
    await tx.audit({
      actorEmail: admin,
      app: appKey,
      event: 'update',
      targetEmail: email,
      detail: { before: { role: member.role, stores: member.stores }, after: { role, stores: chosen } },
    });
    return 'done';
  });
}

/**
 * Decline a request, or remove access. Both leave the row 'revoked' (deactivate, never
 * delete), keep its role and stores as the record, and leave the person's global switch
 * alone: they may hold another app (RBAC §48). They can ask again.
 *
 * A DECLINE emails the person (owner's call, 2026-09-25, reversing §48's silence).
 * A REMOVAL still emails nobody.
 */
export async function endAccess(
  deps: AccessDeps,
  admin: string,
  appKey: string,
  email: string,
  expected: 'pending' | 'active',
): Promise<AdminOutcome> {
  const app = appByKey(appKey);
  if (!app) return 'invalid';
  const outcome = await deps.store.transaction(async (tx) => {
    const member = await tx.findMember(appKey, email);
    if (!member || member.status !== expected) return 'changed' as const;
    await tx.updateMember(appKey, email, { status: 'revoked', grantedBy: admin });
    await tx.audit({
      actorEmail: admin,
      app: appKey,
      event: expected === 'pending' ? 'decline' : 'revoke',
      targetEmail: email,
      detail: { before: { status: member.status, role: member.role, stores: member.stores } },
    });
    return 'done' as const;
  });
  if (outcome !== 'done' || expected !== 'pending') return outcome;

  const mail = accessDeclinedMail({ email, appName: app.name.fr, portalUrl: deps.urls.app('/') });
  const sent = await deps.send({ ...mail, to: [email] });
  await deps.store.audit({ actorEmail: admin, app: appKey, event: 'notify', targetEmail: email, detail: { mail: 'declined', ...sent } });
  return 'done';
}
