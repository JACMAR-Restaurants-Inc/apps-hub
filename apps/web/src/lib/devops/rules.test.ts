import { describe, expect, it } from 'vitest';
import { cleanDate, cleanRepo, cleanText, cleanTitle, completion, countIssues, isOverdue, issueKey, matches, parseFilters, parseNumber, projectHue } from './rules';

describe('values from a browser', () => {
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

describe('issue numbers: #066, no prefix', () => {
  it('three digits at least, as the old app wrote them', () => {
    expect(issueKey(66)).toBe('#066');
    expect(issueKey(1234)).toBe('#1234');
  });
  it('read back from what someone typed, with or without # and zeros', () => {
    expect(parseNumber('66')).toBe(66);
    expect(parseNumber(' #066 ')).toBe(66);
    expect(parseNumber('0')).toBeNull();
    expect(parseNumber('CHK-066')).toBeNull();
    expect(parseNumber('6 6')).toBeNull();
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
    expect(matches(issue, f({ q: '#066' }))).toBe(true);
    expect(matches(issue, f({ q: '66' }))).toBe(true);
    expect(matches(issue, f({ q: 'badge' }))).toBe(true);
    expect(matches(issue, f({ q: 'hull' }))).toBe(true);
    expect(matches(issue, f({ q: 'vanier' }))).toBe(false);
  });

  it('type, priority and assignee narrow; unknown values are no filter', () => {
    expect(matches(issue, f({ type: 'feature' }))).toBe(false);
    expect(matches(issue, f({ type: 'nonsense' }))).toBe(true);
    expect(matches(issue, f({ priority: 'high' }))).toBe(true);
    expect(matches(issue, f({ assignee: 'Sony@Jacmar-Restaurants.com' }))).toBe(true);
    expect(matches(issue, f({ assignee: 'none' }))).toBe(false);
    expect(matches({ ...issue, assigneeEmail: null }, f({ assignee: 'none' }))).toBe(true);
    expect(matches({ ...issue, assigneeEmail: null, assigneeText: 'Teammate A' }, f({ assignee: 'none' }))).toBe(false);
  });
});

describe('project colours', () => {
  it('neighbouring projects get clearly different colours', () => {
    for (let id = 1; id < 200; id++) {
      const gap = Math.abs(projectHue(id) - projectHue(id + 1));
      expect(Math.min(gap, 360 - gap)).toBeGreaterThan(90);
    }
    expect(projectHue(12)).toBe(projectHue(12));
  });
});
