/**
 * Clearview Connect, the HR system: who an employee number belongs to.
 *
 * Ported from the ClearviewService Apps Script library (clearview-service-library):
 * the same token, endpoints and retry rules, but only the one lookup the portal needs.
 *
 * WHAT IS KEPT, AND WHAT IS NOT. Clearview returns a whole HR record: birth date,
 * address, phone, marital status, work permit. CLAUDE.md §3: never store or log SIN,
 * address or birth date. So toEmployee() picks four facts out by name and nothing else
 * leaves this file: the name, the HR email, whether they are active, and their store.
 * The raw record is never returned, logged or put in an error message.
 *
 * Three outcomes, told apart on purpose (RBAC §65): a number that matches nobody is
 * the person's to fix; Clearview being unreachable is not, and telling somebody whose
 * number is right to "check your number" sends them hunting for a fault that is not
 * theirs.
 */

// Not secrets: the Azure tenant, the API's app id and the base URL. The three values
// that are secrets come from the environment.
const TOKEN_URL = 'https://login.microsoftonline.com/fa1ec3ff-d62e-4cbd-8a57-fbad4a97ef2c/oauth2/v2.0/token';
const SCOPE = 'api://fb85d7ca-55bc-46a8-bcea-c3df4f3c510f/.default';
const BASE_URL = 'https://api.clearviewconnect.com';
const TOKEN_TTL_MS = 3_500_000; // the token lives 3599 s
const STORE_TTL_MS = 6 * 3_600_000; // only 7 stores exist

export interface ClearviewEnv {
  clientId: string;
  clientSecret: string;
  authKey: string;
}

