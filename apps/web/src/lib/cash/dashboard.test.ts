import { describe, expect, it } from 'vitest';
import { dashboard, weekBefore } from './dashboard';
import type { CountSummary } from './store';

const count = (restaurantId: string, countDate: string, countTime: string, varianceCents: number): CountSummary => ({
  id: Math.floor(Math.random() * 1e9),
  restaurantId,
  managerName: 'M',
  countDate,
  countTime,
  comments: null,
  tillsTotalCents: 0,
  coinsTotalCents: 0,
  paperTotalCents: 0,
  pettyCashTotalCents: 0,
  grandTotalCents: 460000 + varianceCents,
  expectedTotalCents: 460000,
  varianceCents,
  language: 'fr',
  pdfUrl: null,
});

describe('dashboard', () => {
  const stores = [
    { id: '3472', name: 'Aylmer' },
    { id: '40891', name: 'Vanier' },
    { id: '1647', name: 'Hull' },
  ];
  const week = [
    count('3472', '2026-09-22', '09:00', -500),
    count('3472', '2026-09-28', '08:00', -1000),
    count('3472', '2026-09-28', '16:00', 0),
    count('40891', '2026-09-28', '09:30', -250),
  ];
  const d = dashboard('2026-09-28', stores, week, new Map([['3472', 460000]]));

  it('counts today and this week', () => {
    expect(d.countsToday).toBe(3);
    expect(d.countsWeek).toBe(4);
  });

  it('judges each restaurant by its latest count today', () => {
    expect(d.stores[0]).toMatchObject({ countsToday: 2, last: { time: '16:00', varianceCents: 0 }, expectedCents: 460000 });
    expect(d.stores[1]!.last!.varianceCents).toBe(-250);
    expect(d.stores[2]).toMatchObject({ countsToday: 0, last: null, expectedCents: null });
    expect(d.short).toBe(1);
    expect(d.netCents).toBe(-250);
    expect(d.counted).toBe(2);
  });

  it('the week starts seven days back, across a month', () => {
    expect(weekBefore('2026-10-03')).toBe('2026-09-26');
    expect(weekBefore('2026-03-01')).toBe('2026-02-22');
  });
});
