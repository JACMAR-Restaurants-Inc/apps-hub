'use client';

import { createFormAction } from '@/app/forms/actions';
import { ft } from '@/lib/forms/i18n';
import type { Lang } from '@/lib/i18n';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

/** HR's "New form": a title, then the editor. */
export function NewForm({ lang }: { lang: Lang }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [failed, setFailed] = useState(false);
  const [busy, start] = useTransition();
  if (!open)
    return (
      <button type="button" className="pbtn" onClick={() => setOpen(true)}>
        + {ft(lang, 'new_form')}
      </button>
    );
  return (
    <form
      className="fo-inline"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createFormAction(title);
          if (r.outcome === 'done' && r.id) router.push(`/forms/${r.id}/edit`);
          else setFailed(true);
        });
      }}
    >
      <input type="text" autoFocus aria-label={ft(lang, 'new_title')} placeholder={ft(lang, 'new_title')} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
      <button type="submit" className="pbtn" disabled={busy || !title.trim()}>
        {ft(lang, 'create')}
      </button>
      <button type="button" className="fo-btn" onClick={() => setOpen(false)}>
        {ft(lang, 'cancel')}
      </button>
      {failed && (
        <p className="gp-err" role="alert">
          {ft(lang, 'out_error')}
        </p>
      )}
    </form>
  );
}
