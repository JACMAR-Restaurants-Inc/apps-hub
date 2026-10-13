import { formatDay, type Lang } from '@/lib/i18n';
import { formsDb } from '@/lib/forms/db';
import { ft, type FormsKey } from '@/lib/forms/i18n';
import { canEditForms, fillDecision, responsesScope } from '@/lib/forms/rules';
import { listForms, mySubmissions, openForms } from '@/lib/forms/store';
import { getLang } from '@/lib/lang';
import { getRoster, getViewer } from '@/lib/viewer';
import { NewForm } from '@/components/forms/new-form';
import Link from 'next/link';

/**
 * The forms shared with this person, to fill; and, for HR and for managers who read
 * answers, every form with its state and its answers. Who sees what is decided here
 * from the roster read for this request (lib/forms/rules.ts); the actions decide again.
 */
export default async function FormsPage() {
  const [viewer, lang, roster] = await Promise.all([getViewer(), getLang(), getRoster()]);
  if (!viewer) return null;
  const [open, sent] = await Promise.all([openForms(formsDb()), mySubmissions(formsDb(), viewer.email)]);
  const mine = open.filter((f) => fillDecision(roster, viewer.email, f.status, f.audience).allowed);
  const editor = canEditForms(roster, viewer.email);
  const scope = responsesScope(roster, viewer.email);
  const manage = editor || scope === 'all' || scope.length > 0 ? await listForms(formsDb()) : null;
  // A manager reads answers to forms that are or were in use, never a draft.
  const managed = manage && (editor ? manage : manage.filter((f) => f.currentVersion !== null));

  return (
    <>
      <div className="pagehead">
        <h1>{ft(lang, 'title')}</h1>
        <p>{ft(lang, 'line')}</p>
      </div>

      <section className="panel">
        <div className="ph">
          <h2>{ft(lang, 'to_fill')}</h2>
        </div>
        {mine.length === 0 ? (
          <p className="favempty">{ft(lang, 'none_to_fill')}</p>
        ) : (
          <ul className="fo-list">
            {mine.map((f) => {
              const at = sent.get(f.id);
              return (
                <li key={f.id}>
                  <div>
                    <b>{f.definition.title}</b>
                    {at && <span className="fo-dim">{ft(lang, 'sent_on').replace('{date}', formatDay(lang, at))}</span>}
                  </div>
                  {!(at && f.oncePerPerson) && (
                    <Link className="pbtn" href={`/forms/${f.id}`}>
                      {ft(lang, 'fill')}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {managed && (
        <section className="panel">
          <div className="ph">
            <div>
              <h2>{ft(lang, editor ? 'manage' : 'responses_of')}</h2>
              <p>{ft(lang, 'manage_line')}</p>
            </div>
            {editor && (
              <div className="end">
                <NewForm lang={lang} />
              </div>
            )}
          </div>
          {managed.length === 0 ? (
            <p className="favempty">{ft(lang, 'no_forms')}</p>
          ) : (
            <ul className="fo-list">
              {managed.map((f) => (
                <li key={f.id}>
                  <div>
                    <b>{f.title}</b>
                    <span className={`fo-status is-${f.status}`}>{statusLabel(lang, f.status)}</span>
                  </div>
                  <div className="fo-links">
                    {f.currentVersion !== null && (
                      <Link className="fo-link" href={`/forms/${f.id}/responses`}>
                        {ft(lang, 'responses')}
                        {scope === 'all' ? ` (${f.submissions})` : ''}
                      </Link>
                    )}
                    {editor && (
                      <Link className="fo-link" href={`/forms/${f.id}/edit`}>
                        {ft(lang, 'edit')}
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

function statusLabel(lang: Lang, status: string) {
  return ft(lang, `status_${status}` as FormsKey);
}
