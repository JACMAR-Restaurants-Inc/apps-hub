import { describe, expect, it } from 'vitest';
import type { Cell } from './cells';
import { projectRef } from './cli-ref';
import { transform } from './transform';
import { toCell, type Workbook } from './workbook';

// The xlsx reader returns Toronto wall-clock readings in a Date's UTC fields.
const wall = (iso: string) => new Date(`${iso}Z`);
const rows = (...list: Record<string, Cell>[]) => list.map((cells, i) => ({ row: i + 2, cells }));

function access(over: Partial<Workbook> = {}): Workbook {
  return {
    Users: rows(
      { email: 'Boss@Jacmar-Restaurants.com ', full_name: 'Boss', active: 'yes', added_on: wall('2026-08-01T09:00:00'), added_by: 'x@y.com', hr_email: null },
      { email: 'manager@gmail.com', full_name: 'Manager', active: 'yes', added_on: wall('2026-08-01T09:00:00'), added_by: 'x@y.com', hr_email: null },
    ),
    Restaurants: rows({ restaurant_id: 1647, name: 'Hull', active: 'yes' }, { restaurant_id: 3472, name: 'Aylmer', active: 'no' }),
    Admins: rows({ email: 'boss@jacmar-restaurants.com', notify: 'yes' }),
    App_SafeCount: rows({ email: 'manager@gmail.com', role: 'manager', 1647: 'granted', status: 'active' }),
    Perm_SafeCount: rows(
      { resource: 'count', action: 'create', scope: 'store', office: 'denied', manager: 'granted', viewer: 'denied' },
      { resource: 'count', action: 'view', scope: 'store', office: 'granted', manager: 'Granted', viewer: ' granted' },
    ),
    Audit: rows({ timestamp: wall('2026-09-01T10:00:00'), actor: 'someone@gmail.com', event: 'denied' }),
    ...over,
  };
}

function cash(over: Partial<Workbook> = {}): Workbook {
  return {
    Config_Restaurants: rows(
      { restaurant_id: 1647, name: 'Hull', expected_safe_total: 5100, email: 'Hull@Example.com' },
      { restaurant_id: 'ALL', name: 'JACMAR (tous)', expected_safe_total: 0, email: 'a@b.c' },
      { restaurant_id: 'ADMIN', name: 'Admin', expected_safe_total: 0, email: 'a@b.c' },
    ),
    Config_Tills: rows({ restaurant_id: 1647, till_number: 1, till_label: 'Caisse 1', base_amount: 150 }),
    SafeCounts: rows({
      id: 507,
      restaurant_id: 1647,
      manager_name: 'Someone',
      count_date: wall('2026-04-08T00:00:00'),
      count_time: wall('1899-12-30T18:35:00'),
      comments: { error: '#ERROR!' },
      tills_total: 151.05,
      coins_total: 0,
      paper_total: 0,
      petty_cash_total: 41.489999999999995,
      grand_total: 192.54,
      expected_total: 5100,
      variance: -4907.46,
      language: 'fr',
      pdf_url: { text: 'PDF', hyperlink: 'https://drive.google.com/file/d/abc' },
      created_at: wall('2026-04-08T18:36:14'),
    }),
    CountTills: rows({
      id: 1, safe_count_id: 507, restaurant_id: 1647, till_number: 1, till_label: 'Caisse 1', base_amount: 150,
      counted_amount: 151.05, variance: 1.05, was_short: false, was_fixed: false, fix_amount_from_intake: 0,
      created_at: wall('2026-04-08T18:36:14'),
    }),
    CountCoins: rows({ id: 1, safe_count_id: 507, denomination: 0.05, rolls: 0, loose_count: 0, total: 0, created_at: wall('2026-04-08T18:36:14') }),
    CountPaper: rows({ id: 1, safe_count_id: 507, denomination: 5, count: 0, total: 0, created_at: wall('2026-04-08T18:36:14') }),
    CountPettyCash: rows({ id: 9, safe_count_id: 507, description: null, amount: 41.489999999999995, created_at: wall('2026-04-08T18:36:14') }),
    TillFixes: rows({ id: 3, safe_count_id: 507, till_number: 1, shortage_amount: 1, fixed_at: null, created_at: wall('2026-04-08T18:36:14'), intake_delta: null }),
    CountAttachments: rows({
      id: 4, safe_count_id: 507, file_name: 'a.jpg', mime_type: 'image/jpeg', file_size: 10, drive_file_id: 'drv',
      drive_url: { text: 'x', hyperlink: 'https://drive.google.com/x' }, created_at: wall('2026-04-08T18:36:14'),
      restaurant_id: null, uploaded_by: null,
    }),
    PendingReports: rows({
      id: 1, safe_count_id: 507, language: 'fr', status: 'done', attempts: 0, last_error: null,
      created_at: wall('2026-04-08T18:36:20'), processed_at: wall('2026-04-08T18:37:00'), send_to_accountant: 'Y',
    }),
    MAPPING: rows({ 'Config_Managers Header': 'x', 'Clearview Path': 'y' }),
    ...over,
  };
}

