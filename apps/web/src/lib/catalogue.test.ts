import { describe, expect, it } from 'vitest';
import { APP_GROUPS, CATALOGUE, CATEGORIES, appUrl, catalogueApp, contrast, inkFor, openStyle } from './catalogue';

describe('the catalogue', () => {
  it('has all 18 apps of the Apps Script portal, in its order, keys unique', () => {
    expect(CATALOGUE.map((a) => a.key)).toEqual([
      'SafeCount', 'Projects', 'GitHub', 'Intuit', 'Twilio', 'AtMcd', 'McdGuides', 'Campus', 'Clearview',
      'Fujitsu', 'Gerants', 'Prequart', 'McValeurs', 'Transfert', 'Reparation', 'Calendrier', 'Ithq', 'JreTracker',
    ]);
  });

  it('every app names a real group and category, has blurbs in both languages, and one visibility', () => {
    for (const a of CATALOGUE) {
      expect(APP_GROUPS.map((g) => g.key)).toContain(a.group);
      expect(CATEGORIES.map((c) => c.key)).toContain(a.category);
      expect(a.blurb.trim() && a.blurbFr.trim()).toBeTruthy();
      expect([a.governed, a.adminOnly, a.openToAll].filter(Boolean)).toHaveLength(1);
    }
  });

  it('only Cash Balancing is governed by the roster', () => {
    expect(CATALOGUE.filter((a) => a.governed).map((a) => a.key)).toEqual(['SafeCount']);
  });

  it('the Arches only on McDonald’s own sites (§74)', () => {
    expect(CATALOGUE.filter((a) => a.logo === 'arches').map((a) => a.key)).toEqual(['AtMcd', 'McdGuides']);
  });

  it('letter colours: unique, never McDonald’s red or gold, and readable (§81)', () => {
    const tints = CATALOGUE.filter((a) => !a.logo).map((a) => a.tint!.toUpperCase());
    expect(new Set(tints).size).toBe(tints.length);
    // Hue, not brightness: a teal can be as bright as the leaf's red and look nothing
    // like it. McDonald's red is at 358°, the Arches' gold at 44°; keep 25° clear.
    const hue = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
      if (d === 0) return null; // grey has no hue
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return (h * 60 + 360) % 360;
    };
    const away = (h: number, from: number) => Math.min(Math.abs(h - from), 360 - Math.abs(h - from));
    expect(hue('#DB0007')! > 350).toBe(true);
    for (const t of tints) {
      const h = hue(t);
      if (h !== null) {
        expect(away(h, hue('#DB0007')!), `${t} is too close to McDonald's red`).toBeGreaterThan(25);
        expect(away(h, hue('#FFBC0D')!), `${t} is too close to the Arches' gold`).toBeGreaterThan(25);
      }
      expect(contrast(inkFor(t), t)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('no name uses a dash as punctuation, except the incumbent "ITHQ - Google Drive" (§83)', () => {
    for (const a of CATALOGUE) {
      for (const s of [a.blurb, a.blurbFr]) expect(s).not.toMatch(/[—–]|\s-\s/);
    }
    expect(CATALOGUE.filter((a) => /\s-\s/.test(a.nameFr)).map((a) => a.key)).toEqual(['Ithq']);
  });
});

describe('how a card opens (§76/§77/§82)', () => {
  const style = (key: string) => openStyle(catalogueApp(key)!);
  it('our apps say Open app, in the same tab', () => {
    expect(style('SafeCount')).toEqual({ label: 'openApp', newTab: false });
    expect(style('McValeurs')).toEqual({ label: 'openApp', newTab: false });
    expect(style('JreTracker')).toEqual({ label: 'openApp', newTab: false });
  });
  it('another company’s site says Open, in a new tab', () => {
    expect(style('GitHub')).toEqual({ label: 'open', newTab: true });
    expect(style('Fujitsu')).toEqual({ label: 'open', newTab: true });
  });
  it('a form of ours marked newTab opens in a new tab', () => {
    expect(style('Prequart')).toEqual({ label: 'open', newTab: true });
  });
  it('JM DevOps, rebuilt here, is an app of ours: same tab', () => {
    expect(style('Projects')).toEqual({ label: 'openApp', newTab: false });
  });
});

describe('appUrl', () => {
  it('APP_URL_<KEY> replaces the default without a code change', () => {
    const guides = catalogueApp('McdGuides')!;
    expect(appUrl(guides, {})).toContain('manager-s-guides-2025');
    expect(appUrl(guides, { APP_URL_MCDGUIDES: ' https://x.test/2026 ' })).toBe('https://x.test/2026');
  });
});
