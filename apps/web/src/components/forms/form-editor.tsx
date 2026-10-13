'use client';

import { duplicateFormAction, publishAction, saveDraftAction, setStatusAction, shareAction, updateSettingsAction, type EditResult } from '@/app/forms/actions';
import { FIELD_TYPES, moveSection, type Field, type FieldType, type FormDefinition } from '@/lib/forms/definition';
import { ft, type FormsKey } from '@/lib/forms/i18n';
import type { Audience } from '@/lib/forms/rules';
import type { Settings } from '@/lib/forms/store';
import type { Lang } from '@/lib/i18n';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { FillForm } from './fill-form';

export interface EditorForm {
  id: number;
  status: 'draft' | 'open' | 'closed';
  currentVersion: number | null;
  updatedAt: string;
  draft: FormDefinition;
  audience: Audience;
  settings: Settings;
  /** The draft is not what people fill now. */
  draftDiffers: boolean;
}

interface Props {
  lang: Lang;
  form: EditorForm;
  restaurants: { id: string; label: string }[];
  people: { email: string; name: string }[];
  roles: { key: 'office' | 'manager' | 'viewer'; label: string }[];
  me: { name: string; number: string | null; email: string };
}

type Tab = 'questions' | 'preview' | 'share' | 'settings';

/** An id the definition accepts (lowercase, at most 32), unique enough within a form. */
const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function blankField(type: FieldType): Field {
  const f: Field = { id: newId('f'), type, label: '', required: false, sensitive: false };
  if (type === 'choice' || type === 'choices') f.options = [{ id: newId('o'), label: '' }, { id: newId('o'), label: '' }];
  return f;
}

/**
 * HR's editor (owner, 2026-10-09: a list of fields on a screen, not drag-and-drop). The
 * draft is edited here and saved as a whole; Publish makes it the version people fill.
 * Sharing and settings save on their own. Every save sends what the page showed, and the
 * server refuses it as 'changed' if someone else saved since (lib/forms/store.ts).
 */
