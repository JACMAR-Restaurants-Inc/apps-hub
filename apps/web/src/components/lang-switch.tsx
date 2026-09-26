'use client';

import { setLanguage } from '@/app/actions';
import type { Lang } from '@/lib/i18n';
import { useTransition } from 'react';

export function LangSwitch({ lang, label }: { lang: Lang; label: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      lang={lang === 'fr' ? 'en' : 'fr'}
      className="rounded-md px-2 py-1 text-sm text-zinc-600 underline-offset-4 hover:underline disabled:opacity-50 dark:text-zinc-400"
      disabled={pending}
      onClick={() => start(() => setLanguage(lang === 'fr' ? 'en' : 'fr'))}
    >
      {label}
    </button>
  );
}

/** The door's language pill (§40): shows the current language, switches to the other. */
export function DoorLangPill({ lang }: { lang: Lang }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="pill"
      aria-label="Langue / Language"
      disabled={pending}
      onClick={() => start(() => setLanguage(lang === 'fr' ? 'en' : 'fr'))}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18" />
      </svg>
      <span className="lang-code">{lang.toUpperCase()}</span>
      <svg className="chev" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
}
