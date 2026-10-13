import { describe, expect, it } from 'vitest';
import { checkAnswers, fileAnswers, moveSection, parseDefinition, sections, sensitiveIds, type FormDefinition } from './definition';

// Shaped like the Calypso registration (Jotform 261747485869074).
const calypso = {
  title: 'Calypso 2026',
  intro: 'Inscription à la journée Calypso.',
  fields: [
    { id: 'contact', type: 'heading', label: 'Coordonnées' },
    { id: 'phone', type: 'phone', label: 'Téléphone', required: true, sensitive: true },
    { id: 'emergency', type: 'text', label: 'Contact d’urgence', required: true, sensitive: true },
    { id: 'guests', type: 'number', label: 'Invités', min: 0, max: 4 },
    { id: 'day', type: 'date', label: 'Date' },
    { id: 'bus', type: 'choice', label: 'Transport', required: true, options: [{ id: 'yes', label: 'Autobus' }, { id: 'no', label: 'Par mes moyens' }] },
    { id: 'size', type: 'choices', label: 'Tailles', options: [{ id: 's', label: 'P' }, { id: 'm', label: 'M' }, { id: 'l', label: 'G' }] },
    { id: 'mail', type: 'email', label: 'Courriel' },
    { id: 'rule1', type: 'agree', label: 'J’autorise la retenue sur ma paie.', required: true },
  ],
  signature: true,
};

const def = (): FormDefinition => {
  const r = parseDefinition(calypso);
  if (!r.ok) throw new Error(r.errors.join());
  return r.definition;
};

const good = { phone: '(819) 555-0101', emergency: 'Marie, 819 555 0102', guests: '2', day: '2026-07-14', bus: 'yes', size: ['m', 's'], mail: 'Marie@Example.com', rule1: true };

