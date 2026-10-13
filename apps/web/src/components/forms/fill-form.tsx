'use client';

import { removeFormFileAction, submitFormAction, uploadFormFileAction } from '@/app/forms/actions';
import { ArchesSvg } from '@/components/arches';
import { HEADER_COLORS, sections, type Field, type FormDefinition, type Value } from '@/lib/forms/definition';
import { ft, type FormsKey } from '@/lib/forms/i18n';
import type { Lang } from '@/lib/i18n';
import { Fragment, useState, useTransition } from 'react';

interface Props {
  lang: Lang;
  formId: number;
  version: number;
  definition: FormDefinition;
  already: boolean;
  person: { name: string; number: string | null; email: string };
  stores: { id: string; label: string }[];
  /** HR's preview of a draft: drawn exactly as it will be filled, never sent. */
  preview?: boolean;
}

/**
 * The form as the person fills it. The browser's checks are a convenience: the server
 * checks every answer again against the version (lib/forms/definition.ts) and says which
 * fields to fix.
 */
export function FillForm({ lang, formId, version, definition, already, person, stores, preview = false }: Props) {
  const [answers, setAnswers] = useState<Record<string, Value>>({});
  const [signedName, setSignedName] = useState('');
  const [store, setStore] = useState(stores.length === 1 ? stores[0].id : '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<FormsKey | null>(already ? 'already' : null);
  const [done, setDone] = useState(already);
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(0);

  const set = (id: string, v: Value | undefined) =>
    setAnswers((a) => {
      const next = { ...a };
      if (v === undefined || v === '') delete next[id];
      else next[id] = v;
      return next;
    });

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (preview) return;
    start(async () => {
      const out = await submitFormAction(formId, version, answers, signedName, store);
      if (out.outcome === 'done' || out.outcome === 'already') {
        setDone(true);
        setErrors({});
        setMessage(out.outcome === 'done' ? 'sent' : 'already');
        window.scrollTo({ top: 0 });
        return;
      }
      if (out.outcome === 'invalid') {
        setErrors(out.errors);
        setMessage('err_fix');
        return;
      }
      if (out.outcome === 'expired') {
        window.location.reload();
        return;
      }
      setMessage(`err_${out.outcome}` as FormsKey);
    });
  }

  // The Arches, centred above the title (owner, 2026-10-13: like the Jotform forms, at
  // three quarters of their logo). The one instance on the page (MCDONALDS_BRAND_USAGE.md:
  // one per screen, gold, unmodified, clear space of two legs).
  const Title = preview ? 'h2' : 'h1';
  const masthead = (
    <header className="fo-masthead">
      <div className="fo-logo">
        <ArchesSvg />
      </div>
      <Title className={definition.titleColor ? 'fo-band' : undefined} style={definition.titleColor ? { background: HEADER_COLORS[definition.titleColor] } : undefined}>
        {definition.title}
      </Title>
    </header>
  );

  if (done)
    return (
      <>
        {masthead}
        <p className="fo-ok" role="status">
          {ft(lang, message ?? 'sent')}
        </p>
      </>
    );

  return (
    <form className="fo-form" onSubmit={send} noValidate>
      {masthead}
      {definition.intro && <p className="fo-intro">{definition.intro}</p>}
      {(definition.signature || stores.length > 1 || definition.fields.some((f) => f.required)) && (
        <p className="fo-dim">
          {ft(lang, 'required_note_before')}
          <span className="fo-req" aria-hidden="true">
            *
          </span>{' '}
          {ft(lang, 'required_note_after')}
        </p>
      )}

      <div>
        <div className="ph">
          <div>
            <h2>{ft(lang, 'you')}</h2>
            <p>{ft(lang, 'you_line')}</p>
          </div>
        </div>
        <dl className="fo-who">
          <div>
            <dt>{ft(lang, 'name')}</dt>
            <dd>{person.name}</dd>
          </div>
          {person.number && (
            <div>
              <dt>{ft(lang, 'number')}</dt>
              <dd>{person.number}</dd>
            </div>
          )}
          <div>
            <dt>{ft(lang, 'email')}</dt>
            <dd>{person.email}</dd>
          </div>
          {stores.length === 1 && (
            <div>
              <dt>{ft(lang, 'restaurant')}</dt>
              <dd>{stores[0].label}</dd>
            </div>
          )}
        </dl>
      </div>

      {stores.length > 1 && (
        <div className="fo-field">
          <label htmlFor="fo-store">
            {ft(lang, 'restaurant')}
            <Req lang={lang} />
          </label>
          <select id="fo-store" value={store} onChange={(e) => setStore(e.target.value)} required>
            <option value="">{ft(lang, 'choose')}</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {sections(definition.fields).map((sec, i) => {
        const inputs = (
          <div className="fo-cols">
            {sec.fields.map((f) =>
              f.type === 'file' ? (
                <FileField key={f.id} lang={lang} formId={formId} field={f} error={errors[f.id]} preview={preview} onBusy={(d) => setUploading((n) => n + d)} onChange={(v) => set(f.id, v)} />
              ) : (
                <FieldInput key={f.id} lang={lang} field={f} value={answers[f.id]} error={errors[f.id]} onChange={(v) => set(f.id, v)} />
              ),
            )}
          </div>
        );
        if (!sec.head) return <Fragment key={i}>{inputs}</Fragment>;
        return (
          <section key={sec.head.id} className="fo-section" aria-labelledby={`fo-${sec.head.id}`}>
            <div className={`fo-section-head${sec.head.color ? ' fo-band' : ''}`} style={sec.head.color ? { background: HEADER_COLORS[sec.head.color] } : undefined}>
              <h2 id={`fo-${sec.head.id}`}>{sec.head.label}</h2>
              {sec.head.help && <p>{sec.head.help}</p>}
            </div>
            {inputs}
          </section>
        );
      })}

      {definition.signature && (
        <div className={`fo-field${errors.signature ? ' has-error' : ''}`}>
          <div className="fo-heading">
            <h2>{ft(lang, 'signature')}</h2>
            <p>{ft(lang, 'signature_line')}</p>
          </div>
          <label htmlFor="fo-sign">
            {ft(lang, 'signed_name')}
            <Req lang={lang} />
          </label>
          <input id="fo-sign" type="text" autoComplete="name" maxLength={120} value={signedName} onChange={(e) => setSignedName(e.target.value)} />
          {errors.signature && <p className="fo-err">{ft(lang, `err_${errors.signature}` as FormsKey)}</p>}
        </div>
      )}

      {message && (
        <p className="gp-err" role="alert">
          {ft(lang, message)}
        </p>
      )}
      {preview && <p className="fo-dim">{ft(lang, 'preview_note')}</p>}
      <div className="fo-actions">
        <button className="pbtn" type="submit" disabled={pending || preview || uploading > 0}>
          {ft(lang, pending ? 'sending' : 'send')}
        </button>
      </div>
    </form>
  );
}

function FieldInput({ lang, field, value, error, onChange }: { lang: Lang; field: Field; value: Value | undefined; error?: string; onChange: (v: Value | undefined) => void }) {
  const id = `fo-${field.id}`;
  const label = field.label;
  const help = field.help ? <p className="fo-help">{field.help}</p> : null;
  const req = field.required ? <Req lang={lang} /> : null;
  const err = error ? <p className="fo-err">{ft(lang, `err_${error}` as FormsKey)}</p> : null;
  const cls = `fo-field${field.half ? ' is-half' : ''}${error ? ' has-error' : ''}`;

  if (field.type === 'agree') {
    return (
      <div className={cls}>
        <label className="fo-opt">
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked ? true : undefined)} />
          <span>
            {label}
            {req}
          </span>
        </label>
        {help}
        {err}
      </div>
    );
  }
  if (field.type === 'choice' || field.type === 'choices') {
    const many = field.type === 'choices';
    const picked = Array.isArray(value) ? value : [];
    return (
      <fieldset className={cls}>
        <legend>
          {label}
          {req}
        </legend>
        {help}
        {field.options!.map((o) => (
          <label key={o.id} className="fo-opt">
            <input
              type={many ? 'checkbox' : 'radio'}
              name={id}
              checked={many ? picked.includes(o.id) : value === o.id}
              onChange={(e) => onChange(many ? (e.target.checked ? [...picked, o.id] : picked.filter((p) => p !== o.id)) : o.id)}
            />
            <span>{o.label}</span>
          </label>
        ))}
        {err}
      </fieldset>
    );
  }
  const text = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  if (field.type === 'select') {
    return (
      <div className={cls}>
        <label htmlFor={id}>
          {label}
          {req}
        </label>
        {help}
        <select id={id} value={text} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">{ft(lang, 'choose')}</option>
          {field.options!.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        {err}
      </div>
    );
  }
  const common = {
    id,
    value: text,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
  };
  return (
    <div className={cls}>
      <label htmlFor={id}>
        {label}
        {req}
      </label>
      {help}
      {field.type === 'textarea' ? (
        <textarea {...common} maxLength={4000} />
      ) : (
        <input
          {...common}
          type={field.type === 'phone' ? 'tel' : field.type === 'email' ? 'email' : field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
          inputMode={field.type === 'phone' ? 'tel' : field.type === 'number' ? 'decimal' : undefined}
          min={field.min}
          max={field.max}
          maxLength={field.type === 'text' ? 200 : undefined}
        />
      )}
      {err}
    </div>
  );
}

/** A red asterisk (owner, 2026-10-13); a screen reader hears "obligatoire" instead. */
function Req({ lang }: { lang: Lang }) {
  return (
    <span className="fo-req">
      <span aria-hidden="true">*</span>
      <span className="fo-hide">{ft(lang, 'required_mark')}</span>
    </span>
  );
}

type UploadError = 'file_too_large' | 'file_type_not_allowed' | 'file_too_many' | 'file_upload_failed' | 'err_denied' | 'err_not_open';

/**
 * A file question: each file is uploaded as soon as it is picked and staged on the server
 * (lib/forms/files.ts); the answer is their ids, linked when the form is sent. Photos are
 * shrunk here first, so a phone photo fits under the 4 MB a request may carry.
 */
function FileField(props: { lang: Lang; formId: number; field: Field; error?: string; preview: boolean; onBusy: (delta: number) => void; onChange: (v: Value | undefined) => void }) {
  const { lang, formId, field, error, preview, onBusy, onChange } = props;
  const [files, setFiles] = useState<{ id: string; fileName: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<UploadError | null>(null);
  const id = `fo-${field.id}`;
  const full = files.length >= 5;

  const update = (next: { id: string; fileName: string }[]) => {
    setFiles(next);
    onChange(next.length ? next.map((f) => f.id) : undefined);
  };

  async function pick(list: FileList | null) {
    if (!list?.length || preview) return;
    setProblem(null);
    setBusy(true);
    onBusy(1);
    let current = files;
    try {
      for (const picked of [...list].slice(0, 5 - current.length)) {
        const data = new FormData();
        data.set('formId', String(formId));
        data.set('fieldId', field.id);
        data.set('file', await shrink(picked));
        const out = await uploadFormFileAction(data);
        if (out.outcome === 'done') {
          current = [...current, out.file];
          update(current);
          continue;
        }
        if (out.outcome === 'expired') return window.location.reload();
        const known: Partial<Record<string, UploadError>> = {
          too_large: 'file_too_large',
          type_not_allowed: 'file_type_not_allowed',
          too_many: 'file_too_many',
          denied: 'err_denied',
          not_open: 'err_not_open',
        };
        setProblem(known[out.outcome] ?? 'file_upload_failed');
        break;
      }
    } catch {
      setProblem('file_upload_failed');
    } finally {
      setBusy(false);
      onBusy(-1);
    }
  }

  async function drop(fileId: string) {
    update(files.filter((f) => f.id !== fileId));
    await removeFormFileAction(fileId).catch(() => null);
  }

  return (
    <div className={`fo-field${field.half ? ' is-half' : ''}${error || problem ? ' has-error' : ''}`}>
      <label htmlFor={id}>
        {field.label}
        {field.required && <Req lang={lang} />}
      </label>
      {field.help && <p className="fo-help">{field.help}</p>}
      {files.length > 0 && (
        <ul className="fo-files">
          {files.map((f) => (
            <li key={f.id}>
              <a href={`/forms/files/${f.id}`} target="_blank" rel="noopener">
                {f.fileName}
              </a>
              <button type="button" className="fo-icon" onClick={() => drop(f.id)} aria-label={`${ft(lang, 'remove')} ${f.fileName}`} title={ft(lang, 'remove')}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {!full && (
        <label className={`fo-btn fo-filebtn${busy || preview ? ' is-off' : ''}`}>
          {ft(lang, busy ? 'file_uploading' : 'file_add')}
          <input
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
            multiple
            disabled={busy || preview}
            onChange={(e) => {
              void pick(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      )}
      <p className="fo-help">{ft(lang, preview ? 'file_preview_off' : 'file_hint')}</p>
      {problem && <p className="fo-err">{ft(lang, problem)}</p>}
      {error && <p className="fo-err">{ft(lang, `err_${error}` as FormsKey)}</p>}
    </div>
  );
}

/**
 * A photo, made at most 2000 pixels on its long side and re-saved as JPEG when that is
 * smaller: a 5 MB phone photo becomes about half a megabyte and stays readable. Anything
 * the browser cannot draw (a PDF, HEIC outside Safari) goes as it is.
 */
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size < 1_000_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {
      type: 'image/jpeg',
    });
  } catch {
    return file;
  }
}
