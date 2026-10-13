import { FillForm } from '@/components/forms/fill-form';
import { formsDb } from '@/lib/forms/db';
import { ft } from '@/lib/forms/i18n';
import { fillDecision } from '@/lib/forms/rules';
import { getForm, mySubmissions, publishedVersion } from '@/lib/forms/store';
import { getLang } from '@/lib/lang';
import { restaurantLabel } from '@/lib/labels';
import { directoryPerson } from '@/lib/people';
import { listRestaurants } from '@/lib/restaurants';
import { getRoster, getViewer } from '@/lib/viewer';
import Link from 'next/link';

/**
 * Filling one form. Shown only to someone in its audience while it is open; anyone else
 * reads that it is not available to them, whether or not it exists. The person's name,
 * employee number and email come from the access directory, never typed.
 */
export default async function FillPage({ params }: PageProps<'/forms/[id]'>) {
  const [viewer, lang, roster, { id }] = await Promise.all([getViewer(), getLang(), getRoster(), params]);
  if (!viewer) return null;
  const form = /^\d{1,9}$/.test(id) ? await getForm(formsDb(), Number(id)) : null;
  const decision = form ? fillDecision(roster, viewer.email, form.status, form.audience) : null;
  const def = form && decision?.allowed && form.currentVersion !== null ? await publishedVersion(formsDb(), form.id, form.currentVersion) : null;

  const back = (
    <Link className="backlink" href="/forms">
      ← {ft(lang, 'back')}
    </Link>
  );
  if (!form || !decision?.allowed || !def) {
    return (
      <div className="pagehead">
        {back}
        <p>{ft(lang, 'not_available')}</p>
      </div>
    );
  }

  const [person, sent, stores] = await Promise.all([directoryPerson(viewer.email), mySubmissions(formsDb(), viewer.email), listRestaurants()]);
  const names = new Map(stores.map((s) => [s.id, s.name]));
  return (
    <>
      <div className="pagehead">{back}</div>
      <section className="panel">
        <FillForm
          lang={lang}
          formId={form.id}
          version={form.currentVersion!}
          definition={def}
          already={form.oncePerPerson && sent.has(form.id)}
          person={{ name: person.fullName ?? viewer.name, number: person.employeeNumber, email: person.email }}
          stores={decision.stores.map((s) => ({ id: s, label: restaurantLabel(s, names.get(s)) }))}
        />
      </section>
    </>
  );
}