describe('parseDefinition', () => {
  it('reads a whole form and keeps only what it knows', () => {
    const r = parseDefinition({ ...calypso, extra: 'x', fields: [{ ...calypso.fields[1], script: '<x>' }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.definition).not.toHaveProperty('extra');
    expect(r.definition.fields[0]).toEqual({ id: 'phone', type: 'phone', label: 'Téléphone', required: true, sensitive: true });
  });

  it('refuses what cannot be shown or answered', () => {
    const bad = (patch: object, fieldPatch?: object) =>
      parseDefinition({ ...calypso, ...(fieldPatch ? { fields: [{ ...calypso.fields[5], ...fieldPatch }] } : {}), ...patch });
    expect(bad({ title: '  ' }).ok).toBe(false);
    expect(bad({ title: 42 }).ok).toBe(false);
    expect(bad({ fields: 'nope' }).ok).toBe(false);
    expect(bad({}, { type: 'signature-pad' }).ok).toBe(false);
    expect(bad({}, { id: 'Has Spaces' }).ok).toBe(false);
    expect(bad({}, { options: [{ id: 'only', label: 'Une' }] }).ok).toBe(false);
    expect(bad({}, { options: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }] }).ok).toBe(false);
    expect(parseDefinition({ ...calypso, fields: [calypso.fields[1], calypso.fields[1]] }).ok).toBe(false);
    expect(parseDefinition({ ...calypso, fields: [{ ...calypso.fields[3], min: 5, max: 1 }] }).ok).toBe(false);
    expect(parseDefinition({ ...calypso, fields: Array.from({ length: 101 }, (_, i) => ({ id: `f${i}`, type: 'text', label: 'x' })) }).ok).toBe(false);
  });

  it('a form stored as { fr, en } still reads, in French only', () => {
    const r = parseDefinition({ ...calypso, title: { fr: 'Calypso', en: 'Calypso EN' }, fields: [{ id: 'bus', type: 'choice', label: { fr: 'Transport', en: 'Transport EN' }, help: { fr: 'Aide' }, options: [{ id: 'a', label: { fr: 'A', en: 'A EN' } }, { id: 'b', label: { fr: 'B' } }] }] });
    expect(r.ok && r.definition.title).toBe('Calypso');
    expect(r.ok && r.definition.fields[0]).toMatchObject({ label: 'Transport', help: 'Aide', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] });
  });

  it('half width is kept on a question, never on a section, and only when exactly true', () => {
    const r = parseDefinition({ ...calypso, fields: [{ ...calypso.fields[1], half: true }, { ...calypso.fields[2], half: 'yes' }, { ...calypso.fields[0], half: true }] });
    expect(r.ok && r.definition.fields.map((f) => f.half)).toEqual([true, undefined, undefined]);
  });

  it('a dropdown needs options like a single choice, and takes one of them', () => {
    const select = { id: 'prov', type: 'select', label: 'Province', required: true, options: [{ id: 'qc', label: 'Québec' }, { id: 'on', label: 'Ontario' }] };
    expect(parseDefinition({ ...calypso, fields: [{ ...select, options: [select.options[0]] }] }).ok).toBe(false);
    const r = parseDefinition({ ...calypso, signature: false, fields: [select] });
    if (!r.ok) throw new Error('select');
    expect(checkAnswers(r.definition, { prov: 'on' }, null)).toEqual({ ok: true, answers: { prov: 'on' }, signedName: null });
    expect(checkAnswers(r.definition, { prov: 'bc' }, null)).toEqual({ ok: false, errors: { prov: 'invalid' } });
    expect(checkAnswers(r.definition, { prov: '' }, null)).toEqual({ ok: false, errors: { prov: 'required' } });
  });

  it('a file answer is a list of up to 5 distinct file ids; which files they are is submit()’s to check', () => {
    const r = parseDefinition({ ...calypso, signature: false, fields: [{ id: 'cv', type: 'file', label: 'CV', required: true }] });
    if (!r.ok) throw new Error('file');
    expect(checkAnswers(r.definition, { cv: ['12', '13'] }, null)).toEqual({ ok: true, answers: { cv: ['12', '13'] }, signedName: null });
    for (const bad of [['12', '12'], ['1', '2', '3', '4', '5', '6'], [12], ['x'], ['../1'], '12'])
      expect(checkAnswers(r.definition, { cv: bad }, null), JSON.stringify(bad)).toEqual({ ok: false, errors: { cv: 'invalid' } });
    expect(checkAnswers(r.definition, { cv: [] }, null)).toEqual({ ok: false, errors: { cv: 'required' } });
    expect(fileAnswers(r.definition, { cv: ['12', '13'], other: ['9'] })).toEqual([{ fieldId: 'cv', ids: [12, 13] }]);
  });

  it('a header colour is kept on a section and the title, only from the palette, never on a question', () => {
    const r = parseDefinition({
      ...calypso,
      titleColor: 'rouge',
      fields: [
        { id: 'h1', type: 'heading', label: 'Perso', color: 'bleu' },
        { id: 'h2', type: 'heading', label: 'Quals', color: '#ff00ff' },
        { id: 'h3', type: 'heading', label: 'Autre', color: 'constructor' },
        { ...calypso.fields[1], color: 'vert' },
      ],
    });
    if (!r.ok) throw new Error('colours');
    expect(r.definition.titleColor).toBe('rouge');
    expect(r.definition.fields.map((f) => f.color)).toEqual(['bleu', undefined, undefined, undefined]);
    const plain = parseDefinition({ ...calypso, titleColor: 'url(javascript:x)' });
    expect(plain.ok && plain.definition).not.toHaveProperty('titleColor');
  });

  it('a heading is never required nor sensitive', () => {
    const r = parseDefinition({ ...calypso, fields: [{ id: 'h', type: 'heading', label: 'Titre', required: true, sensitive: true }] });
    expect(r.ok && r.definition.fields[0]).toMatchObject({ required: false, sensitive: false });
  });
});

