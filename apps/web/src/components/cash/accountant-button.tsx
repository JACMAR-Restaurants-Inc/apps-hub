'use client';

import { sendToAccountantAction } from '@/app/cash/actions';
import { ct, type CashKey } from '@/lib/cash/i18n';
import type { Lang } from '@/lib/i18n';
import { useState } from 'react';

/** "Envoyer à la comptabilité" on a filed count (App.html renderDailyDetail). Once only. */
export function AccountantButton({ lang, countId }: { lang: Lang; countId: number }) {
  const [label, setLabel] = useState<CashKey>('send_to_accountant_btn');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="cb-ghost"
      disabled={busy || done}
      onClick={async () => {
        setBusy(true);
        setLabel('loading');
        const { outcome } = await sendToAccountantAction(countId).catch(() => ({ outcome: 'error' as const }));
        setBusy(false);
        if (outcome === 'done' || outcome === 'already_sent') {
          setDone(true);
          setLabel(outcome === 'done' ? 'send_to_accountant_queued' : 'send_to_accountant_already');
        } else setLabel(outcome === 'expired' ? 'session_expired_title' : outcome === 'denied' ? 'err_denied' : 'error_generic');
      }}
    >
      {ct(lang, label)}
    </button>
  );
}
