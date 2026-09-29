import { describe, expect, it } from 'vitest';
import { GRANT_PANEL_LABELS } from './requests/messages';
import { cashDict } from './cash/i18n';
import { devopsDict } from './devops/i18n';
import { dict, langFrom } from './i18n';

describe('the dictionaries (portal, Cash Balancing and JM DevOps)', () => {
  const entries = [...Object.entries(dict), ...Object.entries(cashDict), ...Object.entries(devopsDict)];

  it('has both languages for every key, never empty', () => {
    for (const [, v] of entries) {
      expect(v.fr.trim()).not.toBe('');
      expect(v.en.trim()).not.toBe('');
    }
  });

  it('uses no dash as punctuation, in either language', () => {
    for (const [key, v] of entries) {
      for (const s of [v.fr, v.en]) expect(`${key}: ${s}`).not.toMatch(/[—–]|\s-\s/);
    }
  });

  it('puts a non-breaking space (plain or narrow) before French ? and :', () => {
    for (const [key, v] of entries) expect(`${key}: ${v.fr}`.slice(key.length + 2)).not.toMatch(/[^\u00a0\u202f][?:]/);
  });

  it('has the labels the request email tells admins to press', () => {
    expect(dict.review.fr).toBe(GRANT_PANEL_LABELS.review);
    expect(dict.grant.fr).toBe(GRANT_PANEL_LABELS.grant);
  });

  it('defaults to French: anything but exactly "en"', () => {
    expect(langFrom(undefined)).toBe('fr');
    expect(langFrom('EN')).toBe('fr');
    expect(langFrom('en')).toBe('en');
  });
});
