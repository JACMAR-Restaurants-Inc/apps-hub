import { SignOutButton } from '@/app/sign-in-buttons';
import { t, type Lang } from '@/lib/i18n';
import Link from 'next/link';
import { LangSwitch } from './lang-switch';

export function Header({ lang, signedIn }: { lang: Lang; signedIn: boolean }) {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="text-lg font-semibold">
          {t(lang, 'portal')}
        </Link>
        <div className="flex items-center gap-2">
          <LangSwitch lang={lang} label={t(lang, 'switchLang')} />
          {signedIn && <SignOutButton label={t(lang, 'signOut')} />}
        </div>
      </div>
    </header>
  );
}
