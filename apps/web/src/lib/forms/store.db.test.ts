/**
 * Forms' writes against REAL Postgres (staging). Each test runs in a transaction that is
 * always rolled back. Skipped in CI.
 */

import { existsSync } from 'node:fs';
import { createDb, formEvents, forms, submissions } from '@hub/db';
import { asc, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { type Conn, createForm, duplicateForm, getForm, parseSettings, updateSettings, listForms, listSubmissions, mySubmissions, openForms, publish, saveDraft, setStatus, share, submit, type Person } from './store';

if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const db = url ? createDb(url) : null;
afterAll(async () => {
  await db?.$client.end();
});
class Rollback extends Error {}
async function rolledBack(fn: (tx: Conn) => Promise<void>) {
  await expect(
    db!.transaction(async (tx) => {
      // The store opens its own transactions; inside this one they are savepoints.
      await fn(tx);
      throw new Rollback();
    }),
  ).rejects.toBeInstanceOf(Rollback);
}

const HR = 'hr-test@example.invalid';
const MARIE: Person = { email: 'marie-test@example.invalid', fullName: 'Marie Test', employeeNumber: '0123', };
const QUESTIONS = {
  title: 'Calypso test',
  fields: [
    { id: 'phone', type: 'phone', label: 'Téléphone', required: true, sensitive: true },
    { id: 'bus', type: 'choice', label: 'Transport', options: [{ id: 'yes', label: 'Oui' }, { id: 'no', label: 'Non' }] },
  ],
  signature: true,
};
const at = async (tx: Conn, id: number) => (await getForm(tx, id))!.updatedAt.toISOString();
const allow = (restaurantId: string | null = '1647') => () => ({ restaurantId });

/** A form with the questions above, published (so open) and shared with managers. */
async function openForm(tx: Conn) {
  const { id } = await createForm(tx, HR, 'Calypso test');
  expect((await saveDraft(tx, HR, id, await at(tx, id!), QUESTIONS)).outcome).toBe('done');
  expect(await publish(tx, HR, id, await at(tx, id!))).toEqual({ outcome: 'done', version: 1 });
  expect((await share(tx, HR, id, { roles: [], stores: [], people: [] }, { roles: ['manager'] })).outcome).toBe('done');
  return id!;
}

describe.skipIf(!db)('Forms on Postgres (rolled back)', () => {
  it('a new form is a draft nobody can fill, shared with nobody', async () => {
    await rolledBack(async (tx) => {
      const { outcome, id } = await createForm(tx, HR, '  Calypso  ');
      expect(outcome).toBe('done');
      const f = (await getForm(tx, id))!;
      expect(f).toMatchObject({ title: 'Calypso', status: 'draft', currentVersion: null, audience: { roles: [], stores: [], people: [] }, oncePerPerson: true, sensitiveDays: 30, keepDays: 365 });
      expect((await openForms(tx)).some((o) => o.id === id)).toBe(false);
      expect(await submit(tx, MARIE, id, 1, {}, 'Marie', allow())).toEqual({ outcome: 'not_open' });
      expect((await createForm(tx, HR, '   ')).outcome).toBe('invalid');
    });
  });

  it('a draft that does not read, or asks nothing, cannot be saved or published', async () => {
    await rolledBack(async (tx) => {
      const { id } = await createForm(tx, HR, 'Empty');
      expect(await publish(tx, HR, id, await at(tx, id!))).toEqual({ outcome: 'invalid' });
      expect(await saveDraft(tx, HR, id, await at(tx, id!), { title: {}, fields: [] })).toMatchObject({ outcome: 'invalid' });
    });
  });

  it('a stale page changes nothing: draft, publish, share, status', async () => {
    await rolledBack(async (tx) => {
      const id = await openForm(tx);
      const old = new Date(0).toISOString();
      expect((await saveDraft(tx, HR, id, old, QUESTIONS)).outcome).toBe('changed');
      expect((await publish(tx, HR, id, old)).outcome).toBe('changed');
      expect(await setStatus(tx, HR, id, 'closed', old)).toBe('changed');
      // The page showed nobody; it is shared with managers now.
      expect((await share(tx, HR, id, { roles: [], stores: [], people: [] }, { roles: ['office'] })).outcome).toBe('changed');
      expect((await getForm(tx, id))!.audience.roles).toEqual(['manager']);
    });
  });

  it('publishing writes a new version; an unchanged draft is not republished', async () => {
    await rolledBack(async (tx) => {
      const id = await openForm(tx);
      expect((await publish(tx, HR, id, await at(tx, id))).outcome).toBe('unchanged');
      const changed = { ...QUESTIONS, fields: [...QUESTIONS.fields, { id: 'note', type: 'text', label: 'Note' }] };
      expect((await saveDraft(tx, HR, id, await at(tx, id), changed)).outcome).toBe('done');
      expect(await publish(tx, HR, id, await at(tx, id))).toEqual({ outcome: 'done', version: 2 });
      expect((await openForms(tx)).find((o) => o.id === id)!.definition.fields.map((f) => f.id)).toEqual(['phone', 'bus', 'note']);
    });
  });

  it('a submission keeps its version; one answered to an older version is refused as changed', async () => {
    await rolledBack(async (tx) => {
      const id = await openForm(tx);
      const first = await submit(tx, MARIE, id, 1, { phone: '819 555 0101', bus: 'yes' }, 'Marie Test', allow());
      expect(first.outcome).toBe('done');
      await saveDraft(tx, HR, id, await at(tx, id), { ...QUESTIONS, title: 'Calypso v2' });
      await publish(tx, HR, id, await at(tx, id));
      const other = { ...MARIE, email: 'other-test@example.invalid' };
      expect(await submit(tx, other, id, 1, { phone: '819 555 0101' }, 'Other', allow())).toEqual({ outcome: 'changed' });
      expect((await submit(tx, other, id, 2, { phone: '819 555 0101' }, 'Other', allow())).outcome).toBe('done');
      const rows = await listSubmissions(tx, id, 'all');
      expect(rows.map((r) => [r.email, r.version])).toEqual([[MARIE.email, 1], [other.email, 2]]);
      expect(rows[0]).toMatchObject({ answers: { phone: '8195550101', bus: 'yes' }, signedName: 'Marie Test', employeeNumber: '0123', restaurantId: '1647' });
    });
  });

  it('answers are checked on the server; nothing unasked is stored', async () => {
    await rolledBack(async (tx) => {
      const id = await openForm(tx);
      expect(await submit(tx, MARIE, id, 1, { bus: 'maybe' }, '', allow())).toEqual({ outcome: 'invalid', errors: { phone: 'required', bus: 'invalid', signature: 'required' } });
      expect((await submit(tx, MARIE, id, 1, { phone: '8195550101', admin: true }, 'Marie', allow())).outcome).toBe('done');
      const [row] = await listSubmissions(tx, id, 'all');
      expect(row.answers).toEqual({ phone: '8195550101' });
    });
  });

  it('one per person, checked under the form’s lock', async () => {
    await rolledBack(async (tx) => {
      const id = await openForm(tx);
      expect((await submit(tx, MARIE, id, 1, { phone: '8195550101' }, 'Marie', allow())).outcome).toBe('done');
      expect(await submit(tx, MARIE, id, 1, { phone: '8195550101' }, 'Marie', allow())).toEqual({ outcome: 'already' });
      expect((await mySubmissions(tx, MARIE.email)).has(id)).toBe(true);
    });
  });

  it('the caller’s decision is made against the locked row: a refusal files nothing', async () => {
    await rolledBack(async (tx) => {
      const id = await openForm(tx);
      let seen: unknown;
      const refuse = (status: string, audience: unknown) => {
        seen = { status, audience };
        return null;
      };
      expect(await submit(tx, MARIE, id, 1, { phone: '8195550101' }, 'Marie', refuse)).toEqual({ outcome: 'denied' });
      expect(seen).toEqual({ status: 'open', audience: { roles: ['manager'], stores: [], people: [] } });
      expect(await listSubmissions(tx, id, 'all')).toEqual([]);
    });
  });

  it('a closed form takes nothing; it can open again; a never-published one cannot open', async () => {
    await rolledBack(async (tx) => {
      const id = await openForm(tx);
      expect(await setStatus(tx, HR, id, 'closed', await at(tx, id))).toBe('done');
      expect((await getForm(tx, id))!.closedAt).not.toBeNull();
      expect(await submit(tx, MARIE, id, 1, { phone: '8195550101' }, 'Marie', allow())).toEqual({ outcome: 'not_open' });
      expect(await setStatus(tx, HR, id, 'open', await at(tx, id))).toBe('done');
      expect((await getForm(tx, id))!.closedAt).toBeNull();
      const { id: fresh } = await createForm(tx, HR, 'Never published');
      expect(await setStatus(tx, HR, fresh, 'open', await at(tx, fresh!))).toBe('invalid');
    });
  });

  it('a reader limited to restaurants sees only theirs; none is nothing', async () => {
    await rolledBack(async (tx) => {
      const id = await openForm(tx);
      await submit(tx, MARIE, id, 1, { phone: '8195550101' }, 'Marie', allow('1647'));
      await submit(tx, { ...MARIE, email: 'b-test@example.invalid' }, id, 1, { phone: '8195550101' }, 'B', allow('3472'));
      await submit(tx, { ...MARIE, email: 'c-test@example.invalid' }, id, 1, { phone: '8195550101' }, 'C', allow(null));
      expect((await listSubmissions(tx, id, ['3472'])).map((r) => r.restaurantId)).toEqual(['3472']);
      expect(await listSubmissions(tx, id, [])).toEqual([]);
      expect(await listSubmissions(tx, id, 'all')).toHaveLength(3);
      expect((await listForms(tx)).find((f) => f.id === id)!.submissions).toBe(3);
    });
  });

  it('every change is an event, in order; answers are not copied into them', async () => {
    await rolledBack(async (tx) => {
      const id = await openForm(tx);
      await submit(tx, MARIE, id, 1, { phone: '8195550101' }, 'Marie', allow());
      const ev = await tx.select().from(formEvents).where(eq(formEvents.formId, id)).orderBy(asc(formEvents.id));
      expect(ev.map((e) => e.event)).toEqual(['created', 'draft_saved', 'published', 'shared', 'submitted']);
      expect(JSON.stringify(ev)).not.toContain('8195550101');
      expect((await tx.select().from(submissions).where(eq(submissions.formId, id))).length).toBe(1);
      expect((await tx.select().from(forms).where(eq(forms.id, id)))[0].createdBy).toBe(HR);
    });
  });

  it('settings: checked, stale-checked, journaled', async () => {
    await rolledBack(async (tx) => {
      const id = await openForm(tx);
      const shown = { notifyEmail: null, oncePerPerson: true, sensitiveDays: 30, keepDays: 365 };
      const next = { notifyEmail: ' RH@Jacmar-Restaurants.com ', oncePerPerson: false, sensitiveDays: 15, keepDays: 400 };
      expect(await updateSettings(tx, HR, id, shown, { ...next, notifyEmail: 'nope' })).toBe('invalid');
      expect(await updateSettings(tx, HR, id, shown, { ...next, sensitiveDays: 500 })).toBe('invalid');
      expect(await updateSettings(tx, HR, id, { ...shown, keepDays: 1 }, next)).toBe('changed');
      expect(await updateSettings(tx, HR, id, shown, next)).toBe('done');
      expect(await getForm(tx, id)).toMatchObject({ notifyEmail: 'rh@jacmar-restaurants.com', oncePerPerson: false, sensitiveDays: 15, keepDays: 400 });
      expect(await updateSettings(tx, HR, id, parseSettings(next), next)).toBe('unchanged');
    });
  });

  it('duplicating: the questions and settings, a new title, shared with nobody, no answers', async () => {
    await rolledBack(async (tx) => {
      const id = await openForm(tx);
      await submit(tx, MARIE, id, 1, { phone: '8195550101' }, 'Marie', allow());
      const { outcome, id: copy } = await duplicateForm(tx, HR, id, 'Calypso 2027');
      expect(outcome).toBe('done');
      const f = (await getForm(tx, copy))!;
      expect(f).toMatchObject({ title: 'Calypso 2027', status: 'draft', currentVersion: null, audience: { roles: [], stores: [], people: [] } });
      expect((f.draft as { fields: { id: string }[] }).fields.map((x) => x.id)).toEqual(['phone', 'bus']);
      expect((f.draft as { title: string }).title).toBe('Calypso 2027');
      expect(await listSubmissions(tx, copy!, 'all')).toEqual([]);
    });
  });
});
