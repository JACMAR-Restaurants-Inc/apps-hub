/**
 * Every JM DevOps action is a public endpoint (CLAUDE.md §3): called by someone who is
 * not a system admin, or with no session, it must answer 'denied' or 'expired' and
 * never reach the database. The access check itself is tested in authorize-core.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const access = vi.hoisted(() => ({ reason: 'not_admin' as string | null }));
const store = vi.hoisted(() => ({
  createProject: vi.fn(),
  updateProject: vi.fn(),
  setProjectArchived: vi.fn(),
  createIssue: vi.fn(),
  updateIssue: vi.fn(),
  addComment: vi.fn(),
  deleteIssue: vi.fn(),
}));

vi.mock('@/lib/access', async () => {
  const { AccessDenied } = await import('@/lib/authorize-core');
  return {
    AccessDenied,
    requireSystemAdmin: vi.fn(async () => {
      if (access.reason) throw new AccessDenied(access.reason);
      return { email: 'admin@example.invalid' };
    }),
  };
});
vi.mock('@/lib/devops/store', () => store);
vi.mock('@/lib/devops/db', () => ({ devopsDb: vi.fn(() => ({})) }));
vi.mock('@/lib/people', () => ({ listAdmins: vi.fn(async () => []) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));

const actions = await import('./actions');

const calls: [string, () => Promise<{ outcome: string }>][] = [
  ['createProjectAction', () => actions.createProjectAction({ name: 'x', prefix: 'XX', repo: '' })],
  ['updateProjectAction', () => actions.updateProjectAction(1, { name: 'a', repo: '' }, { name: 'b', repo: '' })],
  ['archiveProjectAction', () => actions.archiveProjectAction(1, true)],
  ['createIssueAction', () => actions.createIssueAction(1, { title: 'x', type: 'task', status: 'new', priority: 'low', assignee: '', description: '', dueDate: '' })],
  ['updateIssueAction', () => actions.updateIssueAction(1, 'title', 'a', 'b')],
  ['addCommentAction', () => actions.addCommentAction(1, 'x')],
  ['deleteIssueAction', () => actions.deleteIssueAction(1, 'XX-001')],
];

describe('JM DevOps actions refuse anyone but a system admin', () => {
  beforeEach(() => Object.values(store).forEach((f) => f.mockReset()));

  it('covers every action the file exports', () => {
    const exported = Object.keys(actions).filter((k) => k.endsWith('Action') && k !== 'setDevopsThemeAction');
    expect(exported.sort()).toEqual(calls.map(([n]) => n).sort());
  });

  it.each(calls)('%s: signed in, not an admin, is denied and touches nothing', async (_, call) => {
    access.reason = 'not_admin';
    expect((await call()).outcome).toBe('denied');
    for (const f of Object.values(store)) expect(f).not.toHaveBeenCalled();
  });

  it.each(calls)('%s: no session is expired and touches nothing', async (_, call) => {
    access.reason = 'not_signed_in';
    expect((await call()).outcome).toBe('expired');
    for (const f of Object.values(store)) expect(f).not.toHaveBeenCalled();
  });

  it('an admin gets through to the store', async () => {
    access.reason = null;
    store.addComment.mockResolvedValue('done');
    expect((await actions.addCommentAction(1, 'x')).outcome).toBe('done');
    expect(store.addComment).toHaveBeenCalledWith({}, 'admin@example.invalid', 1, 'x');
  });
});
