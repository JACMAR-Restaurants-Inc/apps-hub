/**
 * The two access emails, in French (owner's call: "we are a French company", RBAC §46).
 * Ported from RBAC library Notify.gs, wording kept, with the spreadsheet references
 * replaced by the portal's own screens.
 *
 * - French only, not bilingual: twice as long for everybody and read in one.
 * - No dashes as punctuation. The one dash kept is a store written "1647 - Hull", which
 *   is how the company writes a restaurant.
 * - A non-breaking space before each colon, French typography.
 * - Nothing from Clearview but name, employee number, store and active. Never the raw
 *   record (CLAUDE.md §3).
 * - Plain text is one paragraph per line, not hard-wrapped: the mail client wraps.
 */

const NBSP = ' ';
const q = (v: string) => `«${NBSP}${v}${NBSP}»`;

export function escapeHtml(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
/** Escape, then keep non-breaking spaces visible in the HTML source. */
const h = (v: string) => escapeHtml(v).replace(/ /g, '&nbsp;');

export interface Mail {
  subject: string;
  text: string;
  html: string;
}

/** The button labels the request email tells an admin to press. Must match the Grant panel. */
export const GRANT_PANEL_LABELS = { review: 'Examiner', grant: 'Accorder l’accès' } as const;

export function accessRequestMail(input: {
  email: string;
  appName: string;
  adminUrl: string;
  employee: { number: string; fullName: string; active: boolean; storeLabel: string | null } | null;
  /** The Clearview store is one the roster knows, so the panel opens with it ticked. */
  storeTicked: boolean;
  askedAgain: boolean;
}): Mail {
  const { email, appName, adminUrl, employee } = input;
  const store = employee?.storeLabel ?? null;
  const who = employee
    ? `Selon Clearview, il s’agit de ${employee.fullName} (numéro d’employé ${employee.number}), ` +
      (store ? `restaurant de rattachement${NBSP}: ${store}.` : 'aucun restaurant au dossier.')
    : '';
  // Somebody who has left the company asking for access is exactly what must be caught.
  const gone =
    employee && !employee.active
      ? `ATTENTION${NBSP}: selon Clearview, cette personne n’est PAS active. Vérifiez avant d’accorder l’accès.`
      : '';
  const again = input.askedAgain ? `Cette personne avait déjà eu accès${NBSP}; son accès avait été retiré ou refusé.` : '';
  const ticked = input.storeTicked && store ? ` (${store} est déjà coché)` : '';
  const how =
    `Pour l’accorder, ouvrez JM Portal. Dans les demandes d’accès, appuyez sur ${q(GRANT_PANEL_LABELS.review)}${NBSP}: ` +
    `choisissez le rôle et les restaurants${ticked}, puis appuyez sur ${q(GRANT_PANEL_LABELS.grant)}. ` +
    'La personne reçoit alors le lien par courriel. Le même panneau permet de refuser la demande.';
  const check1 = employee
    ? 'Confirmez les restaurants. Une personne peut faire des décomptes ailleurs que dans son restaurant de rattachement.'
    : 'Demandez à la personne dans quels restaurants elle fait les décomptes.';
  const check2 =
    'Vérifiez que c’est bien l’adresse avec laquelle elle se connecte à Google. C’est la clé du registre, ' +
    'et ce n’est souvent pas l’adresse que le bureau a au dossier.';

  const text =
    [
      `${email} a demandé l’accès à ${appName}.`,
      gone,
      who,
      again,
      `Rien n’a été accordé${NBSP}: la demande attend votre décision.`,
      how,
      adminUrl,
      `Avant de décider${NBSP}:`,
      check1,
      check2,
    ]
      .filter(Boolean)
      .join('\n\n') + '\n';

  const html =
    '<div lang="fr">' +
    `<h2>${h(email)} a demandé l’accès à ${h(appName)}</h2>` +
    (gone ? `<p><strong>${h(gone)}</strong></p>` : '') +
    (who ? `<p>${h(who)}</p>` : '') +
    (again ? `<p>${h(again)}</p>` : '') +
    '<p><strong>Rien n’a été accordé.</strong> La demande attend votre décision.</p>' +
    `<p>${h(how)}</p>` +
    `<p><a href="${escapeHtml(adminUrl)}">Ouvrir les demandes d’accès</a></p>` +
    '<p>Avant de décider&nbsp;:</p>' +
    `<ul><li>${h(check1)}</li><li>${h(check2)}</li></ul>` +
    '</div>';

  return { subject: `Demande d’accès à ${appName}${NBSP}: ${email}`, text, html };
}

export function accessGrantedMail(input: { email: string; appName: string; url: string; stores: string[] }): Mail {
  const { email, appName, url, stores } = input;
  const text =
    [
      `Vous avez maintenant accès à ${appName}.`,
      url,
      `Connectez-vous avec Google en utilisant l’adresse ${email}. Utilisez bien ce compte${NBSP}: ` +
        'c’est à lui que l’accès a été accordé, et tout autre compte sera refusé.',
      stores.length ? `Vos restaurants${NBSP}: ${stores.join(', ')}` : '',
      'Si quelque chose vous semble incorrect, répondez à ce courriel avant de commencer.',
    ]
      .filter(Boolean)
      .join('\n\n') + '\n';

  const html =
    '<div lang="fr">' +
    `<h2>Vous avez maintenant accès à ${h(appName)}</h2>` +
    `<p><a href="${escapeHtml(url)}">${h(url)}</a></p>` +
    // Bold: picking the wrong Google account is THE way this goes wrong (RBAC §22).
    `<p>Connectez-vous avec Google en utilisant l’adresse <strong>${h(email)}</strong>. ` +
    'Utilisez bien ce compte&nbsp;: c’est à lui que l’accès a été accordé, et tout autre compte sera refusé.</p>' +
    (stores.length ? `<p>Vos restaurants&nbsp;:</p><ul>${stores.map((s) => `<li>${h(s)}</li>`).join('')}</ul>` : '') +
    '<p><small>Si quelque chose vous semble incorrect, répondez à ce courriel avant de commencer.</small></p>' +
    '</div>';

  return { subject: `Vous avez maintenant accès à ${appName}`, text, html };
}

/** A restaurant as the company writes it: "1647 - Hull". */
export const storeLabel = (id: string, name: string) => `${id} - ${name}`;
