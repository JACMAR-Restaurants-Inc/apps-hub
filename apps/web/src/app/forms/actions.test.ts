/**
 * Every Forms action is a public endpoint (CLAUDE.md §3). HR's actions, called by someone
 * who may not edit forms or with no session, must answer 'denied' or 'expired' and never
 * reach the store. Submitting decides on the roster: with no session it is 'expired',
 * and the store's own refusal is audited as a denial.
 */

import { memberKey, type RosterSnapshot } from '@hub/rbac';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const access = vi.hoisted(() => ({ reason: 'role_not_granted' as string | null, signedIn: 'someone@gmail.com' as string | null }));
const store = vi.hoisted(() => ({
  createForm: vi.fn(),
  saveDraft: vi.fn(),
  publish: vi.fn(),
  share: vi.fn(),
  setStatus: vi.fn(),
  submit: vi.fn(),
  updateSettings: vi.fn(),
  duplicateForm: vi.fn(),
  getForm: vi.fn(async (): Promise<unknown> => null),
  publishedVersion: vi.fn(async (): Promise<unknown> => null),
}));
const files = vi.hoisted(() => ({
  ALLOWED_TYPES: ['image/jpeg', 'application/pdf'],
  MAX_BYTES: 100,
  MAX_STAGED_PER_DAY: 40,
  abandonedFiles: vi.fn(async () => []),
  fileById: vi.fn(async (): Promise<unknown> => null),
  setFilePath: vi.fn(),
  stageFile: vi.fn(async () => 5),
  stagedCount: vi.fn(async () => 0),
  unstageFile: vi.fn(async () => ({ ok: true, ref: 'supabase:1/5' })),
}));
const bucket = vi.hoisted(() => ({ put: vi.fn(async () => 'supabase:1/5'), get: vi.fn(), remove: vi.fn(async () => undefined) }));
const journal = vi.hoisted(() => vi.fn(async () => 'written'));

