/**
 * What a form is, and what a valid answer to it is. Pure: no database, no request, so
 * every rule is tested on its own (definition.test.ts).
 *
 * A definition is written by HR on a screen and stored as jsonb, so it is never trusted:
 * parseDefinition() checks it on every write AND every read. Answers come from a public
 * endpoint (CLAUDE.md §3), so checkAnswers() rebuilds them from the definition and keeps
 * nothing the definition does not ask for; the browser's checks are a convenience.
 *
 * The field types are a fixed set (owner, 2026-10-09: a list of fields, not a
 * drag-and-drop builder). Not yet: a field shown only when another answer says so, and
 * file uploads.
 *
 * HR writes forms in French only (owner, 2026-10-12: "we are a French company"). The
 * language toggle changes the page around the form, never what HR wrote. Text used to be
 * { fr, en? }; a definition stored that way is still read, keeping its French.
 */

export const FIELD_TYPES = ['heading', 'text', 'textarea', 'number', 'date', 'phone', 'email', 'choice', 'choices', 'agree'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface Option {
  id: string;
  label: string;
}

export interface Field {
  id: string;
  type: FieldType;
  label: string;
  help?: string;
  required: boolean;
  /** Cleared after the form closes (Law 25): phones, emergency contacts. */
  sensitive: boolean;
  /** For choice and choices. */
  options?: Option[];
  /** For number. */
  min?: number;
  max?: number;
}

export interface FormDefinition {
  title: string;
  intro?: string;
  fields: Field[];
  /** Ends with "I agree" and the person's typed name (owner, 2026-10-09: no drawing). */
  signature: boolean;
}

export const LIMITS = { fields: 100, options: 50, label: 300, help: 1000, intro: 4000, text: 200, textarea: 4000, signedName: 120 } as const;

const ID = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A text, trimmed: null if invalid, undefined if absent and allowed to be. An old { fr, en } keeps its French. */
function cleanText(v: unknown, max: number, required: boolean): string | null | undefined {
  if (isObj(v)) v = v.fr;
  if (v == null) return required ? null : undefined;
  if (typeof v !== 'string') return null;
  const text = v.trim();
  if (!text) return required ? null : undefined;
  return text.length > max ? null : text;
}

export type DefinitionResult = { ok: true; definition: FormDefinition } | { ok: false; errors: string[] };

/** Checks a definition, and returns a clean copy holding only what is known. */
export function parseDefinition(raw: unknown): DefinitionResult {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ['not_an_object'] };
  const title = cleanText(raw.title, LIMITS.label, true);
  if (!title) errors.push('title');
  const intro = cleanText(raw.intro, LIMITS.intro, false);
  if (intro === null) errors.push('intro');
  const list = Array.isArray(raw.fields) ? raw.fields : null;
  if (!list) errors.push('fields');
  else if (list.length > LIMITS.fields) errors.push('too_many_fields');

  const fields: Field[] = [];
  const seen = new Set<string>();
  for (const [i, f] of (list ?? []).entries()) {
    const at = `field_${i}`;
    if (!isObj(f)) {
      errors.push(at);
      continue;
    }
    const id = typeof f.id === 'string' ? f.id : '';
    if (!ID.test(id) || seen.has(id)) errors.push(`${at}.id`);
    seen.add(id);
    const type = f.type as FieldType;
    if (!FIELD_TYPES.includes(type)) {
      errors.push(`${at}.type`);
      continue;
    }
    const label = cleanText(f.label, type === 'heading' || type === 'agree' ? LIMITS.help : LIMITS.label, true);
    if (!label) errors.push(`${at}.label`);
    const help = cleanText(f.help, LIMITS.help, false);
    if (help === null) errors.push(`${at}.help`);
    const field: Field = { id, type, label: label ?? '', required: type !== 'heading' && f.required === true, sensitive: type !== 'heading' && f.sensitive === true };
    if (help) field.help = help;

    if (type === 'choice' || type === 'choices') {
      const opts = Array.isArray(f.options) ? f.options : [];
      const ids = new Set<string>();
      const options: Option[] = [];
      for (const o of opts) {
        const oid = isObj(o) && typeof o.id === 'string' ? o.id : '';
        const olabel = isObj(o) ? cleanText(o.label, LIMITS.label, true) : null;
        if (!ID.test(oid) || ids.has(oid) || !olabel) {
          errors.push(`${at}.options`);
          break;
        }
        ids.add(oid);
        options.push({ id: oid, label: olabel });
      }
      if (options.length < 2 || options.length > LIMITS.options) errors.push(`${at}.options`);
      field.options = options;
    }
    if (type === 'number') {
      for (const k of ['min', 'max'] as const) {
        const v = f[k];
        if (v == null) continue;
        if (typeof v !== 'number' || !Number.isFinite(v)) errors.push(`${at}.${k}`);
        else field[k] = v;
      }
      if (field.min != null && field.max != null && field.min > field.max) errors.push(`${at}.range`);
    }
    fields.push(field);
  }
  if (errors.length) return { ok: false, errors: [...new Set(errors)] };
  const definition: FormDefinition = { title: title!, fields, signature: raw.signature === true };
  if (intro) definition.intro = intro;
  return { ok: true, definition };
}

