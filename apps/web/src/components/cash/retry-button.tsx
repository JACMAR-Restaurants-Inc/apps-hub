'use client';

import { retryReportAction } from '@/app/cash/actions';
import { ct, type CashKey } from '@/lib/cash/i18n';
import type { Lang } from '@/lib/i18n';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** "Réessayer" on Rapports: runs the report again now and redraws the page. */
export function RetryButton({ lang, jobId }: { lang: Lang; jobId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<CashKey | null>(null);
  return (
    <span className="cb-retry">
      <button
        type="button"
        className="cb-ghost"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setNote(null);
          const { outcome } = await retryReportAction(jobId).catch(() => ({ outcome: 'error' as const }));
          setBusy(false);
          if (outcome === 'expired') setNote('session_expired_title');
          else if (outcome === 'denied') setNote('err_denied');
          else if (outcome === 'error') setNote('error_generic');
          router.refresh();
        }}
      >
        {ct(lang, busy ? 'rep_retrying' : 'rep_retry')}
      </button>
      {note && <small className="cb-atterr">{ct(lang, note)}</small>}
    </span>
  );
}
