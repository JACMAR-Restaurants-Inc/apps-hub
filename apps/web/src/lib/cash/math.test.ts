import { describe, expect, it } from 'vitest';
import { computeCount, parseCountInput, type CountInput } from './math';

const TILLS = [
  { tillNumber: 1, tillLabel: 'Caisse 1', baseAmountCents: 20000 },
  { tillNumber: 2, tillLabel: 'Caisse 2', baseAmountCents: 20000 },
];
const CONFIG = { tills: TILLS, expectedTotalCents: 460000 };

const input = (over: Partial<CountInput> = {}): CountInput => ({
  restaurantId: '3472',
  comments: '',
  tills: [
    { tillNumber: 1, countedCents: 20000, fixed: false },
    { tillNumber: 2, countedCents: 20000, fixed: false },
  ],
  coins: [],
  paper: [],
  pettyCash: [],
  sendToAccountant: false,
  attachmentIds: [],
  ...over,
});

const ok = (r: ReturnType<typeof computeCount>) => {
  if (!r.ok) throw new Error(r.error);
  return r.count;
};

describe('computeCount: the totals', () => {
  it('adds tills, coins by rolls and loose, bills and petty cash, in cents', () => {
    const c = ok(
      computeCount(
        input({
          coins: [
            { cents: 5, rolls: 1, loose: 3 }, // 2.00 + 0.15
            { cents: 25, rolls: 2, loose: 1 }, // 20.00 + 0.25
            { cents: 200, rolls: 0, loose: 4 }, // 8.00
          ],
          paper: [
            { cents: 2000, count: 10 }, // 200
            { cents: 10000, count: 3 }, // 300
          ],
          pettyCash: [{ description: 'Sel', amountCents: 1249 }],
        }),
        CONFIG,
      ),
    );
    expect(c.tillsTotalCents).toBe(40000);
    expect(c.coinsTotalCents).toBe(215 + 2025 + 800);
    expect(c.paperTotalCents).toBe(50000);
    expect(c.pettyCashTotalCents).toBe(1249);
    expect(c.grandTotalCents).toBe(40000 + 3040 + 50000 + 1249);
    expect(c.varianceCents).toBe(c.grandTotalCents - 460000);
  });

  it('takes the expected total from the configuration only', () => {
    const c = ok(computeCount(input(), { tills: TILLS, expectedTotalCents: 40000 }));
    expect(c.expectedTotalCents).toBe(40000);
    expect(c.varianceCents).toBe(0);
  });

  it('writes a row for every coin and bill, zero where nothing was counted', () => {
    const c = ok(computeCount(input({ coins: [{ cents: 100, rolls: 1, loose: 0 }] }), CONFIG));
    expect(c.coins.map((x) => x.denominationCents)).toEqual([5, 10, 25, 100, 200]);
    expect(c.coins.find((x) => x.denominationCents === 100)!.totalCents).toBe(2500);
    expect(c.paper.map((x) => [x.denominationCents, x.totalCents])).toEqual([
      [500, 0],
      [1000, 0],
      [2000, 0],
      [5000, 0],
      [10000, 0],
    ]);
  });

  it('ignores empty petty cash rows, keeps a receipt with no words as unknown', () => {
    const c = ok(
      computeCount(
        input({
          pettyCash: [
            { description: '  ', amountCents: 0 },
            { description: '', amountCents: 500 },
            { description: ' Lait ', amountCents: 300 },
          ],
        }),
        CONFIG,
      ),
    );
    expect(c.pettyCash).toEqual([
      { description: null, amountCents: 500 },
      { description: 'Lait', amountCents: 300 },
    ]);
  });
});

describe('computeCount: tills and fixes', () => {
  it('uses the configured base and label, not anything sent', () => {
    const c = ok(computeCount(input({ tills: [{ tillNumber: 2, countedCents: 19500, fixed: false }, { tillNumber: 1, countedCents: 20100, fixed: false }] }), CONFIG));
    expect(c.tills.map((t) => [t.tillNumber, t.tillLabel, t.baseAmountCents, t.varianceCents, t.wasShort])).toEqual([
      [1, 'Caisse 1', 20000, 100, false],
      [2, 'Caisse 2', 20000, -500, true],
    ]);
  });

  it('a fixed short takes from intake; a fixed over gives to it; the delta keeps the sign', () => {
    const c = ok(
      computeCount(
        input({
          tills: [
            { tillNumber: 1, countedCents: 19500, fixed: true },
            { tillNumber: 2, countedCents: 20250, fixed: true },
          ],
        }),
        CONFIG,
      ),
    );
    expect(c.tills[0]).toMatchObject({ wasShort: true, wasFixed: true, fixAmountFromIntakeCents: 500 });
    expect(c.tills[1]).toMatchObject({ wasShort: false, wasFixed: true, fixAmountFromIntakeCents: 0 });
    expect(c.fixes).toEqual([
      { tillNumber: 1, shortageAmountCents: 500, intakeDeltaCents: -500 },
      { tillNumber: 2, shortageAmountCents: 0, intakeDeltaCents: 250 },
    ]);
  });

  it('a till with nothing to fix is never fixed', () => {
    const c = ok(computeCount(input({ tills: [{ tillNumber: 1, countedCents: 20000, fixed: true }, { tillNumber: 2, countedCents: 20000, fixed: false }] }), CONFIG));
    expect(c.tills[0]!.wasFixed).toBe(false);
    expect(c.fixes).toEqual([]);
  });

  it('refuses a till left out, repeated, or not configured', () => {
    const one = { tillNumber: 1, countedCents: 20000, fixed: false };
    expect(computeCount(input({ tills: [one] }), CONFIG)).toEqual({ ok: false, error: 'tills_mismatch' });
    expect(computeCount(input({ tills: [one, one] }), CONFIG)).toEqual({ ok: false, error: 'tills_mismatch' });
    expect(computeCount(input({ tills: [one, { ...one, tillNumber: 9 }] }), CONFIG)).toEqual({ ok: false, error: 'tills_mismatch' });
  });
});

