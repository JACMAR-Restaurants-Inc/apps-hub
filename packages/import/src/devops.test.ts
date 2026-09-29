import { describe, expect, it } from 'vitest';
import type { Cell } from './cells';
import { matchAdmin, transformDevops } from './devops';
import type { Workbook } from './workbook';

// The xlsx reader returns Toronto wall-clock readings in a Date's UTC fields.
const wall = (iso: string) => new Date(`${iso}T00:00:00Z`);
const rows = (...list: Record<string, Cell>[]) => list.map((cells, i) => ({ row: i + 2, cells }));

const issue = (over: Record<string, Cell> = {}): Record<string, Cell> => ({
  ID: 'CHK-001',
  Title: 'Badge reader',
  Type: 'Bug',
  Status: 'Active',
  Priority: 'High',
  Assignee: 'Sony',
  'Requested By': 'HR',
  Description: 'Line one\nline two',
  Created: wall('2026-06-22'),
  'Due Date': wall('2026-07-01'),
  Notes: 'Called the vendor',
  ...over,
});

function wb(issues: Record<string, Cell>[], over: Partial<Workbook> = {}): Workbook {
  return {
    Config: rows(
      { Name: 'Check-In System', 'Tab Name': 'Check-In System', Prefix: 'CHK', 'GitHub Repo': 'https://github.com/JACMAR-Restaurants-Inc/checkin/' },
      // The enum lists share the tab, in rows with no project.
      { Name: null, 'Tab Name': null, Prefix: null, 'GitHub Repo': null, Status: 'New' },
    ),
    'Check-In System': rows(...issues),
    Dashboard: rows({ Total: 12 }),
    ...over,
  };
}

describe('JM DevOps import: the sheet to projects and issues', () => {
  it('reads a project and its issues, keeping every number', () => {
    const { projects, problems } = transformDevops(wb([issue(), issue({ ID: 'chk-066', Status: 'completed', Assignee: 'Unassigned', Notes: null, 'Due Date': null })]));
    expect(problems).toEqual([]);
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ name: 'Check-In System', prefix: 'CHK', githubRepo: 'https://github.com/JACMAR-Restaurants-Inc/checkin' });
    expect(projects[0]!.issues[0]).toEqual({
      number: 1,
      title: 'Badge reader',
      type: 'bug',
      status: 'active',
      priority: 'high',
      assigneeText: 'Sony',
      description: 'Line one\nline two',
      createdOn: '2026-06-22',
      dueDate: '2026-07-01',
      notes: 'Called the vendor',
    });
    expect(projects[0]!.issues[1]).toMatchObject({ number: 66, status: 'completed', assigneeText: null, dueDate: null, notes: null });
  });

  it('a date is the day the sheet shows, never shifted through UTC', () => {
    // Midnight in Toronto: the old API's toISOString() showed this as the 21st.
    const { projects } = transformDevops(wb([issue({ Created: wall('2026-06-22'), 'Due Date': '2026-07-01' })]));
    expect(projects[0]!.issues[0]).toMatchObject({ createdOn: '2026-06-22', dueDate: '2026-07-01' });
  });

  it('finds columns by header, whatever the spelling, and names what it found when one is missing', () => {
    const renamed = wb([{ id: 'CHK-001', title: 'x', type: 'Task', status: 'New', priority: 'Low', requestedby: null, createddate: wall('2026-06-22') }]);
    expect(transformDevops(renamed).problems).toEqual([]);
    const noStatus = wb([{ ID: 'CHK-001', Title: 'x', Type: 'Task', Priority: 'Low', Created: wall('2026-06-22') }]);
    const p = transformDevops(noStatus).problems;
    expect(p).toHaveLength(1);
    expect(p[0]!.message).toContain('no "status" column');
    expect(p[0]!.message).toContain('Priority');
  });

  it('refuses what it cannot place exactly, and writes nothing', () => {
    const bad = transformDevops(
      wb([
        issue({ ID: 'CHK-001' }),
        issue({ ID: 'CHK-001', Title: 'twice' }),
        issue({ ID: 'JRE-002' }),
        issue({ ID: null, Title: 'never stamped' }),
        issue({ ID: 'CHK-005', Status: 'Done' }),
        issue({ ID: 'CHK-006', Type: '' }),
        issue({ ID: 'CHK-007', Created: 'last week' }),
      ]),
    ).problems.map((p) => [p.row, p.column, p.message]);
    expect(bad).toEqual([
      [3, 'ID', 'ID used twice'],
      [4, 'ID', 'not CHK-<number>'],
      [5, 'ID', 'blank: the sheet never gave this row an ID'],
      [6, 'Status', 'not one of the known values'],
      [7, 'Type', 'blank'],
      [8, 'Created', 'expected a date'],
    ]);
  });

  it('skips blank rows: the old delete cleared a row rather than removing it', () => {
    const { projects, problems } = transformDevops(wb([issue(), { ID: null, Title: null, Type: null, Status: null, Priority: null, Created: null }, issue({ ID: 'CHK-003' })]));
    expect(problems).toEqual([]);
    expect(projects[0]!.issues.map((i) => i.number)).toEqual([1, 3]);
  });

  it('finds a tab whose long name the download cut to 31 characters, and only that cut', () => {
    const long = 'ClearviewService Library Refactor';
    const w = wb([issue()]);
    w.Config!.push({ row: 4, cells: { Name: long, 'Tab Name': long, Prefix: 'CSLR', 'GitHub Repo': null } });
    w[long.slice(0, 31)] = rows(issue({ ID: 'CSLR-001' }));
    const out = transformDevops(w);
    expect(out.problems).toEqual([]);
    expect(out.projects.map((p) => [p.prefix, p.issues.length])).toEqual([
      ['CHK', 1],
      ['CSLR', 1],
    ]);
    delete w[long.slice(0, 31)];
    w[long.slice(0, 20)] = rows(issue({ ID: 'CSLR-001' }));
    expect(transformDevops(w).problems.map((p) => p.message)).toEqual(['no tab with that name']);
  });

  it('a Config row must point at a real tab with a valid, unique prefix', () => {
    const w = wb([issue()]);
    w.Config!.push({ row: 4, cells: { Name: 'Ghost', 'Tab Name': 'Ghost', Prefix: 'CHK', 'GitHub Repo': 'javascript:alert(1)' } });
    expect(transformDevops(w).problems.map((p) => p.message)).toEqual(['prefix used twice', 'not a https://github.com/ link', 'no tab with that name']);
  });
});

describe('matching an assignee to an admin', () => {
  const admins = [
    { email: 'sony@jacmar-restaurants.com', fullName: 'Sony Karisa' },
    { email: 'pierrej@jacmar-restaurants.com', fullName: 'Pierre Jacoub' },
  ];
  it('exactly one admin by first or full name, whatever the case or accents', () => {
    expect(matchAdmin('Sony', admins)).toBe('sony@jacmar-restaurants.com');
    expect(matchAdmin('pierre jacoub', admins)).toBe('pierrej@jacmar-restaurants.com');
  });
  it('anything else keeps its text: never guessed', () => {
    expect(matchAdmin('Teammate A', admins)).toBeNull();
    expect(matchAdmin('HR', admins)).toBeNull();
    expect(matchAdmin('So', admins)).toBeNull();
    expect(matchAdmin('Pierre', [...admins, { email: 'pierre2@example.invalid', fullName: 'Pierre Autre' }])).toBeNull();
    expect(matchAdmin(null, admins)).toBeNull();
  });
});
