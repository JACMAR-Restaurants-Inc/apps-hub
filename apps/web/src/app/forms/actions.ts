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
import { tellReached } from '@/lib/forms/notify';
import { FORMS_APP, NOBODY, fillDecision, newlyReached, pickStore } from '@/lib/forms/rules';
import { createForm, duplicateForm, getForm, publish, saveDraft, setStatus, share, submit, updateSettings, type Outcome, type SubmitResult } from '@/lib/forms/store';
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

export type EditResult = { outcome: Outcome | Refusal; id?: number; version?: number; errors?: string[]; updatedAt?: string };

/**
 * HR's actions: authorize first, then the store. On success the answer carries the form's
 * new updatedAt, which the editor sends with its next save (the stale-page check).
 */
async function asHr(action: string, id: unknown, fn: (actor: string) => Promise<EditResult>): Promise<EditResult> {
  try {
    const { email } = await authorize(FORMS_APP, 'form', 'edit');
    const out = await fn(email);
    if (out.outcome === 'done') {
      revalidatePath('/forms', 'layout');
      const form = await getForm(formsDb(), out.id ?? id);
      if (form) out.updatedAt = form.updatedAt.toISOString();
    }
    return out;
  } catch (e) {
    if (e instanceof AccessDenied) return { outcome: e.reason === 'not_signed_in' ? 'expired' : 'denied' };
    console.error(`forms ${action} failed`, e);
    return { outcome: 'error' };
  }
}

export async function createFormAction(title: unknown): Promise<EditResult> {
  return asHr('create', null, (actor) => createForm(formsDb(), actor, title));
}

export async function duplicateFormAction(id: unknown, title: unknown): Promise<EditResult> {
  return asHr('duplicate', null, (actor) => duplicateForm(formsDb(), actor, id, title));
}

export async function saveDraftAction(id: unknown, shownAt: unknown, definition: unknown): Promise<EditResult> {
  return asHr('draft', id, (actor) => saveDraft(formsDb(), actor, id, shownAt, definition));
}

/** Publishing the FIRST version opens the form: everyone it is shared with is told. */
export async function publishAction(id: unknown, shownAt: unknown): Promise<EditResult> {
  return asHr('publish', id, async (actor) => {
    const out = await publish(formsDb(), actor, id, shownAt);
    if (out.outcome === 'done' && out.version === 1) {
      const form = await getForm(formsDb(), id);
      if (form) await tellReached(newlyReached(await getRoster(), NOBODY, form.audience), form.id, form.title);
    }
    return out;
  });
}

/** Sharing an open form tells the people it newly reaches; a draft's audience is told when it opens. */
export async function shareAction(id: unknown, shown: unknown, next: unknown): Promise<EditResult> {
  return asHr('share', id, async (actor) => {
    const out = await share(formsDb(), actor, id, shown, next);
    if (out.outcome === 'done') {
      const form = await getForm(formsDb(), id);
      if (form?.status === 'open') await tellReached(newlyReached(await getRoster(), out.before!, out.after!), form.id, form.title);
    }
    return { outcome: out.outcome };
  });
}

export async function setStatusAction(id: unknown, status: unknown, shownAt: unknown): Promise<EditResult> {
  return asHr('status', id, async (actor) => ({ outcome: await setStatus(formsDb(), actor, id, status, shownAt) }));
}

export async function updateSettingsAction(id: unknown, shown: unknown, next: unknown): Promise<EditResult> {
  return asHr('settings', id, async (actor) => ({ outcome: await updateSettings(formsDb(), actor, id, shown, next) }));
}
