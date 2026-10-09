'use client';

import { submitFormAction } from '@/app/forms/actions';
import { say, type Field, type FormDefinition, type Value } from '@/lib/forms/definition';
import { ft, type FormsKey } from '@/lib/forms/i18n';
import type { Lang } from '@/lib/i18n';
import { useState, useTransition } from 'react';

interface Props {
  lang: Lang;
  formId: number;
  version: number;
  definition: FormDefinition;
  already: boolean;
  person: { name: string; number: string | null; email: string };
  stores: { id: string; label: string }[];
}

/**
 * The form as the person fills it. The browser's checks are a convenience: the server
 * checks every answer again against the version (lib/forms/definition.ts) and says which
 * fields to fix.
 */
export function FillForm({ lang, formId, version, definition, already, person, stores }: Props) {
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

  if (done) return <p className="fo-ok" role="status">{ft(lang, message ?? 'sent')}</p>;

  return (
    <form className="fo-form" onSubmit={send} noValidate>
      {definition.intro && <p className="fo-intro">{say(definition.intro, lang)}</p>}

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

      {definition.fields.map((f) => (
        <FieldInput key={f.id} lang={lang} field={f} value={answers[f.id]} error={errors[f.id]} onChange={(v) => set(f.id, v)} />
      ))}

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
      <div className="fo-actions">
        <button className="pbtn" type="submit" disabled={pending}>
          {ft(lang, pending ? 'sending' : 'send')}
        </button>
      </div>
    </form>
  );
}

function FieldInput({ lang, field, value, error, onChange }: { lang: Lang; field: Field; value: Value | undefined; error?: string; onChange: (v: Value | undefined) => void }) {
  const id = `fo-${field.id}`;
  const label = say(field.label, lang);
  const help = field.help ? <p className="fo-help">{say(field.help, lang)}</p> : null;
  const req = field.required ? <span className="fo-req">{ft(lang, 'required_mark')}</span> : null;
  const err = error ? <p className="fo-err">{ft(lang, `err_${error}` as FormsKey)}</p> : null;
  const cls = `fo-field${error ? ' has-error' : ''}`;

  if (field.type === 'heading') {
    return (
      <div className="fo-heading">
        <h2>{label}</h2>
        {field.help && <p>{say(field.help, lang)}</p>}
      </div>
    );
  }
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
            <span>{say(o.label, lang)}</span>
          </label>
        ))}
        {err}
      </fieldset>
    );
  }
  const text = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
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