const messages = (r: ReturnType<typeof transform>) => r.problems.map((p) => `${p.tab}.${p.column}: ${p.message}`);

describe('who is carried over', () => {
  it('only admins, with their Users row; nobody from App_* and no other user', () => {
    const { plan, problems } = transform(access(), cash());
    expect(problems).toEqual([]);
    expect(plan.admins).toEqual([{ email: 'boss@jacmar-restaurants.com', notify: true }]);
    expect(plan.users.map((u) => u.email)).toEqual(['boss@jacmar-restaurants.com']);
    expect(JSON.stringify(plan)).not.toContain('manager@gmail.com');
    expect(JSON.stringify(plan)).not.toContain('someone@gmail.com'); // the Audit tab stays behind
  });

  it('an admin with no Users row is a problem, not a silent skip', () => {
    const r = transform(access({ Users: rows() }), cash());
    expect(messages(r)).toContain('Admins.email: an admin has no Users row');
  });

  it('refuses a workbook that still has Config_Managers', () => {
    const r = transform(access(), cash({ Config_Managers: rows({ login: 'x', password: 'y' }) }));
    expect(messages(r).some((m) => m.startsWith('Config_Managers'))).toBe(true);
    expect(JSON.stringify(r.plan)).not.toContain('"y"');
  });
});

describe('what the cells mean', () => {
  const { plan } = transform(access(), cash());

  it('grants on the exact word only, trimmed as RBAC always trimmed: "Granted" does not', () => {
    expect(plan.permissionRoles).toEqual([
      { app: 'SafeCount', resource: 'count', action: 'create', role: 'manager' },
      { app: 'SafeCount', resource: 'count', action: 'view', role: 'office' },
      { app: 'SafeCount', resource: 'count', action: 'view', role: 'viewer' },
    ]);
    expect(plan.restaurants.map((r) => [r.restaurantId, r.active])).toEqual([
      ['1647', true],
      ['3472', false],
    ]);
  });

  it('drops the pseudo-restaurants ALL and ADMIN', () => {
    expect(plan.restaurantSettings.map((r) => r.restaurantId)).toEqual(['1647']);
  });

  it('turns float dollars into exact cents', () => {
    const c = plan.safeCounts[0]!;
    expect([c.tillsTotalCents, c.pettyCashTotalCents, c.grandTotalCents, c.varianceCents]).toEqual([15105, 4149, 19254, -490746]);
    expect(plan.countCoins[0]!.denominationCents).toBe(5);
  });

  it('refuses an amount that is not whole cents, or blank', () => {
    const r = transform(access(), cash({ Config_Tills: rows({ restaurant_id: 1647, till_number: 1, till_label: 'C', base_amount: 150.005 }) }));
    expect(messages(r)).toEqual(['Config_Tills.base_amount: not a whole number of cents']);
    const blank = transform(access(), cash({ Config_Tills: rows({ restaurant_id: 1647, till_number: 1, till_label: 'C', base_amount: null }) }));
    expect(messages(blank)).toEqual(['Config_Tills.base_amount: blank']);
  });

  it('reads dates and times as Toronto wall-clock, and timestamps as real instants', () => {
    const c = plan.safeCounts[0]!;
    expect(c.countDate).toBe('2026-04-08');
    expect(c.countTime).toBe('18:35:00');
    expect((c.createdAt as Date).toISOString()).toBe('2026-04-08T22:36:14.000Z');
  });

  it('keeps ids, the PDF link target, and a formula error as the sheet shows it', () => {
    const c = plan.safeCounts[0]!;
    expect(c.id).toBe(507);
    expect(c.pdfUrl).toBe('https://drive.google.com/file/d/abc');
    expect(c.comments).toBe('#ERROR!');
  });

  it('keeps blanks as unknown, not zero', () => {
    expect(plan.countPettyCash[0]!.description).toBeNull();
    expect(plan.tillFixes[0]!.intakeDeltaCents).toBeNull();
    expect(plan.tillFixes[0]!.fixedAt).toBeNull();
  });

  it("gives an attachment with no restaurant its count's", () => {
    expect(plan.attachments[0]!.restaurantId).toBe('1647');
    expect(plan.attachments[0]!.legacyDriveFileId).toBe('drv');
  });

  it('maps a finished report to sent, and never imports a pending one', () => {
    expect(plan.reportJobs[0]).toMatchObject({ status: 'sent', sendToAccountant: true });
    const pendingJob = cash().PendingReports![0]!.cells;
    const r = transform(access(), cash({ PendingReports: rows({ ...pendingJob, status: 'pending' }) }));
    expect(messages(r)).toEqual(['PendingReports.status: "pending": drain the old report queue first']);
  });

  it('lowercases the report email', () => {
    expect(plan.restaurantSettings[0]!.reportEmail).toBe('hull@example.com');
  });
});

