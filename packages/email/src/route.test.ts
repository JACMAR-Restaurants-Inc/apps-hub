import { describe, expect, it } from 'vitest';
import { emailModeFrom, routeEmail } from './route';

const INBOX = 'sony@jacmar-restaurants.com';
const report = {
  to: ['accountant@example.com'],
  cc: ['hull@example.com'],
  subject: 'Rapport de comptage – 1647 Hull',
};

describe('routeEmail', () => {
  it('in test mode, everything goes to the test inbox and says who it was for', () => {
    const routed = routeEmail(report, 'test', INBOX);
    expect(routed.to).toEqual([INBOX]);
    expect(routed.cc).toEqual([]); // a cc would leak to a real person
    expect(routed.subject).toBe('[TEST → accountant@example.com, hull@example.com] Rapport de comptage – 1647 Hull');
    expect(routed.redirected).toBe(true);
  });

  it('in live mode, it goes where the data says', () => {
    const routed = routeEmail(report, 'live', INBOX);
    expect(routed.to).toEqual(['accountant@example.com']);
    expect(routed.cc).toEqual(['hull@example.com']);
    expect(routed.redirected).toBe(false);
  });

  it('test mode with no inbox refuses rather than sending anywhere', () => {
    expect(() => routeEmail(report, 'test', undefined)).toThrow(/EMAIL_TEST_INBOX/);
  });
});

describe('emailModeFrom', () => {
  it('only the exact word "live" sends to real people', () => {
    expect(emailModeFrom('live')).toBe('live');
    expect(emailModeFrom(undefined)).toBe('test');
    expect(emailModeFrom('')).toBe('test');
    expect(emailModeFrom('Live')).toBe('test');
    expect(emailModeFrom('production')).toBe('test');
  });
});
