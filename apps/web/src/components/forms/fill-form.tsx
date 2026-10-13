'use client';

import { submitFormAction } from '@/app/forms/actions';
import { ArchesSvg } from '@/components/arches';
import { sections, type Field, type FormDefinition, type Value } from '@/lib/forms/definition';
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
      <Title>{definition.title}</Title>
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
            <span className="fo-req">{ft(lang, 'required_mark')}</span>
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
            {sec.fields.map((f) => (
              <FieldInput key={f.id} lang={lang} field={f} value={answers[f.id]} error={errors[f.id]} onChange={(v) => set(f.id, v)} />
            ))}
          </div>
        );
        if (!sec.head) return <Fragment key={i}>{inputs}</Fragment>;
        return (
          <section key={sec.head.id} className="fo-section" aria-labelledby={`fo-${sec.head.id}`}>
            <div className="fo-section-head">
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
            <span className="fo-req">{ft(lang, 'required_mark')}</span>
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
        <button className="pbtn" type="submit" disabled={pending || preview}>
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
  const req = field.required ? <span className="fo-req">{ft(lang, 'required_mark')}</span> : null;
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
  const common = { id, value: text, onChange: (e: { target: { value: string } }) => onChange(e.target.value) };
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