describe('what does not fit is a problem', () => {
  it('a restaurant Access Control does not know', () => {
    const r = transform(access(), cash({ Config_Tills: rows({ restaurant_id: 9999, till_number: 1, till_label: 'C', base_amount: 1 }) }));
    expect(messages(r)).toEqual(['Config_Tills.restaurant_id: restaurant not in Access Control']);
  });

  it('a line whose count does not exist', () => {
    const r = transform(
      access(),
      cash({ CountCoins: rows({ id: 1, safe_count_id: 999, denomination: 0.05, rolls: 0, loose_count: 0, total: 0, created_at: wall('2026-04-08T18:36:14') }) }),
    );
    expect(messages(r)).toEqual(['CountCoins.safe_count_id: no such count']);
  });

  it('a missing tab', () => {
    const { SafeCounts: _, ...withoutCounts } = cash();
    expect(messages(transform(access(), withoutCounts))).toContain('SafeCounts.: tab not found');
  });

  it('a problem names the row a person would look at', () => {
    const r = transform(access(), cash({ Config_Tills: rows({ restaurant_id: 1647, till_number: 1.5, till_label: 'C', base_amount: 1 }) }));
    expect(r.problems[0]).toEqual({ tab: 'Config_Tills', row: 2, column: 'till_number', message: 'expected a whole number' });
  });
});

describe('reading the xlsx', () => {
  it('turns exceljs values into plain cells', () => {
    expect(toCell({ text: 'PDF', hyperlink: 'https://x' })).toEqual({ text: 'PDF', hyperlink: 'https://x' });
    expect(toCell({ error: '#ERROR!' } as never)).toEqual({ error: '#ERROR!' });
    expect(toCell({ richText: [{ text: 'a' }, { text: 'b' }] })).toBe('ab');
    expect(toCell({ formula: '1+1', result: 2 } as never)).toBe(2);
    expect(toCell(null)).toBeNull();
  });
});

describe('projectRef: which database the import is about to write', () => {
  it('reads the pooler user or the direct host', () => {
    expect(projectRef('postgresql://postgres.abc123:pw@aws-0-ca-central-1.pooler.supabase.com:6543/postgres')).toBe('abc123');
    expect(projectRef('postgresql://postgres:pw@db.abc123.supabase.co:5432/postgres')).toBe('abc123');
    expect(projectRef('postgresql://postgres:pw@localhost:5432/postgres')).toBeNull();
    expect(projectRef('not a url')).toBeNull();
  });
});
