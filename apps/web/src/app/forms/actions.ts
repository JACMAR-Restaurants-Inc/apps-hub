'use server';

/**
 * Forms' server actions. Each is a PUBLIC endpoint anyone can call with any arguments
 * (CLAUDE.md §3), so each one decides who is asking first:
 * - submitting: the form's audience, against the roster read fresh (lib/forms/rules.ts),
 *   re-decided against the form's locked row inside the store;
 * - everything HR does: authorize('Forms', 'form', 'edit').
 * Then the raw values go to the store, which checks every one of them.
 */

import { AccessDenied, authorize } from '@/lib/access';
import { db } from '@/lib/db';
import { formsDb } from '@/lib/forms/db';
import { FORMS_APP, fillDecision, pickStore } from '@/lib/forms/rules';
import { createForm, publish, saveDraft, setStatus, share, submit, type Outcome, type SubmitResult } from '@/lib/forms/store';
import { directoryPerson } from '@/lib/people';
import { allow, journalUnderLimit } from '@/lib/rate-limit';
import { getRoster, getSignedInEmail } from '@/lib/viewer';
import { revalidatePath } from 'next/cache';

/** 'expired': no session any more, as opposed to 'denied': signed in, not allowed. */
export type Refusal = 'expired' | 'denied' | 'error';

export type SubmitAnswer = SubmitResult | { outcome: Refusal | 'too_many' };

export async function submitFormAction(formId: unknown, version: unknown, answers: unknown, signedName: unknown, restaurantId: unknown): Promise<SubmitAnswer> {
  let email: string | null = null;
  try {
    email = (await getSignedInEmail())?.email ?? null;
    if (!email) return { outcome: 'expired' };
    if (!(await allow(db(), 'formSubmit', email)).allowed) return { outcome: 'too_many' };
    const [roster, person] = await Promise.all([getRoster(), directoryPerson(email)]);
    const who = email;
    const out = await submit(formsDb(), person, formId, version, answers, signedName, (status, audience) => {
      const store = pickStore(fillDecision(roster, who, status, audience), restaurantId);
      return store === 'invalid' ? null : { restaurantId: store };
    });
    if (out.outcome === 'denied') {
      await journalUnderLimit(db(), 'denialAudit', { actorEmail: who, app: FORMS_APP, event: 'denied', detail: { resource: 'form', action: 'submit', formId, reason: 'not_shared' } }).catch((e) =>
        console.error('forms: could not audit a denial', e),
      );
    }
    if (out.outcome === 'done') revalidatePath('/forms');
    return out;
  } catch (e) {
    console.error('forms submit failed', e);
    return { outcome: 'error' };
  }
}

export type EditResult = { outcome: Outcome | Refusal; id?: number; version?: number; errors?: string[] };

async function asHr(action: string, fn: (actor: string) => Promise<EditResult>): Promise<EditResult> {
  try {
    const { email } = await authorize(FORMS_APP, 'form', 'edit');
    const out = await fn(email);
    if (out.outcome === 'done') revalidatePath('/forms', 'layout');
    return out;
  } catch (e) {
    if (e instanceof AccessDenied) return { outcome: e.reason === 'not_signed_in' ? 'expired' : 'denied' };
    console.error(`forms ${action} failed`, e);
    return { outcome: 'error' };
  }
}

export async function createFormAction(title: unknown): Promise<EditResult> {
  return asHr('create', (actor) => createForm(formsDb(), actor, title));
}

export async function saveDraftAction(id: unknown, shownAt: unknown, definition: unknown): Promise<EditResult> {
  return asHr('draft', (actor) => saveDraft(formsDb(), actor, id, shownAt, definition));
}

export async function publishAction(id: unknown, shownAt: unknown): Promise<EditResult> {
  return asHr('publish', (actor) => publish(formsDb(), actor, id, shownAt));
}

export async function shareAction(id: unknown, shown: unknown, next: unknown): Promise<EditResult> {
  return asHr('share', async (actor) => ({ outcome: (await share(formsDb(), actor, id, shown, next)).outcome }));
}

export async function setStatusAction(id: unknown, status: unknown, shownAt: unknown): Promise<EditResult> {
  return asHr('status', async (actor) => ({ outcome: await setStatus(formsDb(), actor, id, status, shownAt) }));
}