describe('computeCount: refuses what cannot be counted', () => {
  it.each([
    ['a negative till', { tills: [{ tillNumber: 1, countedCents: -1, fixed: false }, { tillNumber: 2, countedCents: 0, fixed: false }] }],
    ['a fractional cent', { tills: [{ tillNumber: 1, countedCents: 10.5, fixed: false }, { tillNumber: 2, countedCents: 0, fixed: false }] }],
    ['a fractional roll', { coins: [{ cents: 5, rolls: 1.5, loose: 0 }] }],
    ['a negative bill count', { paper: [{ cents: 500, count: -2 }] }],
    ['a number as text', { paper: [{ cents: 500, count: '2' as unknown as number }] }],
    ['a negative receipt', { pettyCash: [{ description: 'x', amountCents: -100 }] }],
  ])('%s', (_, over) => {
    expect(computeCount(input(over as Partial<CountInput>), CONFIG)).toEqual({ ok: false, error: 'bad_number' });
  });

  it('a coin or bill that does not exist, or one sent twice', () => {
    expect(computeCount(input({ coins: [{ cents: 1, rolls: 0, loose: 5 }] }), CONFIG)).toEqual({ ok: false, error: 'bad_denomination' });
    expect(computeCount(input({ paper: [{ cents: 2500, count: 1 }] }), CONFIG)).toEqual({ ok: false, error: 'bad_denomination' });
    expect(computeCount(input({ paper: [{ cents: 500, count: 1 }, { cents: 500, count: 1 }] }), CONFIG)).toEqual({ ok: false, error: 'bad_denomination' });
  });

  it('text too long, too many receipts', () => {
    expect(computeCount(input({ comments: 'x'.repeat(2001) }), CONFIG)).toEqual({ ok: false, error: 'too_long' });
    expect(computeCount(input({ pettyCash: [{ description: 'x'.repeat(201), amountCents: 1 }] }), CONFIG)).toEqual({ ok: false, error: 'too_long' });
    const many = Array.from({ length: 51 }, () => ({ description: 'x', amountCents: 1 }));
    expect(computeCount(input({ pettyCash: many }), CONFIG)).toEqual({ ok: false, error: 'too_many_lines' });
  });
});

describe('parseCountInput', () => {
  const good = {
    restaurantId: '3472',
    comments: '',
    tills: [{ tillNumber: 1, countedCents: 100, fixed: false }],
    coins: [{ cents: 5, rolls: 0, loose: 1 }],
    paper: [{ cents: 500, count: 1 }],
    pettyCash: [{ description: 'x', amountCents: 1 }],
    sendToAccountant: false,
    attachmentIds: [],
  };

  it('keeps exactly the fields of a count, nothing else', () => {
    expect(parseCountInput({ ...good, expectedTotalCents: 0, countDate: '2020-01-01' })).toEqual(good);
  });

  it.each([
    ['nothing', null],
    ['a string', 'count'],
    ['no restaurant', { ...good, restaurantId: '' }],
    ['tills not a list', { ...good, tills: {} }],
    ['a till that is not an object', { ...good, tills: [1] }],
    ['fixed not a boolean', { ...good, tills: [{ tillNumber: 1, countedCents: 1, fixed: 'yes' }] }],
    ['a receipt with no words field', { ...good, pettyCash: [{ amountCents: 1 }] }],
    ['send to accountant as text', { ...good, sendToAccountant: 'true' }],
    ['too many coins', { ...good, coins: Array(6).fill(good.coins[0]) }],
    ['attachments not a list', { ...good, attachmentIds: 3 }],
  ])('refuses %s', (_, raw) => {
    expect(parseCountInput(raw)).toBeNull();
  });
});
