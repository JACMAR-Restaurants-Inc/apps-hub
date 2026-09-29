'use client';

import { addCommentAction, deleteIssueAction, updateIssueAction } from '@/app/devops/actions';
import { dt } from '@/lib/devops/i18n';
import { PRIORITIES, STATUSES, TYPES, issueKey, type IssueStatus } from '@/lib/devops/rules';
import type { Field } from '@/lib/devops/store';
import type { Lang } from '@/lib/i18n';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Dialog } from './project-dialogs';
import { outcomeText } from './ui';

export interface EditableIssue {
  id: number;
  prefix: string;
  number: number;
  /** Each field as the server sent it: what a save says the page showed. */
  values: Record<Field, string>;
  /** For an assignee from the sheet that matched nobody: its text. */
  assigneeText: string | null;
}

type State = { saving?: boolean; saved?: boolean; error?: string | null };

/**
 * The issue's fields, each saved on its own the moment it changes (the old IssueModal:
 * selects on change, text on leaving the field), with "Enregistrement…" then
 * "Enregistré" beside the label. Each save says what the page showed; if someone else
 * changed the field meanwhile, nothing is written, the page reloads with their value
 * and says so.
 */
export function IssueEditor({ lang, issue, people, readOnly }: { lang: Lang; issue: EditableIssue; people: { email: string; name: string }[]; readOnly: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState(issue.values);
  const [state, setState] = useState<Partial<Record<Field, State>>>({});
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [, start] = useTransition();

  // A reload (after my save, or theirs) brings the server's values: show them.
  useEffect(() => setDraft(issue.values), [issue.values]);

  const save = (field: Field, next: string, why?: string) => {
    const shown = issue.values[field];
    if (next === shown) return;
    setState((s) => ({ ...s, [field]: { saving: true } }));
    start(async () => {
      const out = await updateIssueAction(issue.id, field, shown, next, why);
      const error = outcomeText(lang, out.outcome);
      setState((s) => ({ ...s, [field]: { saved: !error, error } }));
      if (error && out.outcome !== 'changed') setDraft((d) => ({ ...d, [field]: shown }));
      router.refresh();
    });
  };

  const label = (field: Field) => {
    const s = state[field];
    return (
      <span className="dv-flabel">
        {dt(lang, `field_${field}`)}
        {s?.saving && <em className="dv-saving">{dt(lang, 'saving')}</em>}
        {s?.saved && <em className="dv-saved">✓ {dt(lang, 'saved')}</em>}
      </span>
    );
  };
  const error = (field: Field) => state[field]?.error && <small className="dv-error" role="alert">{state[field]!.error}</small>;
  const select = (field: Field, options: { value: string; label: string }[]) => (
    <label className="dv-field">
      {label(field)}
      <select
        value={draft[field]}
        disabled={readOnly}
        onChange={(e) => {
          const v = e.target.value;
          if (field === 'status' && v === 'cancelled') return setCancelling(true);
          setDraft({ ...draft, [field]: v });
          save(field, v);
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error(field)}
    </label>
  );
  const text = (field: Field, props: { type?: string; multiline?: boolean; list?: string; max: number }) => (
    <label className={`dv-field${props.multiline ? ' wide' : ''}`}>
      {label(field)}
      {props.multiline ? (
        <textarea value={draft[field]} readOnly={readOnly} rows={8} maxLength={props.max} onChange={(e) => setDraft({ ...draft, [field]: e.target.value })} onBlur={(e) => save(field, e.target.value.trim())} />
      ) : (
        <input
          type={props.type ?? 'text'}
          value={draft[field]}
          readOnly={readOnly}
          list={props.list}
          maxLength={props.max}
          onChange={(e) => {
            setDraft({ ...draft, [field]: e.target.value });
            // A date picker is a choice, not typing: save it as soon as it is whole.
            if (props.type === 'date' && (e.target.value === '' || /^\d{4}-\d{2}-\d{2}$/.test(e.target.value))) save(field, e.target.value);
          }}
          onBlur={(e) => props.type !== 'date' && save(field, e.target.value.trim())}
          onKeyDown={(e) => e.key === 'Enter' && props.type !== 'date' && (e.currentTarget as HTMLInputElement).blur()}
        />
      )}
      {error(field)}
    </label>
  );

  const assigneeOptions = [
    { value: '', label: dt(lang, 'nobody') },
    ...(issue.assigneeText && issue.values.assignee.startsWith('~') ? [{ value: issue.values.assignee, label: `${issue.assigneeText} (${dt(lang, 'sheet_text')})` }] : []),
    ...people.map((p) => ({ value: p.email, label: p.name })),
  ];

  return (
    <div className="dv-editor">
      <label className="dv-field wide dv-titlefield">
        {label('title')}
        <input
          value={draft.title}
          readOnly={readOnly}
          maxLength={200}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          onBlur={(e) => {
            const v = e.target.value.trim().replace(/\s+/g, ' ');
            if (!v) {
              setDraft({ ...draft, title: issue.values.title });
              setState((s) => ({ ...s, title: { error: dt(lang, 'title_required') } }));
            } else save('title', v);
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        />
        {error('title')}
      </label>
      <div className="dv-grid">
        {select(
          'status',
          STATUSES.map((v) => ({ value: v, label: dt(lang, `status_${v}`) })),
        )}
        {select(
          'type',
          TYPES.map((v) => ({ value: v, label: dt(lang, `type_${v}`) })),
        )}
        {select(
          'priority',
          PRIORITIES.map((v) => ({ value: v, label: dt(lang, `priority_${v}`) })),
        )}
        {select('assignee', assigneeOptions)}
        {text('dueDate', { type: 'date', max: 10 })}
      </div>
      {text('description', { multiline: true, max: 20000 })}

      <Dialog open={cancelling} onClose={() => setCancelling(false)} title={dt(lang, 'cancel_issue')}>
        <form
          className="dv-form"
          onSubmit={(e) => {
            e.preventDefault();
            setCancelling(false);
            setDraft({ ...draft, status: 'cancelled' as IssueStatus });
            save('status', 'cancelled', reason.trim());
            setReason('');
          }}
        >
          <label>
            <span>{dt(lang, 'cancel_reason')}</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} required autoFocus />
            <small>{dt(lang, 'cancel_reason_hint')}</small>
          </label>
          <div className="dv-actions">
            {/* Not "Annuler": beside "Annuler la tâche" it reads as the same thing. */}
            <button type="button" className="dv-btn" onClick={() => setCancelling(false)}>
              {dt(lang, 'close')}
            </button>
            <button type="submit" className="dv-btn primary" disabled={!reason.trim()}>
              {dt(lang, 'cancel_issue')}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

/** "Ajouter un commentaire". */
export function CommentForm({ lang, issueId }: { lang: Lang; issueId: number }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="dv-form dv-commentform"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const out = await addCommentAction(issueId, body);
          const error = outcomeText(lang, out.outcome);
          setMessage(error);
          if (!error) setBody('');
          router.refresh();
        });
      }}
    >
      <label>
        <span className="sr-only">{dt(lang, 'add_comment')}</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={20000} placeholder={dt(lang, 'add_comment')} />
      </label>
      {message && <p className="dv-error" role="alert">{message}</p>}
      <div className="dv-actions">
        <button type="submit" className="dv-btn primary" disabled={pending || !body.trim()}>
          {dt(lang, 'post_comment')}
        </button>
      </div>
    </form>
  );
}

