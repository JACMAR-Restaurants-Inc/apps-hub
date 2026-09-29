'use server';

/**
 * JM DevOps' server actions. Each is a PUBLIC endpoint anyone can call with any
 * arguments (CLAUDE.md §3), so each one first checks the caller is a system admin
 * (owner, 2026-09-29: admins only), then hands the raw values to the store, which
 * checks every one of them.
 */

import { AccessDenied, requireSystemAdmin } from '@/lib/access';
import { devopsDb } from '@/lib/devops/db';
import { DEVOPS_THEME_COOKIE } from '@/lib/devops/viewer';
import {
  addComment,
  createIssue,
  createProject,
  deleteIssue,
  setProjectArchived,
  updateIssue,
  updateProject,
  type IssueInput,
  type Outcome,
  type ProjectInput,
} from '@/lib/devops/store';
import { listAdmins } from '@/lib/people';
import { businessDate } from '@hub/core';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

/** 'expired': no session any more, as opposed to 'denied': signed in, not an admin. */
export type Refusal = 'expired' | 'denied' | 'error';
export type Result = { outcome: Outcome | Refusal; prefix?: string; number?: number };

async function run(action: string, fn: (actor: string) => Promise<Result>): Promise<Result> {
  try {
    const { email } = await requireSystemAdmin(`devops.${action}`);
    const out = await fn(email);
    if (out.outcome === 'done' || out.outcome === 'changed') revalidatePath('/devops', 'layout');
    return out;
  } catch (e) {
    if (e instanceof AccessDenied) return { outcome: e.reason === 'not_signed_in' ? 'expired' : 'denied' };
    console.error(`devops ${action} failed`, e);
    return { outcome: 'error' };
  }
}

const adminSet = async () => new Set((await listAdmins()).map((a) => a.email));

export async function createProjectAction(raw: ProjectInput): Promise<Result> {
  return run('project.create', (actor) => createProject(devopsDb(), actor, raw ?? {}));
}

export async function updateProjectAction(id: unknown, shown: { name: unknown; repo: unknown }, next: { name: unknown; repo: unknown }): Promise<Result> {
  return run('project.update', async (actor) => ({ outcome: await updateProject(devopsDb(), actor, id as number, shown ?? {}, next ?? {}) }));
}

export async function archiveProjectAction(id: unknown, archived: unknown): Promise<Result> {
  return run('project.archive', async (actor) => ({ outcome: await setProjectArchived(devopsDb(), actor, id as number, archived as boolean) }));
}

export async function createIssueAction(projectId: unknown, raw: IssueInput): Promise<Result> {
  return run('issue.create', async (actor) => createIssue(devopsDb(), actor, projectId as number, raw ?? {}, await adminSet(), businessDate()));
}

export async function updateIssueAction(issueId: unknown, field: unknown, shown: unknown, next: unknown, reason?: unknown): Promise<Result> {
  return run('issue.update', async (actor) => ({ outcome: await updateIssue(devopsDb(), actor, issueId as number, field, shown, next, await adminSet(), reason) }));
}

export async function addCommentAction(issueId: unknown, body: unknown): Promise<Result> {
  return run('comment.create', async (actor) => ({ outcome: await addComment(devopsDb(), actor, issueId as number, body) }));
}

export async function deleteIssueAction(issueId: unknown, confirm: unknown): Promise<Result> {
  return run('issue.delete', async (actor) => ({ outcome: await deleteIssue(devopsDb(), actor, issueId as number, confirm) }));
}

/** Clair / Sombre. A preference, not data: anyone signed in may set their own. */
export async function setDevopsThemeAction(theme: unknown): Promise<void> {
  if (theme !== 'light' && theme !== 'dark') return;
  (await cookies()).set(DEVOPS_THEME_COOKIE, theme, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production' });
}
