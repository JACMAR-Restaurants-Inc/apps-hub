import { t, type Lang } from '@/lib/i18n';
import { ArchesSvg } from './arches';
import { DoorLangPill } from './lang-switch';
import { SignInButton } from '@/app/sign-in-buttons';

/** A sign-in error from Better Auth's ?error=, in the old portal's words. */
export type DoorError = 'cancelled' | 'expired' | 'other';
export function doorError(code: string | undefined): { kind: DoorError; code: string | null } | null {
  if (!code) return null;
  // Only something shaped like a code is ever shown back: a link can carry any text.
  const safe = /^[a-z_]{1,40}$/.test(code) ? code : null;
  if (code === 'access_denied') return { kind: 'cancelled', code: null };
  if (['state_mismatch', 'please_restart_the_process', 'invalid_code', 'oauth_state'].includes(code)) return { kind: 'expired', code: null };
  return { kind: 'other', code: safe };
}

/**
 * The sign-in door, the Apps Script portal's markup (RBAC/portal/Ui.html, the
 * `redirect` view; §40/§44/§54). A navy panel with the pitch beside a light pane with
 * the sign-in, split at 960px; on a phone, one screen. portal.css styles every class.
 */
export function Door({ lang, error }: { lang: Lang; error?: ReturnType<typeof doorError> }) {
  return (
    <div className="door" lang={lang}>
      <div className="side">
        <svg className="curves" viewBox="0 0 800 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <path d="M-120 900 C 120 700, 240 470, 520 360 S 860 150, 980 40" />
          <path d="M-160 900 C 110 740, 210 520, 500 420 S 880 220, 1010 110" />
          <path d="M-200 900 C 100 780, 180 570, 480 480 S 900 290, 1040 180" />
        </svg>

        <div className="brandrow">
          <div className="wm">
            <b>JACMAR</b>
            <span>Restaurants Inc.</span>
          </div>
        </div>

        <div className="pitch">
          <h2>
            {t(lang, 'doorPitch1')}
            <em>{t(lang, 'doorPitch2')}</em>
          </h2>
          <p>{t(lang, 'doorPitchLine')}</p>
        </div>

        <div className="feats">
          <div className="feat">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3l7.5 3.2v5.4c0 4.5-3.1 8.7-7.5 9.9-4.4-1.2-7.5-5.4-7.5-9.9V6.2z" />
              <path d="M9 12.2l2.1 2.1L15.4 10" />
            </svg>
            <b>{t(lang, 'featSecure')}</b>
            <span>{t(lang, 'featSecureLine')}</span>
          </div>
          <div className="feat">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
              <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
              <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
              <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
            </svg>
            <b>{t(lang, 'featCentral')}</b>
            <span>{t(lang, 'featCentralLine')}</span>
          </div>
          <div className="feat">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="8" r="3.8" />
              <path d="M4.8 20.2a7.2 7.2 0 0114.4 0" />
            </svg>
            <b>{t(lang, 'featAccess')}</b>
            <span>{t(lang, 'featAccessLine')}</span>
          </div>
        </div>
      </div>

      <div className="pane">
        <div className="ltop">
          <DoorLangPill lang={lang} />
        </div>

        <div className="lmid">
          <div className="lcol">
            <div className="lockup">
              <div className="arches">
                <ArchesSvg />
              </div>
              <div className="rule" />
              <div className="jacmark">
                <b>JACMAR</b>
                <span>Restaurants Inc.</span>
              </div>
            </div>

            {error && (
              <div className="gp-err" role="alert" style={{ textAlign: 'left' }}>
                <b>{t(lang, error.kind === 'cancelled' ? 'errCancelledTitle' : error.kind === 'expired' ? 'errExpiredTitle' : 'errOtherTitle')}</b>
                <br />
                {t(lang, error.kind === 'cancelled' ? 'errCancelledBody' : error.kind === 'expired' ? 'errExpiredBody' : 'errOtherBody')}
                {error.code && <small style={{ display: 'block', marginTop: 4, opacity: 0.8 }}>{error.code}</small>}
              </div>
            )}
            <h1 className="h">{t(lang, 'doorWelcome')}</h1>
            <p className="sub">{t(lang, 'doorSub')}</p>

            <SignInButton label={t(lang, 'signIn')} />

            <a className="nolink" href="https://accounts.google.com/signup">
              {t(lang, 'noGoogleAccount')}
            </a>
          </div>
        </div>

        <div className="lfoot">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 018 0v3" />
          </svg>
          <span>{t(lang, 'doorFoot')}</span>
        </div>
      </div>
    </div>
  );
}
