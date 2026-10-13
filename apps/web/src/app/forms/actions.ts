'use server';

/**
 * Forms' server actions. Each is a PUBLIC endpoint anyone can call with any arguments
 * (CLAUDE.md §3), so each one decides who is asking first:
 * - submitting: the form's audience, against the roster read fresh (lib/forms/rules.ts),
 *   re-decided against the form's locked row inside the store;
 * - uploading a file: the same decision as submitting, for a file question of the version
 *   people fill now; removing one: its uploader, while it is staged;
 * - everything HR does: authorize('Forms', 'form', 'edit').
 * Then the raw values go to the store, which checks every one of them.
 */

import { AccessDenied, authorize } from '@/lib/access';
import { db } from '@/lib/db';
import { formsDb } from '@/lib/forms/db';
import { ALLOWED_TYPES, MAX_BYTES, MAX_STAGED_PER_DAY, abandonedFiles, fileById, setFilePath, stageFile, stagedCount, unstageFile } from '@/lib/forms/files';
import { tellReached } from '@/lib/forms/notify';
import { FORMS_APP, NOBODY, fillDecision, newlyReached, pickStore } from '@/lib/forms/rules';
import { createForm, duplicateForm, getForm, publish, publishedVersion, saveDraft, setStatus, share, submit, updateSettings, type Outcome, type SubmitResult } from '@/lib/forms/store';
import { directoryPerson } from '@/lib/people';
import { allow, journalUnderLimit } from '@/lib/rate-limit';
import { getRoster, getSignedInEmail } from '@/lib/viewer';
import { cleanFileName, sniffType, supabaseBucket } from '@/lib/storage';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';

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
      await journalUnderLimit(db(), 'denialAudit', {
        actorEmail: who,
        app: FORMS_APP,
        event: 'denied',
        detail: {
          resource: 'form',
          action: 'submit',
          formId,
          reason: 'not_shared',
        },
      }).catch((e) => console.error('forms: could not audit a denial', e));
    }
    if (out.outcome === 'done') revalidatePath('/forms');
    return out;
  } catch (e) {
    console.error('forms submit failed', e);
    return { outcome: 'error' };
  }
}

export type UploadResult =
  | { outcome: 'done'; file: { id: string; fileName: string } }
  | {
      outcome: Refusal | 'too_many' | 'invalid' | 'not_open' | 'too_large' | 'type_not_allowed' | 'upload_failed';
    };

const filesBucket = () => supabaseBucket('forms');

/**
 * One file for a file question, staged until the form is sent. Who may: anyone who may
 * fill this form now (the same decision as submitting); for a file question of the
 * version people fill now. The type is read from the bytes.
 */
export async function uploadFormFileAction(data: FormData): Promise<UploadResult> {
  try {
    const email = (await getSignedInEmail())?.email ?? null;
    if (!email) return { outcome: 'expired' };
    const formId = Number(data.get('formId'));
    const fieldId = data.get('fieldId');
    const file = data.get('file');
    if (!Number.isSafeInteger(formId) || typeof fieldId !== 'string' || !(file instanceof File)) return { outcome: 'invalid' };
    const form = await getForm(formsDb(), formId);
    if (!form || form.status !== 'open' || form.currentVersion === null) return { outcome: 'not_open' };
    if (!fillDecision(await getRoster(), email, form.status, form.audience).allowed) return { outcome: 'denied' };
    const def = await publishedVersion(formsDb(), form.id, form.currentVersion);
    if (!def?.fields.some((f) => f.id === fieldId && f.type === 'file')) return { outcome: 'invalid' };
    if (!(await allow(db(), 'formUpload', email)).allowed) return { outcome: 'too_many' };

    if (file.size > MAX_BYTES) return { outcome: 'too_large' };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffType(bytes);
    if (!type || !(ALLOWED_TYPES as readonly string[]).includes(type)) return { outcome: 'type_not_allowed' };
    if ((await stagedCount(formsDb(), email, new Date(Date.now() - 86_400_000))) >= MAX_STAGED_PER_DAY) return { outcome: 'too_many' };

    const fileName = cleanFileName(file.name);
    const id = await stageFile(formsDb(), {
      formId: form.id,
      fieldId,
      email,
      fileName,
      mimeType: type,
      fileSize: bytes.length,
    });
    try {
      await setFilePath(formsDb(), id, await filesBucket().put(`${form.id}/${id}`, bytes, type));
    } catch (e) {
      console.error('forms upload: storing failed', e);
      await unstageFile(formsDb(), id, email).catch(() => null);
      return { outcome: 'upload_failed' };
    }
    after(sweepAbandonedFiles);
    return { outcome: 'done', file: { id: String(id), fileName } };
  } catch (e) {
    console.error('forms upload failed', e);
    return { outcome: 'upload_failed' };
  }
}

/** Removes one of MY staged files: only its uploader, only before the form is sent. */
export async function removeFormFileAction(id: unknown): Promise<{ outcome: 'done' | 'not_found' | Refusal }> {
  try {
    const email = (await getSignedInEmail())?.email ?? null;
    if (!email) return { outcome: 'expired' };
    const n = typeof id === 'string' && /^\d{1,9}$/.test(id) ? Number(id) : null;
    const row = n === null ? null : await fileById(formsDb(), n);
    if (!row || row.uploadedBy !== email || row.submissionId !== null) return { outcome: 'not_found' };
    const out = await unstageFile(formsDb(), row.id, email);
    if (!out.ok) return { outcome: 'not_found' };
    if (out.ref)
      await filesBucket()
        .remove(out.ref)
        .catch((e) => console.error('forms remove: file left behind', e));
    return { outcome: 'done' };
  } catch (e) {
    console.error('forms remove file failed', e);
    return { outcome: 'error' };
  }
}

/** Staged files nobody sent within a day: their rows and bytes go. Runs after an upload. */
async function sweepAbandonedFiles() {
  try {
    for (const f of await abandonedFiles(formsDb(), new Date(Date.now() - 86_400_000))) {
      const out = await unstageFile(formsDb(), f.id, f.uploadedBy);
      if (out.ok && out.ref) await filesBucket().remove(out.ref);
    }
  } catch (e) {
    console.error('forms: sweeping abandoned files failed', e);
  }
}

export type EditResult = {
  outcome: Outcome | Refusal;
  id?: number;
  version?: number;
  errors?: string[];
  updatedAt?: string;
};

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
  return asHr('status', id, async (actor) => ({
    outcome: await setStatus(formsDb(), actor, id, status, shownAt),
  }));
}

export async function updateSettingsAction(id: unknown, shown: unknown, next: unknown): Promise<EditResult> {
  return asHr('settings', id, async (actor) => ({
    outcome: await updateSettings(formsDb(), actor, id, shown, next),
  }));
}
