/**
 * The two spreadsheets -> the rows to write. Pure: no database, no files.
 *
 * What is carried over, and what is not (CLAUDE.md §5):
 * - Access Control: ONLY the admins (and their Users rows), the restaurants, and the
 *   Perm_* tabs, which are configuration, not people. App_* members and every other
 *   user are NOT imported: everyone else requests access (owner's decision 2026-09-25).
 *   Audit stays in the old sheet.
 * - Cash Balancing: everything except Config_Managers (plaintext credentials; the
 *   import refuses a workbook that still has it) and MAPPING (a header note).
 *   The pseudo-restaurants ALL and ADMIN are dropped.
 *
 * Ids are kept. Blanks stay blank where the schema allows it: unknown is not zero.
 */

import { normalizeEmail } from '@hub/core';
import type {
  admins,
  attachments,
  countCoins,
  countPaper,
  countPettyCash,
  countTills,
  permissionRoles,
  permissions,
  reportJobs,
  restaurantSettings,
  restaurants,
  safeCounts,
  tillFixes,
  tills,
  users,
} from '@hub/db';
import {
  bool,
  cents,
  centsOrNull,
  date,
  exactly,
  id,
  instant,
  instantOrNull,
  int,
  requiredText,
  text,
  time,
  url,
  type At,
  type Cell,
  type Problem,
} from './cells';
import type { SheetRow, Workbook } from './workbook';

type Insert<T extends { $inferInsert: unknown }> = T['$inferInsert'];

export interface Plan {
  restaurants: Insert<typeof restaurants>[];
  users: Insert<typeof users>[];
  admins: Insert<typeof admins>[];
  permissions: Insert<typeof permissions>[];
  permissionRoles: Insert<typeof permissionRoles>[];
  restaurantSettings: Insert<typeof restaurantSettings>[];
  tills: Insert<typeof tills>[];
  safeCounts: Insert<typeof safeCounts>[];
  countTills: Insert<typeof countTills>[];
  countCoins: Insert<typeof countCoins>[];
  countPaper: Insert<typeof countPaper>[];
  countPettyCash: Insert<typeof countPettyCash>[];
  tillFixes: Insert<typeof tillFixes>[];
  attachments: Insert<typeof attachments>[];
  reportJobs: Insert<typeof reportJobs>[];
}

const PSEUDO_RESTAURANTS = new Set(['ALL', 'ADMIN']);
const ROLES = ['office', 'manager', 'viewer'] as const;
const SCOPES = new Set(['global', 'store', 'consolidated']);
const REPORT_STATUS: Record<string, 'sent' | 'failed'> = { done: 'sent', sent: 'sent', failed: 'failed' };

export interface Result {
  plan: Plan;
  problems: Problem[];
}

