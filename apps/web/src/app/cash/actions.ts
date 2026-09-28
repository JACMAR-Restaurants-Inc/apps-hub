'use server';

/**
 * Cash Balancing's server actions. Each is a PUBLIC endpoint: anyone can call it with
 * any arguments (safe-count §3, CLAUDE.md §3), so each one first authorises, against
 * the restaurant ON THE RECORD wherever there is a record, then checks every argument.
 */

import { AccessDenied, authorize } from '@/lib/access';
import { ALLOWED_TYPES, MAX_BYTES, MAX_FILES, attachmentById, cleanFileName, setStoragePath, stageAttachment, stagedCount, unstage } from '@/lib/cash/attachments';
import { cashDb } from '@/lib/cash/db';
import { fileStore, sniffType } from '@/lib/cash/files';
import { CASH_APP, parseCountInput } from '@/lib/cash/math';
import { CASH_THEME_COOKIE } from '@/lib/cash/theme';
import { countRestaurant, queueAccountantSend, saveCount, type SaveError } from '@/lib/cash/store';
import { addTill, setExpectedTotal, setReportEmail, setTillActive, updateTill, type AdminOutcome } from '@/lib/cash/settings';
import { getCashViewer } from '@/lib/cash/viewer';
import { getLang } from '@/lib/lang';
import { parseCents } from '@hub/core';
import { getSignedInEmail } from '@/lib/viewer';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { reportDeps } from '@/lib/cash/report-deps';
import { releaseForRetry, runReportJob } from '@/lib/cash/reports';
import { cookies } from 'next/headers';

/**
 * 'expired': no session any more, as opposed to 'denied': signed in and not allowed.
 * The old app kept not_authenticated and not_authorised apart for the same reason
 * (safe-count §5): one means "sign in again", the other "ask the office".
 */
type Refusal = 'expired' | 'denied' | 'invalid' | 'error';
const refusal = (e: AccessDenied): Refusal => (e.reason === 'not_signed_in' ? 'expired' : 'denied');

export type SubmitResult = { outcome: 'done'; id: number } | { outcome: SaveError | Refusal };

export async function submitCountAction(raw: unknown): Promise<SubmitResult> {
  const input = parseCountInput(raw);
  try {
    if (!input) {
      // Still authorised first, so a caller with no session learns nothing more.
      await authorize(CASH_APP, 'app', 'access');
      return { outcome: 'invalid' };
    }
    // Against the restaurant being counted: a manager cannot file at a store they do
    // not hold by editing the request (Api.gs apiSubmitCount).
    const { email } = await authorize(CASH_APP, 'count', 'create', input.restaurantId);
    if (input.sendToAccountant) await authorize(CASH_APP, 'accountant', 'send', input.restaurantId);
    const [who, language] = await Promise.all([getSignedInEmail(), getLang()]);

    const out = await saveCount(cashDb(), {
      input,
      email,
      name: who?.name || email,
      language,
      now: new Date(),
      sendToAccountant: input.sendToAccountant,
    });
    if (!out.ok) return { outcome: out.error };
    // The PDF and emails after the answer: the manager is not kept waiting for them,
    // and a failure there is the sweep's to retry, never the count's to lose.
    const jobId = out.jobId;
    after(() => runReportJob(reportDeps(), jobId).catch((e) => console.error('report after submit failed', e)));
    revalidatePath('/cash', 'layout');
    return { outcome: 'done', id: out.id };
  } catch (e) {
    if (e instanceof AccessDenied) return { outcome: refusal(e) };
    console.error('submitCountAction failed', e);
    return { outcome: 'error' };
  }
}

export async function sendToAccountantAction(countId: unknown): Promise<{ outcome: 'done' | 'already_sent' | 'not_found' | Refusal }> {
  try {
    if (!Number.isSafeInteger(countId)) {
      await authorize(CASH_APP, 'app', 'access');
      return { outcome: 'invalid' };
    }
    const record = await countRestaurant(cashDb(), countId as number);
    if (!record) {
      await authorize(CASH_APP, 'app', 'access');
      return { outcome: 'not_found' };
    }
    await authorize(CASH_APP, 'accountant', 'send', record.restaurantId);
    const queued = await queueAccountantSend(cashDb(), countId as number, record.language);
    if (queued.outcome === 'done') {
      const jobId = queued.jobId;
      after(() => runReportJob(reportDeps(), jobId).catch((e) => console.error('report after accountant send failed', e)));
    }
    revalidatePath('/cash', 'layout');
    return { outcome: queued.outcome };
  } catch (e) {
    if (e instanceof AccessDenied) return { outcome: refusal(e) };
    console.error('sendToAccountantAction failed', e);
    return { outcome: 'error' };
  }
}