/** Nothing asked yet: the draft a new form starts from. */
export function emptyDefinition(title: string): FormDefinition {
  return { title, fields: [], signature: true };
}

export type Value = string | number | boolean | string[];
export type Answers = Record<string, Value>;
export type AnswerError = 'required' | 'invalid' | 'too_long';
export type AnswerResult =
  | { ok: true; answers: Answers; signedName: string | null }
  | { ok: false; errors: Record<string, AnswerError> };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function validDate(s: string): boolean {
  const m = DATE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** One answer, or why not. `undefined` means not answered. */
function checkOne(field: Field, raw: unknown): { value?: Value; error?: AnswerError } {
  const str = typeof raw === 'string' ? raw.trim() : typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : null;
  switch (field.type) {
    case 'heading':
      return {};
    case 'text':
    case 'textarea': {
      if (raw == null || str === '') return {};
      if (str === null) return { error: 'invalid' };
      return str.length > LIMITS[field.type] ? { error: 'too_long' } : { value: str };
    }
    case 'number': {
      if (raw == null || str === '') return {};
      const n = str === null ? NaN : Number(str.replace(',', '.'));
      if (!Number.isFinite(n)) return { error: 'invalid' };
      if ((field.min != null && n < field.min) || (field.max != null && n > field.max)) return { error: 'invalid' };
      return { value: n };
    }
    case 'date':
      if (raw == null || str === '') return {};
      return str !== null && validDate(str) ? { value: str } : { error: 'invalid' };
    case 'phone': {
      if (raw == null || str === '') return {};
      if (str === null || !/^[\d\s().+-]+$/.test(str)) return { error: 'invalid' };
      const digits = str.replace(/\D/g, '');
      return digits.length >= 10 && digits.length <= 15 ? { value: digits } : { error: 'invalid' };
    }
    case 'email':
      if (raw == null || str === '') return {};
      return str !== null && str.length <= 254 && EMAIL.test(str) ? { value: str.toLowerCase() } : { error: 'invalid' };
    case 'choice': {
      if (raw == null || str === '') return {};
      return field.options!.some((o) => o.id === str) ? { value: str! } : { error: 'invalid' };
    }
    case 'choices': {
      if (raw == null) return {};
      if (!Array.isArray(raw) || !raw.every((v) => typeof v === 'string')) return { error: 'invalid' };
      const picked = field.options!.map((o) => o.id).filter((id) => raw.includes(id));
      if (picked.length !== new Set(raw).size) return { error: 'invalid' };
      return picked.length ? { value: picked } : {};
    }
    case 'agree':
      if (raw == null || raw === false) return {};
      return raw === true ? { value: true } : { error: 'invalid' };
  }
}

/**
 * Rebuilds the answers from the definition: unknown keys are dropped, every value is
 * checked and normalised (a phone becomes its digits, an email lower case), and a
 * required field left empty is an error. With a signature, `signedName` is required.
 */
export function checkAnswers(def: FormDefinition, raw: unknown, signedName: unknown): AnswerResult {
  const input = isObj(raw) ? raw : {};
  const answers: Answers = {};
  const errors: Record<string, AnswerError> = {};
  for (const field of def.fields) {
    const { value, error } = checkOne(field, Object.hasOwn(input, field.id) ? input[field.id] : undefined);
    if (error) errors[field.id] = error;
    else if (value !== undefined) answers[field.id] = value;
    else if (field.required) errors[field.id] = 'required';
  }
  let name: string | null = null;
  if (def.signature) {
    name = typeof signedName === 'string' ? signedName.trim().replace(/\s+/g, ' ') : '';
    if (!name) errors.signature = 'required';
    else if (name.length > LIMITS.signedName) errors.signature = 'too_long';
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, answers, signedName: name };
}

/**
 * A form's sections (owner, 2026-10-12: "Informations personnelles", then "Qualifications"...).
 * A section is a heading and the questions after it, up to the next heading; questions
 * before the first heading have no section. Stored as a flat list, so a version answered
 * before sections existed reads the same.
 */
export interface Section {
  head?: Field;
  fields: Field[];
}

export function sections(fields: Field[]): Section[] {
  const out: Section[] = [];
  for (const f of fields) {
    if (f.type === 'heading') out.push({ head: f, fields: [] });
    else if (out.length) out.at(-1)!.fields.push(f);
    else out.push({ fields: [f] });
  }
  return out;
}

/**
 * Moves the section headed at `i` with all its questions, one section up (-1) or down (1).
 * Null if it cannot go there: past the ends, or above questions that have no section
 * (they would silently join it).
 */
export function moveSection(fields: Field[], i: number, by: -1 | 1): Field[] | null {
  if (fields[i]?.type !== 'heading') return null;
  const blocks = sections(fields);
  const b = blocks.findIndex((s) => s.head === fields[i]);
  const to = b + by;
  if (to < 0 || to >= blocks.length || !blocks[to].head) return null;
  [blocks[b], blocks[to]] = [blocks[to], blocks[b]];
  return blocks.flatMap((s) => (s.head ? [s.head, ...s.fields] : s.fields));
}

/** The fields whose answers are cleared after the form closes. */
export const sensitiveIds = (def: FormDefinition) => def.fields.filter((f) => f.sensitive).map((f) => f.id);
