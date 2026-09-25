import 'server-only';
import { createClearview, readClearviewEnv, type Clearview } from '@hub/clearview';
import { createGmail, readGmailEnv, type Gmail } from '@hub/email';
import { db } from '../db';
import type { AccessDeps } from './service';
import { pgAccessStore } from './store';

// Built on first use and kept for the life of the server, so their token caches are
// shared. If a service is not configured, it degrades to a clear, audited outcome
// instead of crashing: a request answers "cannot check your number right now", and an
// email is recorded as not_configured. Nothing is sent anywhere unexpected.
let clearview: Pick<Clearview, 'lookupEmployee'> | undefined;
let gmail: Pick<Gmail, 'send'> | undefined;

function getClearview() {
  if (clearview) return clearview;
  try {
    clearview = createClearview(readClearviewEnv());
  } catch {
    return { lookupEmployee: async () => ({ status: 'unavailable', reason: 'not_configured' }) as const };
  }
  return clearview;
}

function getGmail() {
  if (gmail) return gmail;
  try {
    gmail = createGmail(readGmailEnv());
  } catch {
    return { send: async () => ({ sent: false, reason: 'not_configured' }) as const };
  }
  return gmail;
}

export function accessDeps(): AccessDeps {
  const base = (process.env.BETTER_AUTH_URL ?? '').replace(/\/$/, '');
  return {
    store: pgAccessStore(db()),
    clearview: getClearview(),
    send: (mail) => getGmail().send(mail),
    urls: { admin: `${base}/admin/access`, app: (path) => `${base}${path}` },
  };
}