export function transform(access: Workbook, cash: Workbook): Result {
  const problems: Problem[] = [];

  if ('Config_Managers' in cash) {
    problems.push({
      tab: 'Config_Managers',
      row: 1,
      column: '',
      message: 'this workbook still has the plaintext passwords. Delete the tab in a copy and download that.',
    });
  }

  const tab = (wb: Workbook, name: string): SheetRow[] => {
    const rows = wb[name];
    if (!rows) problems.push({ tab: name, row: 0, column: '', message: 'tab not found' });
    return rows ?? [];
  };
  const each = <T>(wb: Workbook, name: string, f: (at: At, c: Record<string, Cell>) => T | null): T[] =>
    tab(wb, name).flatMap((r) => {
      const out = f({ tab: name, row: r.row, problems }, r.cells);
      return out === null ? [] : [out];
    });
  const flag = (at: At, column: string, message: string) => {
    problems.push({ tab: at.tab, row: at.row, column, message });
  };
  const email = (at: At, column: string, v: Cell | undefined) => {
    const t = text(at, column, v);
    return t === null ? null : normalizeEmail(t);
  };
  const storeId = (at: At, column: string, v: Cell | undefined) => requiredText(at, column, v);

  // ---- Access Control ----

  const restaurantRows = each(access, 'Restaurants', (at, c) => ({
    restaurantId: storeId(at, 'restaurant_id', c.restaurant_id),
    name: requiredText(at, 'name', c.name),
    active: exactly('yes', c.active),
  }));
  const known = new Set(restaurantRows.map((r) => r.restaurantId));

  const adminRows = each(access, 'Admins', (at, c) => {
    const e = email(at, 'email', c.email);
    return e ? { email: e, notify: exactly('yes', c.notify) } : null;
  });
  const adminEmails = new Set(adminRows.map((a) => a.email));

  const userRows = each(access, 'Users', (at, c) => {
    const e = email(at, 'email', c.email);
    if (!e || !adminEmails.has(e)) return null; // only admins are carried over
    return {
      email: e,
      hrEmail: email(at, 'hr_email', c.hr_email),
      fullName: text(at, 'full_name', c.full_name),
      clearviewStore: text(at, 'clearview_store', c.clearview_store),
      active: exactly('yes', c.active),
      addedAt: instant(at, 'added_on', c.added_on),
      addedBy: email(at, 'added_by', c.added_by),
    };
  });
  for (const a of adminRows) {
    if (!userRows.some((u) => u.email === a.email)) {
      problems.push({ tab: 'Admins', row: 0, column: 'email', message: 'an admin has no Users row' });
    }
  }

  const permissionRows: Plan['permissions'] = [];
  const permissionRoleRows: Plan['permissionRoles'] = [];
  for (const name of Object.keys(access).filter((n) => n.startsWith('Perm_'))) {
    const app = name.slice('Perm_'.length);
    for (const { row, cells: c } of tab(access, name)) {
      const at: At = { tab: name, row, problems };
      const resource = requiredText(at, 'resource', c.resource);
      const action = requiredText(at, 'action', c.action);
      const scope = requiredText(at, 'scope', c.scope);
      if (!SCOPES.has(scope)) {
        flag(at, 'scope', 'unknown scope');
        continue;
      }
      permissionRows.push({ app, resource, action, scope: scope as 'global' | 'store' | 'consolidated' });
      for (const role of ROLES) if (exactly('granted', c[role])) permissionRoleRows.push({ app, resource, action, role });
    }
  }

  // ---- Cash Balancing ----

  const restaurantRef = (at: At, column: string, v: Cell | undefined) => {
    const r = storeId(at, column, v);
    if (r && !known.has(r)) flag(at, column, 'restaurant not in Access Control');
    return r;
  };

  const settingsRows = each(cash, 'Config_Restaurants', (at, c) => {
    const r = storeId(at, 'restaurant_id', c.restaurant_id);
    if (PSEUDO_RESTAURANTS.has(r)) return null;
    return {
      restaurantId: restaurantRef(at, 'restaurant_id', c.restaurant_id),
      expectedSafeTotalCents: cents(at, 'expected_safe_total', c.expected_safe_total),
      reportEmail: text(at, 'email', c.email)?.toLowerCase() ?? null,
    };
  });

  const tillRows = each(cash, 'Config_Tills', (at, c) => ({
    restaurantId: restaurantRef(at, 'restaurant_id', c.restaurant_id),
    tillNumber: int(at, 'till_number', c.till_number),
    tillLabel: requiredText(at, 'till_label', c.till_label),
    baseAmountCents: cents(at, 'base_amount', c.base_amount),
  }));

  const countRows = each(cash, 'SafeCounts', (at, c) => ({
    id: id(at, 'id', c.id),
    restaurantId: restaurantRef(at, 'restaurant_id', c.restaurant_id),
    managerName: requiredText(at, 'manager_name', c.manager_name),
    filedBy: null,
    countDate: date(at, 'count_date', c.count_date),
    countTime: time(at, 'count_time', c.count_time),
    comments: text(at, 'comments', c.comments),
    tillsTotalCents: cents(at, 'tills_total', c.tills_total),
    coinsTotalCents: cents(at, 'coins_total', c.coins_total),
    paperTotalCents: cents(at, 'paper_total', c.paper_total),
    pettyCashTotalCents: cents(at, 'petty_cash_total', c.petty_cash_total),
    grandTotalCents: cents(at, 'grand_total', c.grand_total),
    expectedTotalCents: cents(at, 'expected_total', c.expected_total),
    varianceCents: cents(at, 'variance', c.variance),
    language: requiredText(at, 'language', c.language),
    pdfUrl: url(at, 'pdf_url', c.pdf_url),
    createdAt: instant(at, 'created_at', c.created_at),
  }));
  const countById = new Map(countRows.map((r) => [r.id, r]));
  const countRef = (at: At, v: Cell | undefined) => {
    const n = id(at, 'safe_count_id', v);
    if (n > 0 && !countById.has(n)) flag(at, 'safe_count_id', 'no such count');
    return n;
  };

  const countTillRows = each(cash, 'CountTills', (at, c) => ({
    id: id(at, 'id', c.id),
    safeCountId: countRef(at, c.safe_count_id),
    restaurantId: restaurantRef(at, 'restaurant_id', c.restaurant_id),
    tillNumber: int(at, 'till_number', c.till_number),
    tillLabel: requiredText(at, 'till_label', c.till_label),
    baseAmountCents: cents(at, 'base_amount', c.base_amount),
    countedAmountCents: cents(at, 'counted_amount', c.counted_amount),
    varianceCents: cents(at, 'variance', c.variance),
    wasShort: bool(at, 'was_short', c.was_short),
    wasFixed: bool(at, 'was_fixed', c.was_fixed),
    fixAmountFromIntakeCents: cents(at, 'fix_amount_from_intake', c.fix_amount_from_intake),
    createdAt: instant(at, 'created_at', c.created_at),
  }));

  const coinRows = each(cash, 'CountCoins', (at, c) => ({
    id: id(at, 'id', c.id),
    safeCountId: countRef(at, c.safe_count_id),
    denominationCents: cents(at, 'denomination', c.denomination),
    rolls: int(at, 'rolls', c.rolls),
    looseCount: int(at, 'loose_count', c.loose_count),
    totalCents: cents(at, 'total', c.total),
    createdAt: instant(at, 'created_at', c.created_at),
  }));

  const paperRows = each(cash, 'CountPaper', (at, c) => ({
    id: id(at, 'id', c.id),
    safeCountId: countRef(at, c.safe_count_id),
    denominationCents: cents(at, 'denomination', c.denomination),
    count: int(at, 'count', c.count),
    totalCents: cents(at, 'total', c.total),
    createdAt: instant(at, 'created_at', c.created_at),
  }));

  const pettyRows = each(cash, 'CountPettyCash', (at, c) => ({
    id: id(at, 'id', c.id),
    safeCountId: countRef(at, c.safe_count_id),
    description: text(at, 'description', c.description),
    amountCents: cents(at, 'amount', c.amount),
    createdAt: instant(at, 'created_at', c.created_at),
  }));

  const fixRows = each(cash, 'TillFixes', (at, c) => ({
    id: id(at, 'id', c.id),
    safeCountId: countRef(at, c.safe_count_id),
    tillNumber: int(at, 'till_number', c.till_number),
    shortageAmountCents: cents(at, 'shortage_amount', c.shortage_amount),
    intakeDeltaCents: centsOrNull(at, 'intake_delta', c.intake_delta),
    fixedAt: instantOrNull(at, 'fixed_at', c.fixed_at),
    createdAt: instant(at, 'created_at', c.created_at),
  }));

  const attachmentRows = each(cash, 'CountAttachments', (at, c) => {
    const safeCountId = countRef(at, c.safe_count_id);
    // Before 2026-09-08 an attachment recorded no restaurant. It belongs to its count,
    // so it takes the count's.
    const own = text(at, 'restaurant_id', c.restaurant_id);
    const restaurantId = own ? restaurantRef(at, 'restaurant_id', own) : (countById.get(safeCountId)?.restaurantId ?? '');
    if (own && countById.get(safeCountId) && countById.get(safeCountId)!.restaurantId !== own) {
      flag(at, 'restaurant_id', "differs from its count's restaurant");
    }
    return {
      id: id(at, 'id', c.id),
      safeCountId,
      restaurantId,
      uploadedBy: email(at, 'uploaded_by', c.uploaded_by),
      fileName: requiredText(at, 'file_name', c.file_name),
      mimeType: requiredText(at, 'mime_type', c.mime_type),
      fileSize: int(at, 'file_size', c.file_size),
      storagePath: null,
      legacyDriveFileId: requiredText(at, 'drive_file_id', c.drive_file_id),
      createdAt: instant(at, 'created_at', c.created_at),
    };
  });

  const jobRows = each(cash, 'PendingReports', (at, c) => {
    const raw = requiredText(at, 'status', c.status);
    const status = REPORT_STATUS[raw];
    // A pending job would be picked up and emailed by the new app. Cutover step 1
    // drains the old queue first; if one is still here, stop rather than send twice.
    if (!status) flag(at, 'status', `"${raw}": drain the old report queue first`);
    return {
      id: id(at, 'id', c.id),
      safeCountId: countRef(at, c.safe_count_id),
      language: requiredText(at, 'language', c.language),
      status: status ?? 'failed',
      attempts: int(at, 'attempts', c.attempts),
      lastError: text(at, 'last_error', c.last_error),
      sendToAccountant: exactly('Y', c.send_to_accountant),
      createdAt: instant(at, 'created_at', c.created_at),
      processedAt: instantOrNull(at, 'processed_at', c.processed_at),
    };
  });

  return {
    plan: {
      restaurants: restaurantRows,
      users: userRows,
      admins: adminRows,
      permissions: permissionRows,
      permissionRoles: permissionRoleRows,
      restaurantSettings: settingsRows,
      tills: tillRows,
      safeCounts: countRows,
      countTills: countTillRows,
      countCoins: coinRows,
      countPaper: paperRows,
      countPettyCash: pettyRows,
      tillFixes: fixRows,
      attachments: attachmentRows,
      reportJobs: jobRows,
    },
    problems,
  };
}