/** Clair / Sombre from the avatar menu. A preference of this browser, nothing more. */
export async function setCashThemeAction(theme: unknown): Promise<void> {
  if (theme !== 'light' && theme !== 'dark') return;
  (await cookies()).set(CASH_THEME_COOKIE, theme, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production' });
}

export type UploadResult =
  | { outcome: 'done'; attachment: { id: number; fileName: string; mimeType: string; fileSize: number } }
  | { outcome: 'too_large' | 'type_not_allowed' | 'too_many' | 'upload_failed' | Refusal };

/**
 * One file added on New Count (Api.gs apiUploadAttachment). Staged: owned by who sent
 * it, at the restaurant authorised here, linked to a count only when that count is
 * submitted. Its type is read from its bytes, not taken from the browser.
 */
export async function uploadAttachmentAction(form: FormData): Promise<UploadResult> {
  const rid = form.get('restaurantId');
  const file = form.get('file');
  try {
    if (typeof rid !== 'string' || !rid || rid.length > 20 || !(file instanceof File)) {
      await authorize(CASH_APP, 'app', 'access');
      return { outcome: 'invalid' };
    }
    const { email } = await authorize(CASH_APP, 'attachment', 'upload', rid);
    if (file.size > MAX_BYTES) return { outcome: 'too_large' };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffType(bytes);
    if (!type || !(ALLOWED_TYPES as readonly string[]).includes(type)) return { outcome: 'type_not_allowed' };
    // A generous ceiling on one person's unsent uploads, well above one count's five.
    if ((await stagedCount(cashDb(), email, rid, new Date(Date.now() - 86_400_000))) >= MAX_FILES * 4) return { outcome: 'too_many' };

    const fileName = cleanFileName(file.name);
    const id = await stageAttachment(cashDb(), { restaurantId: rid, email, fileName, mimeType: type, fileSize: bytes.length });
    try {
      const ref = await fileStore().put(`attachments/${rid}/${id}`, bytes, type);
      await setStoragePath(cashDb(), id, ref);
    } catch (e) {
      console.error('uploadAttachmentAction: storing failed', e);
      await unstage(cashDb(), id, email).catch(() => null);
      return { outcome: 'upload_failed' };
    }
    return { outcome: 'done', attachment: { id, fileName, mimeType: type, fileSize: bytes.length } };
  } catch (e) {
    if (e instanceof AccessDenied) return { outcome: refusal(e) };
    console.error('uploadAttachmentAction failed', e);
    return { outcome: 'upload_failed' };
  }
}

/** Removes one of MY staged uploads (Api.gs apiDeleteAttachment), authorised against the record. */
export async function removeAttachmentAction(id: unknown): Promise<{ outcome: 'done' | 'not_found' | 'already_linked' | 'not_yours' | Refusal }> {
  try {
    const row = Number.isSafeInteger(id) ? await attachmentById(cashDb(), id as number) : null;
    if (!row) {
      await authorize(CASH_APP, 'app', 'access');
      return { outcome: 'not_found' };
    }
    const { email } = await authorize(CASH_APP, 'attachment', 'upload', row.restaurantId);
    const out = await unstage(cashDb(), row.id, email);
    if (!out.ok) return { outcome: out.error };
    if (out.ref) await fileStore().remove(out.ref).catch((e) => console.error('removeAttachmentAction: file left behind', e));
    return { outcome: 'done' };
  } catch (e) {
    if (e instanceof AccessDenied) return { outcome: refusal(e) };
    console.error('removeAttachmentAction failed', e);
    return { outcome: 'error' };
  }
}

/** "Réessayer" on Rapports: runs one report again now. The admin panel's permission. */
export async function retryReportAction(jobId: unknown): Promise<{ outcome: 'sent' | 'failed' | 'skipped' | 'not_found' | Refusal }> {
  try {
    await authorize(CASH_APP, 'admin_panel', 'access');
    if (!Number.isSafeInteger(jobId)) return { outcome: 'invalid' };
    if (!(await releaseForRetry(cashDb(), jobId as number))) return { outcome: 'not_found' };
    const outcome = await runReportJob(reportDeps(), jobId as number);
    revalidatePath('/cash/reports');
    return { outcome };
  } catch (e) {
    if (e instanceof AccessDenied) return { outcome: refusal(e) };
    console.error('retryReportAction failed', e);
    return { outcome: 'error' };
  }
}

/** Amounts arrive as typed ("4 600,00"): cents, or NaN for anything that is not an amount. */
const typedCents = (v: unknown) => {
  const c = typeof v === 'string' || typeof v === 'number' ? parseCents(v) : null;
  return c === null ? Number.NaN : c;
};

/**
 * Every change on the Admin page (lib/cash/settings.ts has the rules). The admin
 * panel's permission, and only at a restaurant this person holds (a system admin holds
 * them all). `shown` is what the page showed, so a change made meanwhile by someone
 * else is refused as 'changed' rather than overwritten.
 */
export async function adminCashAction(raw: unknown): Promise<{ outcome: AdminOutcome | Refusal }> {
  try {
    const { email } = await authorize(CASH_APP, 'admin_panel', 'access');
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const rid = typeof r.rid === 'string' ? r.rid : '';
    const cash = await getCashViewer();
    if (!cash?.stores.some((s) => s.id === rid)) return { outcome: 'denied' };
    const db = cashDb();
    let outcome: AdminOutcome;
    switch (r.intent) {
      case 'expected':
        outcome = await setExpectedTotal(db, email, rid, r.shown === null ? null : typedCents(r.shown), typedCents(r.next));
        break;
      case 'email':
        outcome = await setReportEmail(db, email, rid, typeof r.shown === 'string' ? r.shown : null, r.next);
        break;
      case 'till_add':
        outcome = await addTill(db, email, rid, Number(r.number), r.label, typedCents(r.base));
        break;
      case 'till_update': {
        const shown = r.shown as { label?: unknown; base?: unknown } | undefined;
        if (!shown || typeof shown.label !== 'string' || !Number.isSafeInteger(shown.base)) return { outcome: 'invalid' };
        outcome = await updateTill(db, email, rid, r.number, { label: shown.label, base: shown.base as number }, { label: r.label, base: typedCents(r.base) });
        break;
      }
      case 'till_active':
        outcome = await setTillActive(db, email, rid, r.number, r.active === true);
        break;
      default:
        return { outcome: 'invalid' };
    }
    revalidatePath('/cash', 'layout');
    return { outcome };
  } catch (e) {
    if (e instanceof AccessDenied) return { outcome: refusal(e) };
    console.error('adminCashAction failed', e);
    return { outcome: 'error' };
  }
}
