import { describe, expect, it } from 'vitest';
import { dateParam } from './dates';

describe('dateParam', () => {
  it('keeps a real date, refuses anything else', () => {
    expect(dateParam('2026-09-28')).toBe('2026-09-28');
    expect(dateParam('2028-02-29')).toBe('2028-02-29');
    expect(dateParam('2026-02-30')).toBeNull();
    expect(dateParam('2026-9-28')).toBeNull();
    expect(dateParam(['2026-09-28'])).toBeNull();
    expect(dateParam("2026-09-28' or 1=1")).toBeNull();
  });
});
