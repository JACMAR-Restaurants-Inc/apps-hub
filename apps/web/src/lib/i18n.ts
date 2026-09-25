/**
 * The portal's words, in French and English. French is the default ("we are a French
 * company", RBAC §46); the choice is a cookie, so it survives a reload.
 *
 * Rules carried over from the Apps Script portal: no dashes as punctuation, a store is
 * written "1647 - Hull", French has a non-breaking space before a colon. The i18n test
 * checks every key has both languages and neither breaks those rules.
 */

export type Lang = 'fr' | 'en';
export const LANG_COOKIE = 'lang';
export const langFrom = (v: string | undefined): Lang => (v === 'en' ? 'en' : 'fr');

const NBSP = ' ';

export const dict = {
  portal: { fr: 'JM Portal', en: 'JM Portal' },
  signInIntro: {
    fr: 'Connectez-vous avec votre compte Google. Tout compte Google fonctionne, y compris Gmail.',
    en: 'Sign in with your Google account. Any Google account works, including Gmail.',
  },
  signIn: { fr: 'Se connecter avec Google', en: 'Sign in with Google' },
  signOut: { fr: 'Se déconnecter', en: 'Sign out' },
  signedInAs: { fr: `Connecté avec${NBSP}:`, en: 'Signed in as' },
  wrongAccount: {
    fr: `Pas le bon compte${NBSP}? Déconnectez-vous et choisissez celui que le bureau connaît.`,
    en: 'Wrong account? Sign out and choose the one the office knows.',
  },
  switchLang: { fr: 'English', en: 'Français' },
  welcome: { fr: 'Bienvenue sur JM Portal', en: 'Welcome to JM Portal' },
  welcomeBody: {
    fr: 'Vous n’avez encore accès à aucune application. Demandez l’accès à celles dont vous avez besoin.',
    en: 'You do not have access to any app yet. Ask for the ones you need.',
  },
  inactive: {
    fr: 'Votre accès a été désactivé. Parlez-en au bureau.',
    en: 'Your access has been switched off. Please speak to the office.',
  },
  apps: { fr: 'Applications', en: 'Apps' },
  open: { fr: 'Ouvrir', en: 'Open' },
  requestAccess: { fr: 'Demander l’accès', en: 'Request access' },
  requested: { fr: 'Demandé · en attente du bureau', en: 'Requested · waiting for the office' },
  requestedOn: { fr: `Demandé le${NBSP}`, en: 'Asked on ' },
  employeeNumber: { fr: 'Numéro d’employé', en: 'Employee number' },
  employeeNumberHelp: {
    fr: 'Celui qui figure sur votre talon de paie. Le bureau s’en sert pour vous identifier.',
    en: 'The one on your pay stub. The office uses it to know who you are.',
  },
  send: { fr: 'Envoyer la demande', en: 'Send the request' },
  cancel: { fr: 'Annuler', en: 'Cancel' },
  sending: { fr: 'Envoi…', en: 'Sending…' },
  employee_required: { fr: 'Entrez votre numéro d’employé.', en: 'Enter your employee number.' },
  employee_not_found: {
    fr: 'Ce numéro d’employé est introuvable. Vérifiez-le auprès du bureau, puis réessayez.',
    en: 'That employee number was not found. Check it with the office, then try again.',
  },
  clearview_unavailable: {
    fr: 'Impossible de vérifier votre numéro en ce moment. Réessayez dans quelques minutes.',
    en: 'Your number cannot be checked right now. Try again in a few minutes.',
  },
  requestFailed: {
    fr: 'La demande n’a pas pu être envoyée. Réessayez.',
    en: 'The request could not be sent. Please try again.',
  },
  // Admin: the request email tells admins to press these two; see GRANT_PANEL_LABELS.
  accessRequests: { fr: 'Demandes d’accès', en: 'Access requests' },
  noRequests: { fr: 'Aucune demande en attente.', en: 'No requests waiting.' },
  people: { fr: 'Personnes ayant accès', en: 'People with access' },
  review: { fr: 'Examiner', en: 'Review' },
  manage: { fr: 'Gérer', en: 'Manage' },
  grant: { fr: 'Accorder l’accès', en: 'Grant access' },
  save: { fr: 'Enregistrer', en: 'Save' },
  decline: { fr: 'Refuser', en: 'Decline' },
  removeAccess: { fr: 'Retirer l’accès', en: 'Remove access' },
  confirmDecline: { fr: `Refuser cette demande${NBSP}?`, en: 'Decline this request?' },
  confirmRemove: { fr: `Retirer l’accès de cette personne${NBSP}?`, en: 'Remove this person’s access?' },
  role: { fr: 'Rôle', en: 'Role' },
  restaurants: { fr: 'Restaurants', en: 'Restaurants' },
  fromClearview: { fr: 'selon Clearview', en: 'from Clearview' },
  chooseRoleAndStore: {
    fr: 'Choisissez un rôle et au moins un restaurant.',
    en: 'Choose a role and at least one restaurant.',
  },
  askedAgain: { fr: 'A déjà eu accès', en: 'Had access before' },
  changed: {
    fr: 'Cette demande a changé entre-temps. La liste a été mise à jour.',
    en: 'This request changed in the meantime. The list has been refreshed.',
  },
  invalid: { fr: 'Choix invalide.', en: 'That choice is not valid.' },
  status_active: { fr: 'Actif', en: 'Active' },
  status_revoked: { fr: 'Retiré', en: 'Removed' },
  status_declined: { fr: 'Refusé', en: 'Declined' },
  role_office: { fr: 'Bureau', en: 'Office' },
  role_manager: { fr: 'Gérant', en: 'Manager' },
  role_viewer: { fr: 'Lecture seule', en: 'Viewer' },
  hrEmail: { fr: `Courriel RH${NBSP}:`, en: 'HR email:' },
  employee: { fr: `Employé${NBSP}:`, en: 'Employee:' },
  backToPortal: { fr: 'Retour au portail', en: 'Back to the portal' },
  noAccess: {
    fr: 'Vous n’avez pas accès à cette application. Demandez l’accès depuis le portail.',
    en: 'You do not have access to this app. Ask for it from the portal.',
  },
  comingSoon: {
    fr: 'Cet écran arrive bientôt dans la nouvelle version.',
    en: 'This screen is coming soon in the new version.',
  },
} as const satisfies Record<string, Record<Lang, string>>;

export type Key = keyof typeof dict;
export const t = (lang: Lang, key: Key): string => dict[key][lang];

/** "2026-09-25" as the reader writes a date, in Toronto. */
export function formatDay(lang: Lang, at: Date): string {
  return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', {
    timeZone: 'America/Toronto',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(at);
}
