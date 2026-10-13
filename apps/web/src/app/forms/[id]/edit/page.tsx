import { FormEditor } from '@/components/forms/form-editor';
import { formsDb } from '@/lib/forms/db';
import { emptyDefinition, parseDefinition } from '@/lib/forms/definition';
import { ft } from '@/lib/forms/i18n';
import { canEditForms } from '@/lib/forms/rules';
import { getForm, publishedVersion, isAnswered, versionHistory } from '@/lib/forms/store';
import { getLang } from '@/lib/lang';
import { restaurantLabel, roleLabel } from '@/lib/labels';
import { directoryPeople, directoryPerson } from '@/lib/people';
import { listRestaurants } from '@/lib/restaurants';
import { getRoster, getViewer } from '@/lib/viewer';
import { businessDate, businessTime } from '@hub/core';
import Link from 'next/link';

/**
 * HR's editor for one form: Bureau holding Forms, and system admins. Anyone else reads
 * that it is not available, whether or not the form exists. Drawing only: every save
 * checks for itself (app/forms/actions.ts).
 */
export default async function EditPage({ params }: PageProps<'/forms/[id]/edit'>) {
  const [viewer, lang, roster, { id }] = await Promise.all([getViewer(), getLang(), getRoster(), params]);
  if (!viewer) return null;
  const form = canEditForms(roster, viewer.email) && /^\d{1,9}$/.test(id) ? await getForm(formsDb(), Number(id)) : null;
  const back = (
    <Link className="backlink" href="/forms">
      ← {ft(lang, 'back')}
    </Link>
  );
  if (!form) {
    return (
      <div className="pagehead">
        {back}
        <p>{ft(lang, 'not_available')}</p>
      </div>
    );
  }

  const parsed = parseDefinition(form.draft);
  const draft = parsed.ok ? parsed.definition : emptyDefinition(form.title);
  const [live, stores, people, me, answered, versions] = await Promise.all([
    form.currentVersion !== null ? publishedVersion(formsDb(), form.id, form.currentVersion) : null,
    listRestaurants(),
    directoryPeople(),
    directoryPerson(viewer.email),
    isAnswered(formsDb(), form.id),
    versionHistory(formsDb(), form.id),
  ]);
  const names = new Map(people.map((p) => [p.email, p.name]));

  return (
    <>
      <div className="pagehead">
        {back}
        <h1>{form.title}</h1>
        {form.currentVersion !== null && (
          <Link className="fo-link" href={`/forms/${form.id}/responses`}>
            {ft(lang, 'responses')}
          </Link>
        )}
      </div>
      <FormEditor
        lang={lang}
        form={{
          id: form.id,
          status: form.status,
          currentVersion: form.currentVersion,
          updatedAt: form.updatedAt.toISOString(),
          draft,
          audience: form.audience,
          settings: { notifyEmail: form.notifyEmail, oncePerPerson: form.oncePerPerson, sensitiveDays: form.sensitiveDays, keepDays: form.keepDays },
          draftDiffers: JSON.stringify(live) !== JSON.stringify(draft),
          answered,
          history: versions.map((v) => ({
            version: v.version,
            at: `${businessDate(v.publishedAt)} ${businessTime(v.publishedAt)}`,
            by: names.get(v.publishedBy) ?? v.publishedBy,
            answers: v.answers,
            definition: v.definition,
          })),
        }}
        restaurants={stores.filter((s) => s.active).map((s) => ({ id: s.id, label: restaurantLabel(s.id, s.name) }))}
        people={people}
        roles={(['office', 'manager', 'viewer'] as const).map((key) => ({ key, label: roleLabel(lang, key) }))}
        me={{ name: me.fullName ?? viewer.name, number: me.employeeNumber, email: me.email }}
      />
    </>
  );
}