describe('checkAnswers', () => {
  it('normalises good answers and drops what was not asked', () => {
    const r = checkAnswers(def(), { ...good, injected: 'x', contact: 'heading has no answer' }, '  Marie   Tremblay ');
    expect(r).toEqual({
      ok: true,
      signedName: 'Marie Tremblay',
      answers: { phone: '8195550101', emergency: 'Marie, 819 555 0102', guests: 2, day: '2026-07-14', bus: 'yes', size: ['s', 'm'], mail: 'marie@example.com', rule1: true },
    });
  });

  it('a required field left empty, or "I agree" unticked, is refused', () => {
    const r = checkAnswers(def(), { ...good, phone: '  ', bus: undefined, rule1: false }, 'Marie');
    expect(r.ok === false && r.errors).toEqual({ phone: 'required', bus: 'required', rule1: 'required' });
  });

  it('a signature is required when the form asks for one', () => {
    expect(checkAnswers(def(), good, '   ')).toMatchObject({ ok: false, errors: { signature: 'required' } });
    expect(checkAnswers(def(), good, 'x'.repeat(121))).toMatchObject({ ok: false, errors: { signature: 'too_long' } });
    expect(checkAnswers({ ...def(), signature: false }, good, undefined)).toMatchObject({ ok: true, signedName: null });
  });

  it('refuses values the field cannot hold', () => {
    const errs = (patch: object) => {
      const r = checkAnswers(def(), { ...good, ...patch }, 'Marie');
      return r.ok ? {} : r.errors;
    };
    expect(errs({ phone: '555-01' })).toEqual({ phone: 'invalid' });
    expect(errs({ phone: 'call me' })).toEqual({ phone: 'invalid' });
    expect(errs({ guests: '5' })).toEqual({ guests: 'invalid' });
    expect(errs({ guests: 'two' })).toEqual({ guests: 'invalid' });
    expect(errs({ day: '2026-02-30' })).toEqual({ day: 'invalid' });
    expect(errs({ bus: 'maybe' })).toEqual({ bus: 'invalid' });
    expect(errs({ size: ['m', 'xl'] })).toEqual({ size: 'invalid' });
    expect(errs({ size: 'm' })).toEqual({ size: 'invalid' });
    expect(errs({ mail: 'not-an-email' })).toEqual({ mail: 'invalid' });
    expect(errs({ rule1: 'true' })).toEqual({ rule1: 'invalid' });
    expect(errs({ emergency: 'x'.repeat(201) })).toEqual({ emergency: 'too_long' });
    expect(errs({ emergency: { $ne: 1 } })).toEqual({ emergency: 'invalid' });
  });

  it('nothing at all is every required field missing, never a crash', () => {
    const r = checkAnswers(def(), null, null);
    expect(r.ok === false && Object.keys(r.errors).sort()).toEqual(['bus', 'emergency', 'phone', 'rule1', 'signature']);
  });
});

describe('helpers', () => {
  it('the sensitive fields are the ones marked', () => {
    expect(sensitiveIds(def())).toEqual(['phone', 'emergency']);
  });

  it('a section is a heading and the questions after it', () => {
    const fields = def().fields;
    const loose = { ...fields[1], id: 'loose' };
    const got = sections([loose, ...fields]).map((s) => [s.head?.id ?? null, s.fields.map((f) => f.id)]);
    expect(got).toEqual([
      [null, ['loose']],
      ['contact', ['phone', 'emergency', 'guests', 'day', 'bus', 'size', 'mail', 'rule1']],
    ]);
    expect(sections([])).toEqual([]);
  });
});

describe('moving a section', () => {
  const q = (id: string) => ({ id, type: 'text' as const, label: id, required: false, sensitive: false });
  const h = (id: string) => ({ ...q(id), type: 'heading' as const });
  const ids = (fs: { id: string }[] | null) => fs && fs.map((f) => f.id);
  const form = [q('loose'), h('perso'), q('name'), q('phone'), h('quals'), q('diploma'), h('end')];

  it('takes its questions with it', () => {
    expect(ids(moveSection(form, 4, -1))).toEqual(['loose', 'quals', 'diploma', 'perso', 'name', 'phone', 'end']);
    expect(ids(moveSection(form, 1, 1))).toEqual(['loose', 'quals', 'diploma', 'perso', 'name', 'phone', 'end']);
    expect(ids(moveSection(form, 6, -1))).toEqual(['loose', 'perso', 'name', 'phone', 'end', 'quals', 'diploma']);
  });

  it('never past the ends, above questions with no section, or from a question', () => {
    expect(moveSection(form, 1, -1)).toBeNull();
    expect(moveSection(form, 6, 1)).toBeNull();
    expect(moveSection(form, 2, 1)).toBeNull();
    expect(ids(moveSection(form.slice(1), 0, 1))).toEqual(['quals', 'diploma', 'perso', 'name', 'phone', 'end']);
  });
});
