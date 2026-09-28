'use server';

/**
 * Cash Balancing's server actions. Each is a PUBLIC endpoint: anyone can call it with
 * any arguments (safe-count §3, CLAUDE.md §3), so each one first authorises, against
 * the restaurant ON THE RECORD wherever there is a record, then checks every argument.
 */

import { AccessDenied, authorize } from '@/lib/access';
import { cashDb } from '@/lib/cash/db';
import { CASH_APP, parseCountInput } from '@/lib/cash/math';
import { countRestaurant, queueAccountantSend, saveCount, type SaveError } from '@/lib/cash/store';
import { getLang } from '@/lib/lang';
import { getSignedInEmail } from '@/lib/viewer';
import { revalidatePath } from 'next/cache';

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
    const outcome = await queueAccountantSend(cashDb(), countId as number, record.language);
    revalidatePath('/cash', 'layout');
    return { outcome };
  } catch (e) {
    if (e instanceof AccessDenied) return { outcome: refusal(e) };
    console.error('sendToAccountantAction failed', e);
    return { outcome: 'error' };
  }
}
