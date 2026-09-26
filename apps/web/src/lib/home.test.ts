import { describe, expect, it } from 'vitest';
import { fold, greetingPart, holdsNothing, homeSections, initials, pageCategories, prettyFirstName } from './home';

const day = (d: Date) => d.toISOString().slice(0, 10);
const since = new Date('2026-09-20T12:00:00Z');

describe('prettyFirstName (§54)', () => {
  it('only the first word, and only an all-capitals one is re-cased', () => {
    expect(prettyFirstName('SONY KARISA')).toBe('Sony');
    expect(prettyFirstName('MARIE-CLAUDE TREMBLAY')).toBe('Marie-Claude');
    expect(prettyFirstName("O'NEIL SMITH")).toBe("O'Neil");
    expect(prettyFirstName('ÉLODIE ROY')).toBe('Élodie');
    expect(prettyFirstName('McDonald Ronald')).toBe('McDonald');
    expect(prettyFirstName('')).toBe('');
    expect(prettyFirstName(null)).toBe('');
  });
});

describe('greetingPart', () => {
  it('morning before 12, afternoon before 18, then evening', () => {
    expect([0, 11, 12, 17, 18, 23].map(greetingPart)).toEqual(['morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening']);
  });
});

describe('homeSections', () => {
  const manager = (status?: 'pending' | 'active' | 'revoked', personActive = status === 'active') =>
    homeSections({ isAdmin: false, personActive, memberships: status ? [{ app: 'SafeCount', status, since }] : [], formatDay: day, env: {} });
  const find = (s: ReturnType<typeof homeSections>, key: string) => s.flatMap((x) => x.cards).find((c) => c.key === key);

  it('an admin sees all 18 cards and holds every one: never Request access', () => {
    const s = homeSections({ isAdmin: true, personActive: true, memberships: [], formatDay: day, env: {} });
    const cards = s.flatMap((x) => x.cards);
    expect(cards).toHaveLength(18);
    expect(cards.every((c) => c.state === 'held')).toBe(true);
  });

  it('a manager sees no admin-only card: 8 of ours and 2 other tools (§81)', () => {
    const s = manager('active');
    expect(s.map((x) => [x.kind, x.cards.length])).toEqual([
      ['internal', 8],
      ['external', 2],
    ]);
    expect(s.flatMap((x) => x.cards).some((c) => c.adminOnly)).toBe(false);
  });

  it('Cash Balancing: held, pending with the date, removed, or askable', () => {
    expect(find(manager('active'), 'SafeCount')!.state).toBe('held');
    expect(find(manager('pending'), 'SafeCount')).toMatchObject({ state: 'pending', askedAt: '2026-09-20' });
    expect(find(manager('revoked'), 'SafeCount')!.state).toBe('revoked');
    expect(find(manager(), 'SafeCount')!.state).toBe('askable');
    // An active row with the person switched off is not held.
    expect(find(manager('active', false), 'SafeCount')!.state).not.toBe('held');
  });

  it('open-to-all cards are held by everybody, with nothing granted', () => {
    expect(find(manager(), 'Fujitsu')!.state).toBe('held');
    expect(find(manager(), 'JreTracker')!.state).toBe('held');
  });

  it('orders held, then pending, then askable, alphabetical by French name (§82)', () => {
    const internal = manager('pending')[0]!.cards;
    const states = internal.map((c) => c.state);
    expect(states.indexOf('pending')).toBe(states.length - 1);
    const held = internal.filter((c) => c.state === 'held').map((c) => c.nameFr);
    expect(held).toEqual([...held].sort((a, b) => a.localeCompare(b, 'fr')));
  });

  it('a section says the office is told only where someone can ask', () => {
    expect(manager()[0]!.canAsk).toBe(true);
    expect(manager('active')[0]!.canAsk).toBe(false);
  });

  it('letter cards carry readable ink; logo cards carry none', () => {
    const s = homeSections({ isAdmin: true, personActive: true, memberships: [], formatDay: day, env: {} });
    expect(find(s, 'Fujitsu')).toMatchObject({ tint: '#166534', ink: '#FFFFFF' });
    expect(find(s, 'GitHub')).toMatchObject({ tint: null, ink: null, logo: 'github' });
  });
});

describe('holdsNothing (§66/§72)', () => {
  it('open-to-all cards do not count; a governed app held does; an admin never', () => {
    const none = homeSections({ isAdmin: false, personActive: false, memberships: [], formatDay: day, env: {} });
    expect(holdsNothing(false, none)).toBe(true);
    const held = homeSections({ isAdmin: false, personActive: true, memberships: [{ app: 'SafeCount', status: 'active', since }], formatDay: day, env: {} });
    expect(holdsNothing(false, held)).toBe(false);
    expect(holdsNothing(true, none)).toBe(false);
  });
});

describe('search and categories', () => {
  it('search text ignores accents and case, in both languages', () => {
    const s = homeSections({ isAdmin: true, personActive: true, memberships: [], formatDay: day, env: {} });
    const hay = s.flatMap((x) => x.cards).find((c) => c.key === 'Projects')!.hay;
    expect(hay).toContain(fold('Développement'));
    expect(hay).toContain('project management');
    expect(hay).toContain('gestion de projets');
  });

  it('only the categories on the page, in order, with counts', () => {
    const cats = pageCategories(homeSections({ isAdmin: false, personActive: true, memberships: [], formatDay: day, env: {} }));
    expect(cats.map((c) => c.key)).not.toContain('development');
    expect(cats.find((c) => c.key === 'request')!.count).toBe(3);
  });
});

describe('initials', () => {
  it('two letters from the name, or the address', () => {
    expect(initials('Sony Karisa', 's@x.com')).toBe('SK');
    expect(initials(null, 'sony@x.com')).toBe('S');
  });
});