/** "Supprimer la tâche", confirmed by typing its key (CHK-066). */
export function DeleteIssue({ lang, issueId, prefix, number }: { lang: Lang; issueId: number; prefix: string; number: number }) {
  const router = useRouter();
  const key = issueKey(prefix, number);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const close = () => {
    setOpen(false);
    setTyped('');
    setMessage(null);
  };
  return (
    <>
      <button type="button" className="dv-btn danger" onClick={() => setOpen(true)}>
        {dt(lang, 'delete_issue')}
      </button>
      <Dialog open={open} onClose={close} title={`${dt(lang, 'delete_issue')} ${key}`}>
        <form
          className="dv-form"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const out = await deleteIssueAction(issueId, typed);
              if (out.outcome === 'done') {
                close();
                router.push(`/devops/${prefix}`);
                router.refresh();
              } else setMessage(outcomeText(lang, out.outcome));
            });
          }}
        >
          <p>{dt(lang, 'delete_body')}</p>
          <label>
            <span>
              {dt(lang, 'delete_type_key')} <b className="dv-key">{key}</b>
            </span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus spellCheck={false} autoCapitalize="characters" />
          </label>
          {message && <p className="dv-error" role="alert">{message}</p>}
          <div className="dv-actions">
            <button type="button" className="dv-btn" onClick={close}>
              {dt(lang, 'cancel')}
            </button>
            <button type="submit" className="dv-btn danger" disabled={pending || typed.trim().toUpperCase() !== key}>
              {dt(lang, 'delete_confirm')}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
