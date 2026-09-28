'use client';

import { setCashThemeAction } from '@/app/cash/actions';
import { ct } from '@/lib/cash/i18n';
import type { Lang } from '@/lib/i18n';
import { useSyncExternalStore, useTransition } from 'react';

const query = '(prefers-color-scheme: light)';
const subscribe = (cb: () => void) => {
  const m = window.matchMedia(query);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
};

/**
 * Thème: Clair / Sombre, in the avatar menu on Cash Balancing's pages (App.html's
 * account menu). With nothing chosen it shows what the device is giving.
 */
export function ThemeSwitch({ lang, chosen }: { lang: Lang; chosen: 'light' | 'dark' | null }) {
  const deviceLight = useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
  const current = chosen ?? (deviceLight ? 'light' : 'dark');
  const [pending, start] = useTransition();
  const pick = (t: 'light' | 'dark') => {
    // Repaint now: the colours are variables, so nothing on the page is rebuilt and a
    // count half typed keeps its focus. The cookie makes the next page agree.
    document.querySelector('.cb-app')?.setAttribute('data-theme', t);
    start(() => setCashThemeAction(t));
  };
  return (
    <div className="optrow">
      <span>{ct(lang, 'theme_label')}</span>
      <div className="optseg" role="group" aria-label={ct(lang, 'theme_label')}>
        {(['light', 'dark'] as const).map((t) => (
          <button key={t} type="button" className={t === current ? 'on' : undefined} aria-pressed={t === current} disabled={pending} onClick={() => pick(t)}>
            {ct(lang, t === 'light' ? 'theme_light' : 'theme_dark')}
          </button>
        ))}
      </div>
    </div>
  );
}
