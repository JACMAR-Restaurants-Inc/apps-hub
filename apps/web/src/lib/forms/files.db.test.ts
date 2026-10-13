/**
 * Files on a form against REAL Postgres (staging), in transactions always rolled back.
 * The rule that matters: a submission links only the sender's OWN staged files, for that
 * question of that form; anything else refuses the whole submission and writes nothing.
 * Skipped in CI. No bytes are stored here: the rows carry a made-up ref.
 */

import { existsSync } from 'node:fs';
import { createDb, formFiles, submissions } from '@hub/db';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { abandonedFiles, fileById, filesOf, setFilePath, stageFile, stagedCount, unstageFile } from './files';
import { type Conn, createForm, getForm, publish, saveDraft, submit, type Person } from './store';

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
      await fn(tx);
      throw new Rollback();
    }),
  ).rejects.toBeInstanceOf(Rollback);
}

const HR = 'hr-test@example.invalid';
const MARIE: Person = { email: 'marie-test@example.invalid', fullName: 'Marie Test', employeeNumber: '0123' };
const PAUL = 'paul-test@example.invalid';
const QUESTIONS = {
  title: 'Dossier test',
  fields: [
    { id: 'id_card', type: 'file', label: 'Pièce d’identité', required: true },
    { id: 'diploma', type: 'file', label: 'Diplôme' },
  ],
  signature: false,
};
const at = async (tx: Conn, id: number) => (await getForm(tx, id))!.updatedAt.toISOString();
const allow = () => () => ({ restaurantId: '1647' });

async function openForm(tx: Conn) {
  const { id } = await createForm(tx, HR, 'Dossier test');
  expect((await saveDraft(tx, HR, id, await at(tx, id!), QUESTIONS)).outcome).toBe('done');
  expect((await publish(tx, HR, id, await at(tx, id!))).outcome).toBe('done');
  return id!;
}

async function staged(tx: Conn, formId: number, fieldId: string, email = MARIE.email, stored = true) {
  const id = await stageFile(tx, { formId, fieldId, email, fileName: 'carte.jpg', mimeType: 'image/jpeg', fileSize: 1000 });
  if (stored) await setFilePath(tx, id, `supabase:${formId}/${id}`);
  return id;
}

const submissionsOf = async (tx: Conn, formId: number) => (await tx.select({ id: submissions.id }).from(submissions).where(eq(submissions.formId, formId))).length;

describe.skipIf(!db)('Form files on Postgres (rolled back)', () => {
  it('a submission links the sender’s own staged files, and the answers page finds them', async () => {
    await rolledBack(async (tx) => {
      const form = await openForm(tx);
      const a = await staged(tx, form, 'id_card');
      const b = await staged(tx, form, 'id_card');
      const out = await submit(tx, MARIE, form, 1, { id_card: [String(a), String(b)] }, null, allow());
      expect(out.outcome).toBe('done');
      const sub = (out as { id: number }).id;
      expect((await fileById(tx, a))!).toMatchObject({ submissionId: sub, restaurantId: '1647' });
      expect([...(await filesOf(tx, [sub])).keys()].sort()).toEqual([a, b].sort());
      // Linked: no longer the uploader's to remove.
      expect(await unstageFile(tx, a, MARIE.email)).toEqual({ ok: false });
    });
  });

  it('another person’s file, another question’s, another form’s, a sent one or one never stored: refused, nothing written', async () => {
    await rolledBack(async (tx) => {
      const form = await openForm(tx);
      const other = await openForm(tx);
      const cases = [
        await staged(tx, form, 'id_card', PAUL),
        await staged(tx, form, 'diploma'),
        await staged(tx, other, 'id_card'),
        await staged(tx, form, 'id_card', MARIE.email, false),
        999_999_999,
      ];
      for (const id of cases) {
        const out = await submit(tx, MARIE, form, 1, { id_card: [String(id)] }, null, allow());
        expect(out, `file ${id}`).toEqual({ outcome: 'invalid', errors: { id_card: 'invalid' } });
      }
      // A file already sent with one submission cannot be sent again with another.
      const mine = await staged(tx, other, 'id_card');
      expect((await submit(tx, MARIE, other, 1, { id_card: [String(mine)] }, null, allow())).outcome).toBe('done');
      await tx.update(formFiles).set({ formId: form }).where(eq(formFiles.id, mine));
      expect(await submit(tx, MARIE, form, 1, { id_card: [String(mine)] }, null, allow())).toEqual({ outcome: 'invalid', errors: { id_card: 'invalid' } });
      expect(await submissionsOf(tx, form)).toBe(0);
      expect((await fileById(tx, cases[0]))!.submissionId).toBeNull();
    });
  });

  it('one bad file refuses the whole submission: the good one stays staged', async () => {
    await rolledBack(async (tx) => {
      const form = await openForm(tx);
      const good = await staged(tx, form, 'id_card');
      const bad = await staged(tx, form, 'diploma', PAUL);
      expect(await submit(tx, MARIE, form, 1, { id_card: [String(good)], diploma: [String(bad)] }, null, allow())).toEqual({ outcome: 'invalid', errors: { diploma: 'invalid' } });
      expect((await fileById(tx, good))!.submissionId).toBeNull();
      expect(await submissionsOf(tx, form)).toBe(0);
    });
  });

  it('only the uploader removes a staged file; staged ones are counted and swept by age', async () => {
    await rolledBack(async (tx) => {
      const form = await openForm(tx);
      const id = await staged(tx, form, 'id_card');
      const since = new Date(Date.now() - 60_000);
      expect(await stagedCount(tx, MARIE.email, since)).toBe(1);
      expect(await unstageFile(tx, id, PAUL)).toEqual({ ok: false });
      expect((await abandonedFiles(tx, new Date(Date.now() + 60_000))).some((f) => f.id === id)).toBe(true);
      expect((await abandonedFiles(tx, since)).some((f) => f.id === id)).toBe(false);
      expect(await unstageFile(tx, id, MARIE.email)).toEqual({ ok: true, ref: `supabase:${form}/${id}` });
      expect(await fileById(tx, id)).toBeNull();
    });
  });
});
