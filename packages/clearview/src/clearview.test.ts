import { describe, expect, it } from 'vitest';
import { cleanEmployeeNumber, createClearview, toEmployee, type ClearviewDeps } from './clearview';

const env = { clientId: 'id', clientSecret: 'secret', authKey: 'key' };

// A full record shaped like docs/clearview-api-response-shapes.md, sensitive fields included.
const record = {
  standardInformation: {
    firstName: 'Jane',
    lastName: 'Doe',
    employeeNumber: '0014',
    status: 'A',
    reportingStoreId: 32825,
    email: 'Jane.Doe@Example.com',
    birthDate: '2004-06-01',
    addressLine1: '1 Secret St',
    postalCode: 'J8Y 0A0',
    primaryPhoneNumber: '8195550123',
    maritalStatus: 'Single',
    workPermitNumber: 'WP123',
  },
  payAndBenefitInformation: { socialInsuranceNumber: '123456789', hourlyRate: 17.5 },
};
const store = { storeId: 32825, storeNumber: 40455, name: 'Du Plateau', displayName: '40455 - Du Plateau Blvd & Des Grives Blvd' };

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function fake(routes: { token?: Route; employee?: Route; store?: Route }) {
  const calls: string[] = [];
  const slept: number[] = [];
  let clock = 0;
  const deps: ClearviewDeps = {
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const kind = url.includes('login.microsoftonline.com') ? 'token' : url.includes('/employee/') ? 'employee' : 'store';
      calls.push(kind);
      const route = routes[kind] ?? (() => (kind === 'token' ? json({ access_token: 'tok' }) : json({}, 500)));
      return route(url, init);
    }) as typeof fetch,
    now: () => clock,
    sleep: async (ms) => void slept.push(ms),
  };
  return { cv: createClearview(env, deps), calls, slept, advance: (ms: number) => (clock += ms) };
}

describe('toEmployee: only four facts leave', () => {
  it('keeps name, HR email, active and store, and nothing sensitive', () => {
    const e = toEmployee('0014', record, store)!;
    expect(e).toEqual({
      number: '0014',
      fullName: 'Jane Doe',
      hrEmail: 'jane.doe@example.com',
      active: true,
      storeNumber: '40455',
      storeLabel: '40455 - Du Plateau Blvd & Des Grives Blvd',
    });
    const out = JSON.stringify(e);
    for (const secret of ['2004-06-01', 'Secret St', 'J8Y', '8195550123', 'Single', 'WP123', '123456789', '17.5']) {
      expect(out).not.toContain(secret);
    }
  });

  it('an inactive employee is found but not active; no store is not a failure', () => {
    const e = toEmployee('9', { standardInformation: { ...record.standardInformation, status: 'I' } }, null)!;
    expect(e.active).toBe(false);
    expect(e.storeNumber).toBeNull();
    expect(e.storeLabel).toBeNull();
  });

  it('refuses a shape it does not recognise', () => {
    expect(toEmployee('9', { something: 'else' }, null)).toBeNull();
  });
});

describe('cleanEmployeeNumber', () => {
  it('keeps leading zeros and refuses anything that is not digits', () => {
    expect(cleanEmployeeNumber(' 0014 ')).toBe('0014');
    expect(cleanEmployeeNumber('')).toBeNull();
    expect(cleanEmployeeNumber('12a')).toBeNull();
    expect(cleanEmployeeNumber('../store/1')).toBeNull();
  });
});

describe('lookupEmployee', () => {
  it('finds, with the store', async () => {
    const { cv } = fake({ employee: () => json(record), store: () => json(store) });
    const r = await cv.lookupEmployee('0014');
    expect(r).toMatchObject({ status: 'found', employee: { fullName: 'Jane Doe', storeNumber: '40455' } });
  });

  it('a 404 is not_found, and so is a number that is not a number (no call made)', async () => {
    const { cv, calls } = fake({ employee: () => json({}, 404) });
    expect(await cv.lookupEmployee('0014')).toEqual({ status: 'not_found' });
    const before = calls.length;
    expect(await cv.lookupEmployee('abc')).toEqual({ status: 'not_found' });
    expect(calls.length).toBe(before);
  });

  it('Clearview down is unavailable, not not_found', async () => {
    const { cv } = fake({ employee: () => json({}, 503) });
    expect(await cv.lookupEmployee('0014')).toEqual({ status: 'unavailable', reason: 'http_503' });
    const noToken = fake({ token: () => json({ error: 'bad' }, 401) });
    expect(await noToken.cv.lookupEmployee('0014')).toEqual({ status: 'unavailable', reason: 'token_http_401' });
  });

  it('a network failure is retried once, then unavailable', async () => {
    const { cv, slept } = fake({
      employee: () => {
        throw new TypeError('fetch failed');
      },
    });
    expect(await cv.lookupEmployee('0014')).toEqual({ status: 'unavailable', reason: 'network' });
    expect(slept).toEqual([2000]);
  });

  it('a 401 refreshes the token once', async () => {
    let n = 0;
    const { cv, calls } = fake({ employee: () => (n++ === 0 ? json({}, 401) : json(record)), store: () => json(store) });
    expect((await cv.lookupEmployee('0014')).status).toBe('found');
    expect(calls.filter((c) => c === 'token')).toHaveLength(2);
  });

  it('a 429 backs off and tries again', async () => {
    let n = 0;
    const { cv, slept } = fake({ employee: () => (n++ < 2 ? json({}, 429) : json(record)), store: () => json(store) });
    expect((await cv.lookupEmployee('0014')).status).toBe('found');
    expect(slept).toEqual([1000, 2000]);
  });

  it('a failed store lookup still finds the employee', async () => {
    const { cv } = fake({ employee: () => json(record), store: () => json({}, 500) });
    expect(await cv.lookupEmployee('0014')).toMatchObject({ status: 'found', employee: { storeNumber: null } });
  });

  it('reuses the token and the store until they expire', async () => {
    const { cv, calls, advance } = fake({ employee: () => json(record), store: () => json(store) });
    await cv.lookupEmployee('0014');
    await cv.lookupEmployee('0014');
    expect(calls).toEqual(['token', 'employee', 'store', 'employee']);
    advance(3_600_000);
    await cv.lookupEmployee('0014');
    expect(calls.slice(4)).toEqual(['token', 'employee']);
  });

  it('never puts Clearview’s own words in the reason', async () => {
    const { cv } = fake({ employee: () => new Response('employee 0014 Jane Doe SIN 123', { status: 500 }) });
    const r = await cv.lookupEmployee('0014');
    expect(JSON.stringify(r)).not.toMatch(/Jane|SIN|123/);
  });
});
