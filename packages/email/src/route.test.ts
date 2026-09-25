import { describe, expect, it } from 'vitest';
import { allowlistFrom, emailModeFrom, routeEmail } from './route';

const INBOX = 'sony@jacmar-restaurants.com';
const report = {
  to: ['accountant@example.com'],
  cc: ['hull@example.com'],
  subject: 'Rapport de comptage – 1647 Hull',
};

describe('routeEmail', () => {
  it('in test mode, everything goes to the test inbox and says who it was for', () => {
    const [routed, ...rest] = routeEmail(report, 'test', INBOX);
    expect(rest).toEqual([]);
    expect(routed!.to).toEqual([INBOX]);
    expect(routed!.cc).toEqual([]); // a cc would leak to a real person
    expect(routed!.subject).toBe('[TEST → accountant@example.com, hull@example.com] Rapport de comptage – 1647 Hull');
    expect(routed!.redirected).toBe(true);
  });

  it('in live mode, it goes where the data says', () => {
    expect(routeEmail(report, 'live', INBOX, new Set())).toEqual([
      { to: ['accountant@example.com'], cc: ['hull@example.com'], subject: report.subject, redirected: false },
    ]);
  });

  it('test mode with no inbox refuses rather than sending anywhere', () => {
    expect(() => routeEmail(report, 'test', undefined)).toThrow(/EMAIL_TEST_INBOX/);
  });
});

describe('the test allowlist: designated testers get their email directly', () => {
  const testers = allowlistFrom('Tester.One@gmail.com, pierrej@jacmar-restaurants.com\n  office@jacmar-restaurants.com');

  it('a tester gets it as written, no [TEST] tag, and the test inbox gets nothing', () => {
    expect(routeEmail({ to: ['testerone@gmail.com'], subject: 'Vous avez accès' }, 'test', INBOX, testers)).toEqual([
      { to: ['testerone@gmail.com'], cc: [], subject: 'Vous avez accès', redirected: false },
    ]);
  });

  it('a stranger is still redirected: a real manager in staging is never emailed', () => {
    expect(routeEmail({ to: ['realmanager@gmail.com'], subject: 'S' }, 'test', INBOX, testers)).toEqual([
      { to: [INBOX], cc: [], subject: '[TEST → realmanager@gmail.com] S', redirected: true },
    ]);
  });

  it('a mixed list splits: testers as written, the rest to the test inbox, and no cc leaks', () => {
    const routed = routeEmail(
      { to: ['pierrej@jacmar-restaurants.com', 'boss@elsewhere.com'], cc: ['office@jacmar-restaurants.com', 'hull@example.com'], subject: 'S' },
      'test',
      INBOX,
      testers,
    );
    expect(routed).toEqual([
      { to: ['pierrej@jacmar-restaurants.com'], cc: ['office@jacmar-restaurants.com'], subject: 'S', redirected: false },
      { to: [INBOX], cc: [], subject: '[TEST → boss@elsewhere.com, hull@example.com] S', redirected: true },
    ]);
  });

  it('a tester only in cc still gets it, as the recipient', () => {
    expect(routeEmail({ to: ['x@y.com'], cc: ['office@jacmar-restaurants.com'], subject: 'S' }, 'test', INBOX, testers)[0]).toEqual({
      to: ['office@jacmar-restaurants.com'],
      cc: [],
      subject: 'S',
      redirected: false,
    });
  });

  it('matches however the address is typed, Gmail dots included', () => {
    expect(allowlistFrom(' A.B@Gmail.com ;c@d.com,, x ')).toEqual(new Set(['ab@gmail.com', 'c@d.com']));
    expect(routeEmail({ to: ['a.b@gmail.com'], subject: 'S' }, 'test', INBOX, allowlistFrom('ab@gmail.com'))[0]!.redirected).toBe(false);
  });

  it('with only testers, no test inbox is needed; with a stranger, it still refuses without one', () => {
    expect(routeEmail({ to: ['testerone@gmail.com'], subject: 'S' }, 'test', undefined, testers)).toHaveLength(1);
    expect(() => routeEmail({ to: ['stranger@x.com'], subject: 'S' }, 'test', undefined, testers)).toThrow(/EMAIL_TEST_INBOX/);
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
