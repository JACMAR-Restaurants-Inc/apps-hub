'use client';

import { createIssueAction } from '@/app/devops/actions';
import { dt } from '@/lib/devops/i18n';
import { PRIORITIES, TYPES } from '@/lib/devops/rules';
import type { Lang } from '@/lib/i18n';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Dialog } from './project-dialogs';
import { outcomeText } from './ui';

const EMPTY = { title: '', type: 'task', status: 'new', priority: 'medium', assignee: '', requestedBy: '', description: '', dueDate: '' };

/**
 * "Nouvelle tâche" (the old AddIssueModal): the same fields, the same defaults (Task,
 * New, Medium, nobody). The server gives the number and records who created it.
 */
export function NewIssueButton({ lang, projectId, prefix, people }: { lang: Lang; projectId: number; prefix: string; people: { email: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const field = (k: keyof typeof EMPTY) => ({ value: f[k], onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }) });

  const close = () => {
    setOpen(false);
    setMessage(null);
  };
  const submit = () =>
    start(async () => {
      if (!f.title.trim()) return setMessage(dt(lang, 'title_required'));
      const out = await createIssueAction(projectId, f);
      if (out.outcome === 'done' && out.number) {
        close();
        setF(EMPTY);
        router.push(`/devops/${prefix}/${out.number}`);
      } else setMessage(outcomeText(lang, out.outcome));
    });

  return (
    <>
      <button type="button" className="dv-btn primary" onClick={() => setOpen(true)}>
        {dt(lang, 'new_issue')}
      </button>
      <Dialog open={open} onClose={close} title={dt(lang, 'new_issue')}>
        <form
          className="dv-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label>
            <span>{dt(lang, 'field_title')}</span>
            <input {...field('title')} maxLength={200} required autoFocus />
          </label>
          <div className="dv-row">
            <label>
              <span>{dt(lang, 'field_type')}</span>
              <select {...field('type')}>
                {TYPES.map((v) => (
                  <option key={v} value={v}>
                    {dt(lang, `type_${v}`)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{dt(lang, 'field_status')}</span>
              <select {...field('status')}>
                {(['new', 'active'] as const).map((v) => (
                  <option key={v} value={v}>
                    {dt(lang, `status_${v}`)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{dt(lang, 'field_priority')}</span>
              <select {...field('priority')}>
                {PRIORITIES.map((v) => (
                  <option key={v} value={v}>
                    {dt(lang, `priority_${v}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="dv-row">
            <label>
              <span>{dt(lang, 'field_assignee')}</span>
              <select {...field('assignee')}>
                <option value="">{dt(lang, 'nobody')}</option>
                {people.map((p) => (
                  <option key={p.email} value={p.email}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{dt(lang, 'field_requestedBy')}</span>
              <input {...field('requestedBy')} maxLength={80} list="dv-requesters" />
            </label>
            <label>
              <span>{dt(lang, 'field_dueDate')}</span>
              <input {...field('dueDate')} type="date" />
            </label>
          </div>
          <datalist id="dv-requesters">
            {people.map((p) => (
              <option key={p.email} value={p.name} />
            ))}
          </datalist>
          <label>
            <span>{dt(lang, 'field_description')}</span>
            <textarea {...field('description')} rows={6} maxLength={20000} />
          </label>
          {message && <p className="dv-error" role="alert">{message}</p>}
          <div className="dv-actions">
            <button type="button" className="dv-btn" onClick={close}>
              {dt(lang, 'cancel')}
            </button>
            <button type="submit" className="dv-btn primary" disabled={pending}>
              {dt(lang, 'create')}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
