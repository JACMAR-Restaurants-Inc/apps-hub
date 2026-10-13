/**
 * Who may open a form's file: a sent one, whoever may read that submission's answers (by
 * its restaurant); a staged one, only its uploader. Everyone else gets "not found", the
 * same answer as a file that does not exist.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ who: 'hr@gmail.com' as string | null, scope: 'all' as 'all' | string[], row: null as unknown }));
const bucket = vi.hoisted(() => ({ get: vi.fn(async () => ({ bytes: new Uint8Array([1]), contentType: 'image/jpeg' })) }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/viewer', () => ({ getSignedInEmail: vi.fn(async () => (state.who ? { email: state.who, name: '' } : null)), getRoster: vi.fn(async () => ({})) }));
vi.mock('@/lib/forms/db', () => ({ formsDb: vi.fn(() => ({})) }));
vi.mock('@/lib/forms/files', () => ({ fileById: vi.fn(async () => state.row) }));
vi.mock('@/lib/forms/rules', async () => ({ ...(await vi.importActual<object>('@/lib/forms/rules')), responsesScope: vi.fn(() => state.scope) }));
vi.mock('@/lib/storage', async () => ({ ...(await vi.importActual<object>('@/lib/storage')), supabaseBucket: () => bucket }));

const { GET } = await import('./route');
const open = async (id = '5') => (await GET(new Request('http://x'), { params: Promise.resolve({ id }) } as never)).status;
const SENT = { id: 5, submissionId: 9, restaurantId: '1647', uploadedBy: 'marie@gmail.com', storagePath: 'supabase:1/5', fileName: 'carte.jpg', mimeType: 'image/jpeg' };

describe('/forms/files/[id]', () => {
  beforeEach(() => {
    state.who = 'hr@gmail.com';
    state.scope = 'all';
    state.row = SENT;
  });

  it('a sent file: HR, and a manager of its restaurant', async () => {
    expect(await open()).toBe(200);
    state.scope = ['1647'];
    expect(await open()).toBe(200);
  });

  it('a sent file: not a manager of another restaurant, not its sender, not without a session', async () => {
    state.scope = ['3472'];
    expect(await open()).toBe(404);
    state.who = 'marie@gmail.com';
    state.scope = [];
    expect(await open()).toBe(404);
    state.who = null;
    expect(await open()).toBe(404);
  });

  it('a staged file: only its uploader, not even HR', async () => {
    state.row = { ...SENT, submissionId: null, restaurantId: null };
    expect(await open()).toBe(404);
    state.who = 'marie@gmail.com';
    expect(await open()).toBe(200);
  });

  it('no such file, or an id that is not one', async () => {
    state.row = null;
    expect(await open()).toBe(404);
    expect(await open('../5')).toBe(404);
  });
});
