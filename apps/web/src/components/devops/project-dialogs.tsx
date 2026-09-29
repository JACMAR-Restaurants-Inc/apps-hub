'use client';

import { createProjectAction, deleteProjectAction, updateProjectAction } from '@/app/devops/actions';
import { dt, issuesWord } from '@/lib/devops/i18n';
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

/** "Nouveau projet": a name and a GitHub link. No prefix any more (owner, 2026-09-29). */
export function NewProjectButton({ lang, className = 'dv-btn primary' }: { lang: Lang; className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [repo, setRepo] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const close = () => {
    setOpen(false);
    setMessage(null);
  };
  const submit = () =>
    start(async () => {
      const out = await createProjectAction({ name, repo });
      if (out.outcome === 'done' && out.id) {
        close();
        setName('');
        setRepo('');
        router.push(`/devops/${out.id}`);
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
            <span>{dt(lang, 'proj_repo')}</span>
            <input value={repo} onChange={(e) => setRepo(e.target.value)} type="url" placeholder="https://github.com/…" spellCheck={false} />
          </label>
          {message && <p className="dv-error" role="alert">{message}</p>}
          <div className="dv-actions">
            <button type="button" className="dv-btn" onClick={close}>
              {dt(lang, 'cancel')}
            </button>
            <button type="submit" className="dv-btn primary" disabled={pending || !name.trim()}>
              {dt(lang, 'create')}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

/**
 * "Gérer": edit the name and link, or delete the project completely
 * (owner, 2026-09-29, as the old DeleteProjectModal did: it says how many issues go
 * with it and asks for the exact name). It used to archive.
 */
export function ManageProject({ lang, project }: { lang: Lang; project: { id: number; name: string; githubRepo: string | null; issues: number } }) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState<'edit' | 'delete' | null>(null);
  const [name, setName] = useState(project.name);
  const [repo, setRepo] = useState(project.githubRepo ?? '');
  const [typed, setTyped] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const close = () => {
    setDialog(null);
    setMessage(null);
    setTyped('');
  };
  const save = () =>
    start(async () => {
      const out = await updateProjectAction(project.id, { name: project.name, repo: project.githubRepo ?? '' }, { name, repo });
      if (out.outcome === 'done' || out.outcome === 'unchanged') {
        close();
        router.refresh();
      } else setMessage(outcomeText(lang, out.outcome));
    });
  const remove = () =>
    start(async () => {
      const out = await deleteProjectAction(project.id, typed);
      if (out.outcome === 'done') {
        close();
        router.push('/devops');
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
          <button type="button" role="menuitem" className="dv-danger" onClick={() => (setMenu(false), setDialog('delete'))}>
            {dt(lang, 'delete_project')}
          </button>
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
      <Dialog open={dialog === 'delete'} onClose={close} title={`${dt(lang, 'delete_project')} ${project.name}`}>
        <form
          className="dv-form"
          onSubmit={(e) => {
            e.preventDefault();
            remove();
          }}
        >
          {project.issues === 0 ? (
            <p>{dt(lang, 'delete_project_empty')}</p>
          ) : (
            <p>
              <b>
                {project.issues} {issuesWord(lang, project.issues)}
              </b>{' '}
              {dt(lang, project.issues === 1 ? 'delete_project_body_one' : 'delete_project_body')}
            </p>
          )}
          <label>
            <span>
              {dt(lang, 'delete_type_name')} <b>{project.name}</b>
            </span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus spellCheck={false} autoComplete="off" />
          </label>
          {message && <p className="dv-error" role="alert">{message}</p>}
          <div className="dv-actions">
            <button type="button" className="dv-btn" onClick={close}>
              {dt(lang, 'close')}
            </button>
            <button type="submit" className="dv-btn danger" disabled={pending || typed.trim() !== project.name}>
              {dt(lang, 'delete_project')}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
