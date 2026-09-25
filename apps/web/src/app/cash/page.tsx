import { Header } from '@/components/header';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/lang';
import { getRoster, getViewer } from '@/lib/viewer';
import { can } from '@hub/rbac';
import Link from 'next/link';
import { redirect } from 'next/navigation';

/** Cash Balancing's front door. The screens come next; the door already checks can(). */
export default async function CashPage() {
  const [viewer, lang] = await Promise.all([getViewer(), getLang()]);
  if (!viewer) redirect('/');
  const allowed = can(await getRoster(), viewer.email, 'SafeCount', 'app', 'access');

  return (
    <>
      <Header lang={lang} signedIn />
      <main lang={lang} className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-8">
        <h1 className="text-2xl font-semibold">Cash Balancing</h1>
        <p>{t(lang, allowed ? 'comingSoon' : 'noAccess')}</p>
        <Link href="/" className="text-sm underline-offset-4 hover:underline">
          {t(lang, 'backToPortal')}
        </Link>
      </main>
    </>
  );
}