export function readClearviewEnv(env: Record<string, string | undefined> = process.env): ClearviewEnv {
  const missing = ['CLEARVIEW_CLIENT_ID', 'CLEARVIEW_CLIENT_SECRET', 'CLEARVIEW_AUTH_KEY'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Clearview is not configured: ${missing.join(', ')} not set`);
  return { clientId: env.CLEARVIEW_CLIENT_ID!, clientSecret: env.CLEARVIEW_CLIENT_SECRET!, authKey: env.CLEARVIEW_AUTH_KEY! };
}

export interface Employee {
  number: string;
  fullName: string;
  /** The address HR has. Often NOT the one they sign in with (RBAC §4). */
  hrEmail: string | null;
  /** Clearview's status is "A" (active) or "I" (inactive). */
  active: boolean;
  /** The store number, e.g. "40455", or null if Clearview could not say. */
  storeNumber: string | null;
  /** "40455 - Du Plateau Blvd & Des Grives Blvd", the company's way of writing a store. */
  storeLabel: string | null;
}

export type Lookup =
  | { status: 'found'; employee: Employee }
  | { status: 'not_found' }
  /** Could not ask: network, auth, rate limit, an unexpected answer. `reason` is ours, never Clearview's body. */
  | { status: 'unavailable'; reason: string };

/** An employee number is digits only; they carry leading zeros, so it stays a string. */
export function cleanEmployeeNumber(raw: string): string | null {
  const n = raw.trim();
  return /^\d{1,12}$/.test(n) ? n : null;
}

type Json = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * Clearview's lastName often carries the employee number after it ("Doe 3791" for
 * employee 3791: a data-entry convention, clearview-api-response-shapes.md §6). It is
 * not part of the name, so it is dropped, but ONLY when it is exactly this person's
 * number (leading zeros aside): a surname is never cut on a guess.
 */
export function withoutNumber(lastName: string | null, employeeNumber: string): string | null {
  if (!lastName) return lastName;
  const m = /^(.*?)\s+(\d+)$/.exec(lastName);
  if (!m || Number(m[2]) !== Number(employeeNumber) || !Number.isFinite(Number(employeeNumber))) return lastName;
  return m[1]!.trim() || null;
}

/** The four facts, picked out by name. Pure. Nothing else in `raw` survives. */
export function toEmployee(number: string, raw: Json, store: Json | null): Employee | null {
  const s = raw.standardInformation;
  if (!s || typeof s !== 'object') return null;
  const info = s as Json;
  const employeeNumber = str(info.employeeNumber) ?? number;
  const fullName = [str(info.firstName), withoutNumber(str(info.lastName), employeeNumber)].filter(Boolean).join(' ');
  const storeNumber = store && store.storeNumber != null ? String(store.storeNumber) : null;
  return {
    number: employeeNumber,
    fullName,
    hrEmail: str(info.email)?.toLowerCase() ?? null,
    active: info.status === 'A',
    storeNumber,
    storeLabel: store ? (str(store.displayName) ?? str(store.name) ?? storeNumber) : null,
  };
}

export interface ClearviewDeps {
  fetch: typeof fetch;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

const defaultDeps: ClearviewDeps = {
  fetch: (...a) => fetch(...a),
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

class Unavailable extends Error {}

export function createClearview(env: ClearviewEnv, deps: ClearviewDeps = defaultDeps) {
  let token: { value: string; until: number } | null = null;
  const stores = new Map<string, { value: Json | null; until: number }>();

  async function getToken(force = false): Promise<string> {
    if (!force && token && token.until > deps.now()) return token.value;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.clientId,
      client_secret: env.clientSecret,
      scope: SCOPE,
    });
    const res = await deps.fetch(TOKEN_URL, { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    if (!res.ok) throw new Unavailable(`token_http_${res.status}`);
    const json = (await res.json()) as Json;
    if (typeof json.access_token !== 'string') throw new Unavailable('token_missing');
    token = { value: json.access_token, until: deps.now() + TOKEN_TTL_MS };
    return token.value;
  }

  /** GET with the library's retry ladder: 401 refresh once, 429 back off, network once. Null on 404. */
  async function get(path: string): Promise<Json | null> {
    const url = `${BASE_URL}${path}?authorizationKey=${encodeURIComponent(env.authKey)}`;
    let refreshed = false;
    let networkRetried = false;
    for (let attempt = 1; ; attempt++) {
      let res: Response;
      try {
        res = await deps.fetch(url, {
          headers: { authorization: `Bearer ${await getToken(refreshed)}`, accept: 'application/json' },
        });
      } catch (e) {
        if (e instanceof Unavailable) throw e;
        if (networkRetried) throw new Unavailable('network');
        networkRetried = true;
        await deps.sleep(2000);
        continue;
      }
      if (res.status === 404) return null;
      if (res.status === 401 && !refreshed) {
        refreshed = true;
        continue;
      }
      if (res.status === 429 && attempt < 3) {
        await deps.sleep(1000 * 2 ** (attempt - 1));
        continue;
      }
      if (!res.ok) throw new Unavailable(`http_${res.status}`);
      try {
        return (await res.json()) as Json;
      } catch {
        throw new Unavailable('bad_json');
      }
    }
  }

  async function getStore(storeId: string): Promise<Json | null> {
    const hit = stores.get(storeId);
    if (hit && hit.until > deps.now()) return hit.value;
    const value = await get(`/api/v2/store/${encodeURIComponent(storeId)}`);
    stores.set(storeId, { value, until: deps.now() + STORE_TTL_MS });
    return value;
  }

  return {
    async lookupEmployee(rawNumber: string): Promise<Lookup> {
      const number = cleanEmployeeNumber(rawNumber);
      if (!number) return { status: 'not_found' };
      try {
        const raw = await get(`/api/v2/employee/employeeNumber/${encodeURIComponent(number)}`);
        if (!raw) return { status: 'not_found' };
        const s = raw.standardInformation as Json | undefined;
        // A failed store lookup is not a failed employee lookup: the store is a
        // suggestion for the admin, the match is what matters.
        let store: Json | null = null;
        if (s?.reportingStoreId != null) {
          try {
            store = await getStore(String(s.reportingStoreId));
          } catch {
            store = null;
          }
        }
        const employee = toEmployee(number, raw, store);
        return employee ? { status: 'found', employee } : { status: 'unavailable', reason: 'unexpected_shape' };
      } catch (e) {
        return { status: 'unavailable', reason: e instanceof Unavailable ? e.message : 'error' };
      }
    },
  };
}

export type Clearview = ReturnType<typeof createClearview>;