vi.mock('@/lib/access', async () => {
  const { AccessDenied } = await import('@/lib/authorize-core');
  return {
    AccessDenied,
    authorize: vi.fn(async (app: string, resource: string, action: string) => {
      expect([app, resource, action]).toEqual(['Forms', 'form', 'edit']);
      if (access.reason) throw new AccessDenied(access.reason);
      return { email: 'hr@example.invalid' };
    }),
  };
});
vi.mock('@/lib/forms/store', () => store);
vi.mock('@/lib/forms/files', () => files);
vi.mock('@/lib/storage', async () => ({ ...(await vi.importActual<object>('@/lib/storage')), supabaseBucket: () => bucket }));
vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/forms/db', () => ({ formsDb: vi.fn(() => ({})) }));
vi.mock('@/lib/forms/notify', () => ({ tellReached: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: vi.fn(() => ({})) }));
vi.mock('@/lib/people', () => ({ directoryPerson: vi.fn(async (email: string) => ({ email, fullName: 'Someone', employeeNumber: '0042' })) }));
vi.mock('@/lib/rate-limit', () => ({ allow: vi.fn(async () => ({ allowed: true, justTripped: false })), journalUnderLimit: journal }));
const roster: RosterSnapshot = {
  admins: new Set(['admin@example.invalid']),
  users: new Map([['someone@gmail.com', { active: true, role: 'manager', stores: new Set(['1647']) }]]),
  restaurants: new Map([['1647', { active: true }]]),
  members: new Map([[memberKey('SafeCount', 'someone@gmail.com'), { role: 'manager', status: 'active', stores: new Set(['1647']) }]]),
  permissions: new Map(),
};
vi.mock('@/lib/viewer', () => ({
  getSignedInEmail: vi.fn(async () => (access.signedIn ? { email: access.signedIn, name: '' } : null)),
  getRoster: vi.fn(async () => roster),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const actions = await import('./actions');

const hrCalls: [string, () => Promise<{ outcome: string }>][] = [
  ['createFormAction', () => actions.createFormAction('x')],
  ['saveDraftAction', () => actions.saveDraftAction(1, 'x', {})],
  ['publishAction', () => actions.publishAction(1, 'x')],
  ['shareAction', () => actions.shareAction(1, {}, { roles: ['manager'] })],
  ['setStatusAction', () => actions.setStatusAction(1, 'closed', 'x')],
  ['updateSettingsAction', () => actions.updateSettingsAction(1, {}, {})],
  ['duplicateFormAction', () => actions.duplicateFormAction(1, 'x')],
];

describe('HR’s Forms actions refuse anyone who may not edit forms', () => {
  beforeEach(() => {
    Object.values(store).forEach((f) => f.mockClear());
    journal.mockClear();
    access.signedIn = 'someone@gmail.com';
  });

  it('covers every action the file exports', () => {
    const exported = Object.keys(actions).filter((k) => k.endsWith('Action') && !['submitFormAction', 'uploadFormFileAction', 'removeFormFileAction'].includes(k));
    expect(exported.sort()).toEqual(hrCalls.map(([n]) => n).sort());
  });

  it.each(hrCalls)('%s: signed in without the right is denied and touches nothing', async (_, call) => {
    access.reason = 'role_not_granted';
    expect((await call()).outcome).toBe('denied');
    for (const f of Object.values(store)) expect(f).not.toHaveBeenCalled();
  });

  it.each(hrCalls)('%s: no session is expired and touches nothing', async (_, call) => {
    access.reason = 'not_signed_in';
    expect((await call()).outcome).toBe('expired');
    for (const f of Object.values(store)) expect(f).not.toHaveBeenCalled();
  });

  it('HR gets through to the store', async () => {
    access.reason = null;
    store.publish.mockResolvedValue({ outcome: 'done', version: 1 });
    expect(await actions.publishAction(1, 'x')).toEqual({ outcome: 'done', version: 1 });
  });
});

describe('submitting', () => {
  beforeEach(() => {
    store.submit.mockReset();
    journal.mockClear();
    access.signedIn = 'someone@gmail.com';
  });

  it('no session is expired and touches nothing', async () => {
    access.signedIn = null;
    expect(await actions.submitFormAction(1, 1, {}, 'x', '1647')).toEqual({ outcome: 'expired' });
    expect(store.submit).not.toHaveBeenCalled();
  });

  it('the person comes from the directory, and the decision from the roster and the form’s row', async () => {
    store.submit.mockImplementation(async (_db, person, _f, _v, _a, _s, decide) => {
      expect(person).toEqual({ email: 'someone@gmail.com', fullName: 'Someone', employeeNumber: '0042' });
      expect(decide('open', { roles: ['manager'], stores: [], people: [] })).toEqual({ restaurantId: '1647' });
      expect(decide('open', { roles: ['office'], stores: [], people: [] })).toBeNull();
      expect(decide('closed', { roles: ['manager'], stores: [], people: [] })).toBeNull();
      return { outcome: 'done', id: 7 };
    });
    expect(await actions.submitFormAction(1, 1, {}, 'x', '')).toEqual({ outcome: 'done', id: 7 });
  });

  it('a restaurant the person does not hold is refused, and the refusal is audited', async () => {
    store.submit.mockImplementation(async (_db, _p, _f, _v, _a, _s, decide) => (decide('open', { roles: ['manager'], stores: [], people: [] }) ? { outcome: 'done', id: 1 } : { outcome: 'denied' }));
    expect(await actions.submitFormAction(1, 1, {}, 'x', '3472')).toEqual({ outcome: 'denied' });
    expect(journal).toHaveBeenCalledWith(expect.anything(), 'denialAudit', expect.objectContaining({ actorEmail: 'someone@gmail.com', app: 'Forms', event: 'denied' }));
  });
});

describe('uploading a file', () => {
  const OPEN = { id: 1, status: 'open', currentVersion: 1, audience: { roles: ['manager'], stores: [], people: [] } };
  const DEF = { title: 'x', signature: false, fields: [{ id: 'cv', type: 'file', label: 'CV', required: false, sensitive: false }, { id: 'name', type: 'text', label: 'Nom', required: false, sensitive: false }] };
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const upload = (fieldId = 'cv', bytes: Uint8Array = JPEG) => {
    const data = new FormData();
    data.set('formId', '1');
    data.set('fieldId', fieldId);
    data.set('file', new File([bytes as BlobPart], 'carte.jpg', { type: 'image/jpeg' }));
    return actions.uploadFormFileAction(data);
  };
  const touchedNothing = () => {
    expect(files.stageFile).not.toHaveBeenCalled();
    expect(bucket.put).not.toHaveBeenCalled();
  };

  beforeEach(() => {
    access.signedIn = 'someone@gmail.com';
    files.stageFile.mockClear();
    files.unstageFile.mockClear();
    bucket.put.mockClear();
    bucket.remove.mockClear();
    store.getForm.mockImplementation(async () => OPEN);
    store.publishedVersion.mockImplementation(async () => DEF);
  });

  it('someone the form is shared with uploads to a file question, staged as theirs', async () => {
    expect(await upload()).toEqual({ outcome: 'done', file: { id: '5', fileName: 'carte.jpg' } });
    expect(files.stageFile).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ formId: 1, fieldId: 'cv', email: 'someone@gmail.com', mimeType: 'image/jpeg' }));
    expect(bucket.put).toHaveBeenCalledWith('1/5', expect.any(Uint8Array), 'image/jpeg');
  });

  it('no session, not shared, a closed form, not a file question, too big or not a photo or PDF: refused, nothing stored', async () => {
    access.signedIn = null;
    expect((await upload()).outcome).toBe('expired');
    access.signedIn = 'someone@gmail.com';
    store.getForm.mockImplementation(async () => ({ ...OPEN, audience: { roles: ['office'], stores: [], people: [] } }));
    expect((await upload()).outcome).toBe('denied');
    store.getForm.mockImplementation(async () => ({ ...OPEN, status: 'closed' }));
    expect((await upload()).outcome).toBe('not_open');
    store.getForm.mockImplementation(async () => OPEN);
    expect((await upload('name')).outcome).toBe('invalid');
    expect((await upload('cv', new Uint8Array(101).fill(0xff))).outcome).toBe('too_large');
    expect((await upload('cv', new TextEncoder().encode('<html><script>'))).outcome).toBe('type_not_allowed');
    touchedNothing();
  });

  it('removing: only the uploader, only while staged', async () => {
    files.fileById.mockImplementation(async () => ({ id: 5, uploadedBy: 'other@gmail.com', submissionId: null }));
    expect(await actions.removeFormFileAction('5')).toEqual({ outcome: 'not_found' });
    files.fileById.mockImplementation(async () => ({ id: 5, uploadedBy: 'someone@gmail.com', submissionId: 9 }));
    expect(await actions.removeFormFileAction('5')).toEqual({ outcome: 'not_found' });
    expect(files.unstageFile).not.toHaveBeenCalled();
    files.fileById.mockImplementation(async () => ({ id: 5, uploadedBy: 'someone@gmail.com', submissionId: null }));
    expect(await actions.removeFormFileAction('5')).toEqual({ outcome: 'done' });
    expect(bucket.remove).toHaveBeenCalledWith('supabase:1/5');
  });
});
