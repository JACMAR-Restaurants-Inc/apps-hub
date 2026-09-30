import type { BetaApp } from '@/lib/beta/apps';
import { baseName } from '@/lib/beta/apps';
import { inkFor } from '@/lib/catalogue';
import { t, type Lang } from '@/lib/i18n';

/** A beta app's card on the Tests page: the app cards' own markup, with a Bêta badge. */
export function BetaCard({ lang, app }: { lang: Lang; app: BetaApp }) {
  const name = lang === 'fr' ? app.nameFr : app.name;
  return (
    <article className="app" id={`beta-${app.key}`}>
      <div className="apptop">
        <div className="sq s40" style={{ background: app.tint, color: inkFor(app.tint) }} aria-hidden="true">
          {app.mark}
        </div>
        <h3>
          <span>{name}</span>
          <span className="mini">{t(lang, 'betaBadge')}</span>
        </h3>
      </div>
      <p className="bl">{lang === 'fr' ? app.blurbFr : app.blurb}</p>
      <p className="bl betaof">{t(lang, 'betaOf').replace('{app}', baseName(app, lang))}</p>
      <div className="appfoot">
        <a className="btn-go" href={app.path}>
          <span>{t(lang, 'openApp')}</span>
          <span aria-hidden="true">↗</span>
        </a>
      </div>
    </article>
  );
}
