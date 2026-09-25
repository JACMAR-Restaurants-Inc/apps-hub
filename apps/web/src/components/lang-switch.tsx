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