export function FormEditor({ lang, form, restaurants, people, roles, me }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('questions');
  const [def, setDef] = useState<FormDefinition>(form.draft);
  const [saved, setSaved] = useState(JSON.stringify(form.draft));
  const [shownAt, setShownAt] = useState(form.updatedAt);
  const [status, setStatus] = useState(form.status);
  const [version, setVersion] = useState(form.currentVersion);
  const [differs, setDiffers] = useState(form.draftDiffers);
  const [badFields, setBadFields] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<{ key: FormsKey; n?: number; ok?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(def) !== saved;

  const t = (k: FormsKey) => ft(lang, k);

  /** Runs an action; keeps the new updatedAt; says how it went. */
  function act(fn: () => Promise<EditResult>, onDone: (r: EditResult) => FormsKey | null) {
    start(async () => {
      const r = await fn();
      if (r.outcome === 'expired') return window.location.reload();
      if (r.updatedAt) setShownAt(r.updatedAt);
      if (r.outcome === 'done') {
        const key = onDone(r);
        setMessage(key ? { key, n: r.version, ok: true } : null);
        router.refresh();
      } else setMessage({ key: `out_${r.outcome}` as FormsKey });
    });
  }

  function saveDraft() {
    setBadFields(new Set());
    start(async () => {
      const r = await saveDraftAction(form.id, shownAt, def);
      if (r.outcome === 'expired') return window.location.reload();
      if (r.updatedAt) setShownAt(r.updatedAt);
      if (r.outcome === 'done' || r.outcome === 'unchanged') {
        setSaved(JSON.stringify(def));
        if (r.outcome === 'done') setDiffers(true);
        setMessage({ key: 'saved', ok: true });
      } else if (r.outcome === 'invalid') {
        setBadFields(new Set((r.errors ?? []).map((e) => /^field_(\d+)/.exec(e)?.[1]).filter(Boolean).map(Number)));
        setMessage({ key: 'out_invalid' });
      } else setMessage({ key: `out_${r.outcome}` as FormsKey });
    });
  }

  const update = (i: number, f: Field) => setDef((d) => ({ ...d, fields: d.fields.map((x, j) => (j === i ? f : x)) }));
  /** A question moves one place (into the next section, past its heading); a section moves with its questions. */
  const move = (i: number, by: -1 | 1) =>
    setDef((d) => {
      if (d.fields[i].type === 'heading') return { ...d, fields: moveSection(d.fields, i, by) ?? d.fields };
      const fields = [...d.fields];
      const [f] = fields.splice(i, 1);
      fields.splice(i + by, 0, f);
      return { ...d, fields };
    });
  const remove = (i: number) => setDef((d) => ({ ...d, fields: d.fields.filter((_, j) => j !== i) }));

  return (
    <div className="fo-editor">
      <div className="fo-bar">
        <span className={`fo-status is-${status}`}>{t(`status_${status}`)}</span>
        {version !== null && <span className="fo-dim">{t('published').replace('{n}', String(version))}</span>}
        {differs && version !== null && <span className="fo-dim">{t('draft_differs')}</span>}
        <span className="fo-grow" />
        {dirty && <span className="fo-unsaved">{t('unsaved')}</span>}
        <button type="button" className="fo-btn" disabled={pending || !dirty} onClick={saveDraft}>
          {t(pending ? 'saving' : 'save_draft')}
        </button>
        <button
          type="button"
          className="pbtn"
          disabled={pending || dirty || (!differs && version !== null)}
          title={t('publish_line')}
          onClick={() =>
            act(
              () => publishAction(form.id, shownAt),
              (r) => {
                setVersion(r.version ?? version);
                setDiffers(false);
                if (status === 'draft') setStatus('open');
                return 'published';
              },
            )
          }
        >
          {t('publish')}
        </button>
      </div>

      {message && (
        <p className={message.ok ? 'fo-ok' : 'gp-err'} role={message.ok ? 'status' : 'alert'}>
          {message.key === 'out_invalid' && tab !== 'questions' ? t('out_publish_invalid') : t(message.key).replace('{n}', String(message.n ?? ''))}
        </p>
      )}

      <div className="fo-tabs" role="tablist">
        {(['questions', 'preview', 'share', 'settings'] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>
            {t(`tab_${k}`)}
          </button>
        ))}
      </div>

      {tab === 'questions' && (
        <section className="panel fo-form">
          <TextInput lang={lang} label="title_fr" value={def.title} onChange={(title) => setDef({ ...def, title: title ?? '' })} />
          <TextInput
            lang={lang}
            label="intro_fr"
            long
            value={def.intro}
            onChange={(intro) => {
              const next = { ...def, intro };
              if (!intro) delete next.intro;
              setDef(next);
            }}
          />

          {def.fields.length === 0 && <p className="favempty">{t('no_fields')}</p>}
          {def.fields.map((f, i) => (
            <FieldCard
              key={f.id}
              lang={lang}
              n={def.fields.slice(0, i + 1).filter((x) => x.type !== 'heading').length}
              field={f}
              bad={badFields.has(i)}
              first={f.type === 'heading' ? !moveSection(def.fields, i, -1) : i === 0}
              last={f.type === 'heading' ? !moveSection(def.fields, i, 1) : i === def.fields.length - 1}
              onChange={(nf) => update(i, nf)}
              onMove={(by) => move(i, by)}
              onRemove={() => remove(i)}
            />
          ))}
          <AddField lang={lang} onAdd={(type) => setDef({ ...def, fields: [...def.fields, blankField(type)] })} />

          <label className="fo-opt">
            <input type="checkbox" checked={def.signature} onChange={(e) => setDef({ ...def, signature: e.target.checked })} />
            <span>{t('with_signature')}</span>
          </label>
        </section>
      )}

      {tab === 'preview' && (
        <section className="panel">
          <h2 className="fo-preview-title">{def.title}</h2>
          <FillForm lang={lang} formId={form.id} version={0} definition={def} already={false} person={me} stores={restaurants.slice(0, 1)} preview />
        </section>
      )}

      {tab === 'share' && (
        <SharePanel
          lang={lang}
          shown={form.audience}
          restaurants={restaurants}
          people={people}
          roles={roles}
          pending={pending}
          onSave={(shown, next) => act(() => shareAction(form.id, shown, next), () => 'saved')}
        />
      )}

      {tab === 'settings' && (
        <SettingsPanel lang={lang} shown={form.settings} pending={pending} onSave={(shown, next) => act(() => updateSettingsAction(form.id, shown, next), () => 'saved')} />
      )}

      <div className="fo-bar fo-bar-end">
        {status === 'open' && (
          <button type="button" className="fo-btn" disabled={pending} onClick={() => act(() => setStatusAction(form.id, 'closed', shownAt), () => (setStatus('closed'), 'saved'))}>
            {t('close_form')}
          </button>
        )}
        {status === 'closed' && (
          <button type="button" className="fo-btn" disabled={pending} onClick={() => act(() => setStatusAction(form.id, 'open', shownAt), () => (setStatus('open'), 'saved'))}>
            {t('reopen_form')}
          </button>
        )}
        <Duplicate lang={lang} id={form.id} title={def.title} pending={pending} onDone={(id) => router.push(`/forms/${id}/edit`)} />
      </div>
    </div>
  );
}

