'use client';

import { archiveProjectAction, createProjectAction, updateProjectAction } from '@/app/devops/actions';
import { dt } from '@/lib/devops/i18n';
import { cleanPrefix, issueKey } from '@/lib/devops/rules';
import type { Lang } from '@/lib/i18n';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition, type ReactNode } from 'react';
import { outcomeText } from './ui';

/** A native dialog: Escape, focus and the backdrop come with it. */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const set = (el: HTMLDialogElement | null) => {
    ref.current = el;
    if (el && open && !el.open) el.showModal();
  };
  if (!open) return null;
  return (
    <dialog ref={set} className="dv-dialog" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} aria-label={title}>
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}

/** "Nouveau projet": name, prefix (with the keys it will make), GitHub link. */
export function NewProjectButton({ lang, className = 'dv-btn primary' }: { lang: Lang; className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('');
  const [repo, setRepo] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const p = cleanPrefix(prefix);

  const close = () => {
    setOpen(false);
    setMessage(null);
  };
  const submit = () =>
    start(async () => {
      const out = await createProjectAction({ name, prefix, repo });
      if (out.outcome === 'done' && out.prefix) {
        close();
        setName('');
        setPrefix('');
        setRepo('');
        router.push(`/devops/${out.prefix}`);
      } else setMessage(outcomeText(lang, out.outcome));
    });

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {dt(lang, 'new_project')}
      </button>
      <Dialog open={open} onClose={close} title={dt(lang, 'new_project')}>
        <form
          className="dv-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label>
            <span>{dt(lang, 'proj_name')}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoFocus />
          </label>
          <label>
            <span>{dt(lang, 'proj_prefix')}</span>
            <input value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} maxLength={6} pattern="[A-Za-z]{2,6}" required autoCapitalize="characters" spellCheck={false} />
            <small>
              {dt(lang, 'proj_prefix_hint')} {p && <span className="dv-key">{`${issueKey(p, 1)}, ${issueKey(p, 2)}…`}</span>}
            </small>
          </label>
          <label>
            <span>{dt(lang, 'proj_repo')}</span>
            <input value={repo} onChange={(e) => setRepo(e.target.value)} type="url" placeholder="https://github.com/…" spellCheck={false} />
          </label>
          {message && <p className="dv-error" role="alert">{message}</p>}
          <div className="dv-actions">
            <button type="button" className="dv-btn" onClick={close}>
              {dt(lang, 'cancel')}
            </button>
            <button type="submit" className="dv-btn primary" disabled={pending || !name.trim() || !p}>
              {dt(lang, 'create')}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

/** "Gérer": edit the name and link (never the prefix), archive or restore. */
export function ManageProject({ lang, project }: { lang: Lang; project: { id: number; name: string; prefix: string; githubRepo: string | null; archived: boolean } }) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState<'edit' | 'archive' | null>(null);
  const [name, setName] = useState(project.name);
  const [repo, setRepo] = useState(project.githubRepo ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const close = () => {
    setDialog(null);
    setMessage(null);
  };
  const save = () =>
    start(async () => {
      const out = await updateProjectAction(project.id, { name: project.name, repo: project.githubRepo ?? '' }, { name, repo });
      if (out.outcome === 'done' || out.outcome === 'unchanged') {
        close();
        router.refresh();
      } else setMessage(outcomeText(lang, out.outcome));
    });
  const archive = (archived: boolean) =>
    start(async () => {
      const out = await archiveProjectAction(project.id, archived);
      if (out.outcome === 'done' || out.outcome === 'unchanged') {
        close();
        router.refresh();
      } else setMessage(outcomeText(lang, out.outcome));
    });

  return (
    <div className="dv-menuwrap">
      <button type="button" className="dv-btn" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
        {dt(lang, 'manage')}
        <svg viewBox="0 0 24 24" aria-hidden="true" className="dv-caret">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {menu && (
        <div className="dv-menu" role="menu" onMouseLeave={() => setMenu(false)}>
          {!project.archived && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(false);
                setName(project.name);
                setRepo(project.githubRepo ?? '');
                setDialog('edit');
              }}
            >
              {dt(lang, 'edit_project')}
            </button>
          )}
          {project.archived ? (
            <button type="button" role="menuitem" disabled={pending} onClick={() => (setMenu(false), archive(false))}>
              {dt(lang, 'restore_project')}
            </button>
          ) : (
            <button type="button" role="menuitem" onClick={() => (setMenu(false), setDialog('archive'))}>
              {dt(lang, 'archive_project')}
            </button>
          )}
        </div>
      )}
      <Dialog open={dialog === 'edit'} onClose={close} title={dt(lang, 'edit_project')}>
        <form
          className="dv-form"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label>
            <span>{dt(lang, 'proj_name')}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoFocus />
          </label>
          <label>
            <span>{dt(lang, 'proj_prefix')}</span>
            <input value={project.prefix} disabled />
            <small>{dt(lang, 'proj_prefix_fixed')}</small>
          </label>
          <label>
            <span>{dt(lang, 'proj_repo')}</span>
            <input value={repo} onChange={(e) => setRepo(e.target.value)} type="url" placeholder="https://github.com/…" spellCheck={false} />
          </label>
          {message && <p className="dv-error" role="alert">{message}</p>}
          <div className="dv-actions">
            <button type="button" className="dv-btn" onClick={close}>
              {dt(lang, 'cancel')}
            </button>
            <button type="submit" className="dv-btn primary" disabled={pending || !name.trim() || (name === project.name && repo === (project.githubRepo ?? ''))}>
              {dt(lang, 'save')}
            </button>
          </div>
        </form>
      </Dialog>
      <Dialog open={dialog === 'archive'} onClose={close} title={dt(lang, 'archive_project')}>
        <p>{dt(lang, 'archive_body')}</p>
        {message && <p className="dv-error" role="alert">{message}</p>}
        <div className="dv-actions">
          <button type="button" className="dv-btn" onClick={close}>
            {dt(lang, 'cancel')}
          </button>
          <button type="button" className="dv-btn primary" disabled={pending} onClick={() => archive(true)}>
            {dt(lang, 'archive_project')}
          </button>
        </div>
      </Dialog>
    </div>
  );
}
