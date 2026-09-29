import { describe, expect, it } from 'vitest';
import { cleanDate, cleanPrefix, cleanRepo, cleanText, cleanTitle, completion, countIssues, isOverdue, issueKey, matches, parseFilters, parseKey, projectHue } from './rules';

describe('values from a browser', () => {
  it('a prefix is 2 to 6 letters, upper cased', () => {
    expect(cleanPrefix(' chk ')).toBe('CHK');
    expect(cleanPrefix('CSLR')).toBe('CSLR');
    expect(cleanPrefix('C')).toBeNull();
    expect(cleanPrefix('ABCDEFG')).toBeNull();
    expect(cleanPrefix('CH1')).toBeNull();
    expect(cleanPrefix('ÉTÉ')).toBeNull();
  });

  it('a title is required, one line, and bounded', () => {
    expect(cleanTitle('  Fix\nthe   login ')).toBe('Fix the login');
    expect(cleanTitle('   ')).toBeNull();
    expect(cleanTitle('x'.repeat(201))).toBeNull();
    expect(cleanTitle(42)).toBeNull();
  });

  it('long text keeps its lines and loses control characters', () => {
    expect(cleanText('a\r\nb\u0007c', 100, true)).toBe('a\nbc');
    expect(cleanText('a\nb', 100)).toBe('a b');
  });

  it('a GitHub link is https://github.com/ or nothing', () => {
    expect(cleanRepo('')).toBe('');
    expect(cleanRepo('https://github.com/JACMAR-Restaurants-Inc/apps-hub/')).toBe('https://github.com/JACMAR-Restaurants-Inc/apps-hub');
    expect(cleanRepo('javascript:alert(1)')).toBeNull();
    expect(cleanRepo('https://github.com.evil.example/x')).toBeNull();
    expect(cleanRepo('http://github.com/x')).toBeNull();
  });

  it('a date must exist', () => {
    expect(cleanDate('2026-10-08')).toBe('2026-10-08');
    expect(cleanDate('')).toBe('');
    expect(cleanDate('2026-02-30')).toBeNull();
    expect(cleanDate('08/10/2026')).toBeNull();
  });
});

describe('issue keys', () => {
  it('three digits at least, as the old app wrote them', () => {
    expect(issueKey('CHK', 66)).toBe('CHK-066');
    expect(issueKey('CHK', 1234)).toBe('CHK-1234');
  });
  it('read back whatever the case and padding', () => {
    expect(parseKey('chk-66')).toEqual({ prefix: 'CHK', number: 66 });
    expect(parseKey('CHK-000')).toBeNull();
    expect(parseKey('CHK66')).toBeNull();
  });
});

describe('overdue and counts, against the SERVER’s Toronto date', () => {
  const today = '2026-09-29';
  it('overdue is open and due before today; due today is not overdue', () => {
    expect(isOverdue({ dueDate: '2026-09-28', status: 'active' }, today)).toBe(true);
    expect(isOverdue({ dueDate: '2026-09-28', status: 'new' }, today)).toBe(true);
    expect(isOverdue({ dueDate: '2026-09-29', status: 'active' }, today)).toBe(false);
    expect(isOverdue({ dueDate: '2026-09-28', status: 'completed' }, today)).toBe(false);
    expect(isOverdue({ dueDate: '2026-09-28', status: 'cancelled' }, today)).toBe(false);
    expect(isOverdue({ dueDate: null, status: 'active' }, today)).toBe(false);
  });

  it('completion leaves cancelled issues out of both sides', () => {
    const c = countIssues(
      [
        { status: 'completed', dueDate: null },
        { status: 'completed', dueDate: null },
        { status: 'active', dueDate: '2026-01-01' },
        { status: 'cancelled', dueDate: '2026-01-01' },
      ],
      today,
    );
    expect(c).toEqual({ total: 4, new: 0, active: 1, completed: 2, cancelled: 1, overdue: 1 });
    expect(completion(c)).toBe(67);
    expect(completion(countIssues([], today))).toBe(0);
  });
});

describe('filters', () => {
  const issue = {
    number: 66,
    title: 'Badge reader',
    description: 'The kiosk at Hull',
    type: 'bug' as const,
    priority: 'high' as const,
    assigneeEmail: 'sony@jacmar-restaurants.com',
    assigneeText: null,
  };
  const f = (p: Record<string, string>) => parseFilters(p);

  it('search finds the key, the title and the description', () => {
    expect(matches(issue, 'CHK', f({ q: 'chk-066' }))).toBe(true);
    expect(matches(issue, 'CHK', f({ q: 'badge' }))).toBe(true);
    expect(matches(issue, 'CHK', f({ q: 'hull' }))).toBe(true);
    expect(matches(issue, 'CHK', f({ q: 'vanier' }))).toBe(false);
  });

  it('type, priority and assignee narrow; unknown values are no filter', () => {
    expect(matches(issue, 'CHK', f({ type: 'feature' }))).toBe(false);
    expect(matches(issue, 'CHK', f({ type: 'nonsense' }))).toBe(true);
    expect(matches(issue, 'CHK', f({ priority: 'high' }))).toBe(true);
    expect(matches(issue, 'CHK', f({ assignee: 'Sony@Jacmar-Restaurants.com' }))).toBe(true);
    expect(matches(issue, 'CHK', f({ assignee: 'none' }))).toBe(false);
    expect(matches({ ...issue, assigneeEmail: null }, 'CHK', f({ assignee: 'none' }))).toBe(true);
    expect(matches({ ...issue, assigneeEmail: null, assigneeText: 'Teammate A' }, 'CHK', f({ assignee: 'none' }))).toBe(false);
  });
});

describe('project colours', () => {
  it('the old app’s hash, so each project keeps its colour', () => {
    // colors.ts: h = h * 33 + c, from 5381, unsigned 32 bit, mod 360.
    let h = 5381;
    for (const c of 'CHK') h = (h * 33 + c.charCodeAt(0)) >>> 0;
    expect(projectHue('CHK')).toBe(h % 360);
    expect(projectHue('CHK')).not.toBe(projectHue('JRE'));
  });
});