/** One French text (owner, 2026-10-12: forms are written in French only). Empty is undefined. */
function TextInput({ lang, label, value, long, onChange }: { lang: Lang; label: FormsKey; value: string | undefined; long?: boolean; onChange: (v: string | undefined) => void }) {
  const Input = long ? 'textarea' : 'input';
  return (
    <div className="fo-field fo-text">
      <label>
        {ft(lang, label)}
        <Input type={long ? undefined : 'text'} value={value ?? ''} onChange={(e: { target: { value: string } }) => onChange(e.target.value || undefined)} />
      </label>
    </div>
  );
}

function FieldCard(props: { lang: Lang; n: number; field: Field; bad: boolean; first: boolean; last: boolean; onChange: (f: Field) => void; onMove: (by: -1 | 1) => void; onRemove: () => void }) {
  const { lang, n, field: f, bad, first, last, onChange, onMove, onRemove } = props;
  const t = (k: FormsKey) => ft(lang, k);
  const answerable = f.type !== 'heading';
  return (
    <div className={`fo-card${answerable ? '' : ' is-section'}${bad ? ' has-error' : ''}`}>
      <div className="fo-cardhead">
        {answerable ? (
          <>
            <b>{t('field_n').replace('{n}', String(n))}</b>
            <span className="fo-dim">{t(`type_${f.type}`)}</span>
          </>
        ) : (
          <b>{t('type_heading')}</b>
        )}
        <span className="fo-grow" />
        <button type="button" className="fo-icon" disabled={first} onClick={() => onMove(-1)} aria-label={t('move_up')} title={t('move_up')}>
          ↑
        </button>
        <button type="button" className="fo-icon" disabled={last} onClick={() => onMove(1)} aria-label={t('move_down')} title={t('move_down')}>
          ↓
        </button>
        <button type="button" className="fo-icon" onClick={onRemove} aria-label={t('remove')} title={t('remove')}>
          ✕
        </button>
      </div>
      <TextInput lang={lang} label={answerable ? 'label_fr' : 'section_title'} long={f.type === 'agree'} value={f.label} onChange={(label) => onChange({ ...f, label: label ?? '' })} />
      <TextInput
        lang={lang}
        label={answerable ? 'help_fr' : 'section_help'}
        long={!answerable}
        value={f.help}
        onChange={(help) => {
          const next = { ...f, help };
          if (!help) delete next.help;
          onChange(next);
        }}
      />
      {(f.type === 'choice' || f.type === 'choices') && (
        <div className="fo-options">
          <span className="fo-label">{t('options')}</span>
          {f.options!.map((o, i) => (
            <div key={o.id} className="fo-option">
              <input type="text" aria-label={t('option_fr')} placeholder={t('option_fr')} value={o.label} onChange={(e) => onChange({ ...f, options: f.options!.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
              <button type="button" className="fo-icon" disabled={f.options!.length <= 2} onClick={() => onChange({ ...f, options: f.options!.filter((_, j) => j !== i) })} aria-label={t('remove')} title={t('remove')}>
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="fo-link" onClick={() => onChange({ ...f, options: [...f.options!, { id: newId('o'), label: '' }] })}>
            + {t('add_option')}
          </button>
        </div>
      )}
      {f.type === 'number' && (
        <div className="fo-pair">
          {(['min', 'max'] as const).map((k) => (
            <div className="fo-field" key={k}>
              <label>
                {t(k)}
                <input
                  type="number"
                  value={f[k] ?? ''}
                  onChange={(e) => {
                    const next = { ...f };
                    if (e.target.value === '') delete next[k];
                    else next[k] = Number(e.target.value);
                    onChange(next);
                  }}
                />
              </label>
            </div>
          ))}
        </div>
      )}
      {answerable && (
        <div className="fo-flags">
          <label className="fo-opt">
            <input type="checkbox" checked={f.required} onChange={(e) => onChange({ ...f, required: e.target.checked })} />
            <span>{t('required')}</span>
          </label>
          <label className="fo-opt">
            <input type="checkbox" checked={f.sensitive} onChange={(e) => onChange({ ...f, sensitive: e.target.checked })} />
            <span>{t('sensitive')}</span>
          </label>
        </div>
      )}
    </div>
  );
}

/** Questions from the list; a section has its own button (owner, 2026-10-12). */
function AddField({ lang, onAdd }: { lang: Lang; onAdd: (t: FieldType) => void }) {
  const [type, setType] = useState<FieldType>('text');
  return (
    <div className="fo-add">
      <select value={type} onChange={(e) => setType(e.target.value as FieldType)} aria-label={ft(lang, 'add_field')}>
        {FIELD_TYPES.filter((k) => k !== 'heading').map((k) => (
          <option key={k} value={k}>
            {ft(lang, `type_${k}`)}
          </option>
        ))}
      </select>
      <button type="button" className="fo-btn" onClick={() => onAdd(type)}>
        + {ft(lang, 'add_field')}
      </button>
      <button type="button" className="fo-btn" onClick={() => onAdd('heading')}>
        + {ft(lang, 'add_section')}
      </button>
    </div>
  );
}

function SharePanel(props: {
  lang: Lang;
  shown: Audience;
  restaurants: { id: string; label: string }[];
  people: { email: string; name: string }[];
  roles: { key: 'office' | 'manager' | 'viewer'; label: string }[];
  pending: boolean;
  onSave: (shown: Audience, next: Audience) => void;
}) {
  const { lang, restaurants, people, roles, pending, onSave } = props;
  const t = (k: FormsKey) => ft(lang, k);
  const [shown, setShown] = useState(props.shown);
  const [a, setA] = useState(props.shown);
  const [q, setQ] = useState('');
  const toggle = <K extends keyof Audience>(k: K, v: Audience[K][number]) =>
    setA((x) => ({ ...x, [k]: (x[k] as string[]).includes(v) ? (x[k] as string[]).filter((y) => y !== v) : [...(x[k] as string[]), v].sort() }));
  const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const matches = q.trim() ? people.filter((p) => !a.people.includes(p.email) && fold(`${p.name} ${p.email}`).includes(fold(q.trim()))).slice(0, 8) : [];
  const nameOf = (e: string) => people.find((p) => p.email === e)?.name ?? e;
  const changed = JSON.stringify(a) !== JSON.stringify(shown);

  return (
    <section className="panel fo-form">
      <p className="fo-dim">{t('share_line')}</p>
      <fieldset className="fo-field">
        <legend>{t('share_roles')}</legend>
        {roles.map((r) => (
          <label key={r.key} className="fo-opt">
            <input type="checkbox" checked={a.roles.includes(r.key)} onChange={() => toggle('roles', r.key)} />
            <span>{r.label}</span>
          </label>
        ))}
      </fieldset>
      {a.roles.length > 0 && (
        <fieldset className="fo-field">
          <legend>{t('share_stores')}</legend>
          <p className="fo-help">{t('share_stores_none')}</p>
          <div className="fo-grid">
            {restaurants.map((r) => (
              <label key={r.id} className="fo-opt">
                <input type="checkbox" checked={a.stores.includes(r.id)} onChange={() => toggle('stores', r.id)} />
                <span>{r.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="fo-field">
        <label>
          {t('share_people')}
          <input type="search" placeholder={t('search_people')} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {matches.length > 0 && (
          <ul className="fo-picks">
            {matches.map((p) => (
              <li key={p.email}>
                <button
                  type="button"
                  onClick={() => {
                    toggle('people', p.email);
                    setQ('');
                  }}
                >
                  <b>{p.name}</b> <span className="fo-dim">{p.email}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {a.people.length > 0 && (
          <ul className="fo-chips">
            {a.people.map((e) => (
              <li key={e}>
                {nameOf(e)}
                <button type="button" onClick={() => toggle('people', e)} aria-label={`${t('remove')} ${nameOf(e)}`}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {!a.roles.length && !a.people.length && <p className="fo-dim">{t('shared_nobody')}</p>}
      <div className="fo-actions">
        <button
          type="button"
          className="pbtn"
          disabled={pending || !changed}
          onClick={() => {
            onSave(shown, a);
            setShown(a);
          }}
        >
          {t('share_save')}
        </button>
      </div>
    </section>
  );
}

function SettingsPanel({ lang, shown: initial, pending, onSave }: { lang: Lang; shown: Settings; pending: boolean; onSave: (shown: Settings, next: Settings) => void }) {
  const t = (k: FormsKey) => ft(lang, k);
  const [shown, setShown] = useState(initial);
  const [s, setS] = useState(initial);
  const changed = JSON.stringify(s) !== JSON.stringify(shown);
  const days = (v: string) => (v === '' ? 0 : Math.max(0, Math.floor(Number(v)) || 0));
  return (
    <section className="panel fo-form">
      <div className="fo-field">
        <label>
          {t('notify_email')}
          <input type="email" value={s.notifyEmail ?? ''} onChange={(e) => setS({ ...s, notifyEmail: e.target.value || null })} />
        </label>
      </div>
      <label className="fo-opt">
        <input type="checkbox" checked={s.oncePerPerson} onChange={(e) => setS({ ...s, oncePerPerson: e.target.checked })} />
        <span>{t('once_per_person')}</span>
      </label>
      <div className="fo-pair">
        <div className="fo-field">
          <label>
            {t('sensitive_days')}
            <input type="number" min={0} value={s.sensitiveDays} onChange={(e) => setS({ ...s, sensitiveDays: days(e.target.value) })} />
          </label>
        </div>
        <div className="fo-field">
          <label>
            {t('keep_days')}
            <input type="number" min={0} value={s.keepDays} onChange={(e) => setS({ ...s, keepDays: days(e.target.value) })} />
          </label>
        </div>
      </div>
      <div className="fo-actions">
        <button
          type="button"
          className="pbtn"
          disabled={pending || !changed}
          onClick={() => {
            onSave(shown, s);
            setShown(s);
          }}
        >
          {t('settings_save')}
        </button>
      </div>
    </section>
  );
}

function Duplicate({ lang, id, title, pending, onDone }: { lang: Lang; id: number; title: string; pending: boolean; onDone: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(title);
  const [busy, start] = useTransition();
  if (!open)
    return (
      <button type="button" className="fo-btn" disabled={pending} onClick={() => setOpen(true)}>
        {ft(lang, 'duplicate')}
      </button>
    );
  return (
    <form
      className="fo-inline"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await duplicateFormAction(id, name);
          if (r.outcome === 'done' && r.id) onDone(r.id);
        });
      }}
    >
      <input type="text" aria-label={ft(lang, 'copy_title')} value={name} onChange={(e) => setName(e.target.value)} />
      <button type="submit" className="pbtn" disabled={busy || !name.trim()}>
        {ft(lang, 'duplicate')}
      </button>
      <button type="button" className="fo-btn" onClick={() => setOpen(false)}>
        {ft(lang, 'cancel')}
      </button>
    </form>
  );
}
