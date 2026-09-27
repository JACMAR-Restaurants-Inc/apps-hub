import { t, type Lang } from '@/lib/i18n';
import Link from 'next/link';

/**
 * "Your session has expired" with the way back (the old portal's e_session + e_signin).
 * A plain link to the portal: signed out, it shows the door, which signs them in again.
 */
export function SessionExpired({ lang, className = 'gp-err' }: { lang: Lang; className?: string }) {
  return (
    <p className={className} role="alert">
      {t(lang, 'errSession')}{' '}
      <Link href="/" style={{ fontWeight: 600, textDecoration: 'underline', color: 'inherit' }}>
        {t(lang, 'signInAgain')}
      </Link>
    </p>
  );
}
