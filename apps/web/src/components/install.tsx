'use client';

import { t, type Lang } from '@/lib/i18n';
import { installPlatform, showInstallBanner, showInstallMenuItem, type InstallPlatform } from '@/lib/install';
import { useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * Add to home screen (rules in `lib/install.ts`): the Home banner, the avatar menu's
 * item, and the sheet of steps they both open. The TopBar renders the sheet, once.
 */

// Chrome's event; not in TypeScript's DOM types.
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface State {
  platform: InstallPlatform;
  canPrompt: boolean;
  dismissed: boolean;
  sheetOpen: boolean;
}

// A preference of this phone's browser, not of the person: localStorage, not the database.
const DISMISSED = 'portal.install-dismissed';
const NOTHING: State = { platform: 'none', canPrompt: false, dismissed: true, sheetOpen: false };

let offer: InstallPromptEvent | null = null;
let state = NOTHING;
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

// At module load, not in an effect: the browser can make its offer before React has
// hydrated, and it makes it only once per page load.
if (typeof window !== 'undefined') {
  let dismissed = false;
  try {
    dismissed = localStorage.getItem(DISMISSED) === '1';
  } catch {} // private mode or blocked storage: the banner simply shows again
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  state = {
    platform: installPlatform({ ua: navigator.userAgent, touchPoints: navigator.maxTouchPoints, standalone }),
    canPrompt: false,
    dismissed,
    sheetOpen: false,
  };
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // our banner instead of Chrome's own bar
    offer = e as InstallPromptEvent;
    set({ canPrompt: true });
  });
  window.addEventListener('appinstalled', () => {
    offer = null;
    set({ canPrompt: false, dismissed: true, sheetOpen: false });
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
// The server renders nothing, so the first paint never disagrees with the phone.
const useInstall = () => useSyncExternalStore(subscribe, () => state, () => NOTHING);

function dismiss() {
  try {
    localStorage.setItem(DISMISSED, '1');
  } catch {}
  set({ dismissed: true, sheetOpen: false });
}

/** Android's one-tap install where the browser offers it, otherwise the steps. */
async function install() {
  if (!offer) return set({ sheetOpen: true });
  const o = offer;
  offer = null; // the browser's offer works once
  set({ canPrompt: false });
  await o.prompt();
  const { outcome } = await o.userChoice;
  if (outcome === 'accepted') dismiss();
}

export function InstallBanner({ lang }: { lang: Lang }) {
  const s = useInstall();
  if (!showInstallBanner(s)) return null;
  return (
    <div className="banner installbanner" role="note">
      <div className="bi" aria-hidden="true">
        <PhoneIcon />
      </div>
      <div className="grow">
        <h2>{t(lang, 'installTitle')}</h2>
        <p>{t(lang, 'installLine')}</p>
        <div className="acts">
          <button type="button" className="pbtn" onClick={() => void install()}>
            {t(lang, s.platform === 'ios' ? 'installHow' : 'installNow')}
          </button>
          <button type="button" className="btn-x" onClick={dismiss}>
            {t(lang, 'installLater')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** In the avatar menu, for good: where someone who dismissed the banner finds it again. */
export function InstallMenuItem({ lang, onPick }: { lang: Lang; onPick: () => void }) {
  const s = useInstall();
  if (!showInstallMenuItem(s.platform)) return null;
  return (
    <>
      <button
        type="button"
        className="acctout acctitem"
        onClick={() => {
          onPick();
          void install();
        }}
      >
        <PhoneIcon />
        <span>{t(lang, 'installMenu')}</span>
      </button>
      <div className="acctdiv" />
    </>
  );
}

/** The steps, as a native dialog: Escape, focus and the backdrop come with it. */
export function InstallSheet({ lang }: { lang: Lang }) {
  const s = useInstall();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (s.sheetOpen && !d.open) d.showModal();
    if (!s.sheetOpen && d.open) d.close();
  }, [s.sheetOpen]);
  if (s.platform === 'none') return null;

  const ios = s.platform === 'ios';
  const steps = ios
    ? [
        <>
          {t(lang, 'iosStep1')} <ShareIcon />. {t(lang, 'iosStep1b')}.
        </>,
        <>{t(lang, 'iosStep2')}</>,
        <>{t(lang, 'iosStep3')}</>,
      ]
    : [<>{t(lang, 'androidStep1')}</>, <>{t(lang, 'androidStep2')}</>, <>{t(lang, 'androidStep3')}</>];

  return (
    <dialog
      ref={ref}
      className="installsheet"
      aria-labelledby="installTitle"
      lang={lang}
      onClose={() => set({ sheetOpen: false })}
      // A click on the backdrop lands on the dialog itself.
      onClick={(e) => e.target === e.currentTarget && set({ sheetOpen: false })}
    >
      <h2 id="installTitle">{t(lang, 'installTitle')}</h2>
      <ol>
        {steps.map((step, i) => (
          <li key={i}>
            <span className="n">{i + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <p className="note">{t(lang, ios ? 'iosNote' : 'androidNote')}</p>
      <div className="acts">
        <button type="button" className="pbtn" onClick={dismiss}>
          {t(lang, 'installDone')}
        </button>
        <button type="button" className="btn-x" onClick={() => set({ sheetOpen: false })}>
          {t(lang, 'close')}
        </button>
      </div>
    </dialog>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M12 8v6M9 11h6M10.5 18.5h3" />
    </svg>
  );
}

/** Apple's Share symbol, so it can be matched on the screen. */
function ShareIcon() {
  return (
    <svg className="share" viewBox="0 0 24 24" role="img" aria-label="Partager / Share">
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M7 10H6a2 2 0 00-2 2v7a2 2 0 002 2h12a2 2 0 002-2v-7a2 2 0 00-2-2h-1" />
    </svg>
  );
}
