import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { restaurantLabel, roleLabel } from './labels';

describe('role names', () => {
  it('in both languages, Admin too', () => {
    expect(['manager', 'office', 'viewer', 'admin'].map((r) => roleLabel('fr', r))).toEqual(['Gérant', 'Bureau', 'Consultation', 'Admin']);
    expect(['manager', 'office', 'viewer'].map((r) => roleLabel('en', r))).toEqual(['Manager', 'Office', 'Viewer']);
  });
  it('an unknown role as stored, nothing as nothing, and no object property read as a role', () => {
    expect(roleLabel('fr', 'boss')).toBe('boss');
    expect(roleLabel('fr', null)).toBe('');
    expect(roleLabel('fr', 'constructor')).toBe('constructor');
    expect(roleLabel('fr', 'toString')).toBe('toString');
  });
});

describe('restaurant labels', () => {
  it('"1647 - Hull", or the number alone when the name is unknown', () => {
    expect(restaurantLabel('1647', 'Hull')).toBe('1647 - Hull');
    expect(restaurantLabel('1647', undefined)).toBe('1647');
    expect(restaurantLabel('1647', '')).toBe('1647');
  });
});

describe('one place for both (CLAUDE.md §7, item 4)', () => {
  const root = path.resolve(__dirname, '..');
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
    });
  const others = files(root).filter((f) => !f.endsWith(path.join('lib', 'labels.ts')));

  it('no other file maps role keys to their names', () => {
    expect(others.filter((f) => /manager:\s*'role_manager'/.test(readFileSync(f, 'utf8'))).map((f) => path.relative(root, f))).toEqual([]);
  });
  it('no other file builds "id - name" by hand', () => {
    expect(others.filter((f) => /\}\s-\s\$\{/.test(readFileSync(f, 'utf8'))).map((f) => path.relative(root, f))).toEqual([]);
  });
});
