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
  navHome: { fr: 'Accueil', en: 'Home' },
  navDirectory: { fr: 'Répertoire des accès', en: 'Access directory' },
  signedInWithGoogle: { fr: 'Connecté avec Google', en: 'Signed in with Google' },
  language: { fr: 'Langue', en: 'Language' },
  footerAccess: { fr: 'les accès sont gérés par le bureau', en: 'access is managed by the office' },
  // The door, word for word from the Apps Script portal (Ui.html, the redirect view).
  doorPitch1: { fr: 'Votre portail.', en: 'Your portal.' },
  doorPitch2: { fr: 'Vos applications.', en: 'Your apps.' },
  doorPitchLine: {
    fr: 'Accédez en toute sécurité aux outils et applications dont vous avez besoin pour bien servir nos invités.',
    en: 'Securely reach the tools and apps you need to look after our guests.',
  },
  featSecure: { fr: 'Sécurisé', en: 'Secure' },
  featSecureLine: { fr: 'Vos données sont protégées', en: 'Your data is protected' },
  featCentral: { fr: 'Centralisé', en: 'Centralised' },
  featCentralLine: { fr: 'Toutes vos applications au même endroit', en: 'All your apps in one place' },
  featAccess: { fr: 'Accessible', en: 'Accessible' },
  featAccessLine: { fr: 'Partout, en tout temps, sur tous vos appareils', en: 'Anywhere, any time, on any device' },
  doorWelcome: { fr: 'Bienvenue au portail.', en: 'Welcome to the portal.' },
  doorSub: {
    fr: 'Connectez-vous pour afficher les applications mises à votre disposition.',
    en: 'Sign in to view the applications that have been made available to you.',
  },
  noGoogleAccount: { fr: 'Je n’ai pas de compte Google', en: 'I don’t have a Google account' },
  doorFoot: { fr: 'Accès réservé au personnel autorisé.', en: 'Access is limited to authorized staff.' },
  signedInAs: { fr: `Connecté avec${NBSP}:`, en: 'Signed in as' },
  wrongAccount: {
    fr: `Pas le bon compte${NBSP}? Déconnectez-vous et choisissez celui que le bureau connaît.`,
    en: 'Wrong account? Sign out and choose the one the office knows.',
  },
  switchLang: { fr: 'English', en: 'Français' },
  welcome: { fr: 'Bienvenue sur JM Portal', en: 'Welcome to JM Portal' },
  welcomeBody: {
    fr: 'Demandez les applications dont vous avez besoin. Le bureau accorde l’accès, application par application.',
    en: 'Ask for the apps you need. The office grants access, app by app.',
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
  // The home page and the cards, word for word from the Apps Script portal (Ui.html's
  // dictionary, Home.html, Cards.html).
  employeeNumberHelp: { fr: 'Obligatoire. Il permet au bureau de retrouver votre dossier.', en: 'Required. It lets the office find your record.' },
  askQuestion: { fr: 'Demander au bureau l’accès à {app}\u00a0?', en: 'Ask the office for access to {app}?' },
  requestSent: {
    fr: 'Le bureau a été prévenu. Vous recevrez un courriel avec le lien dès que l’accès sera accordé.',
    en: 'The office has been told. You’ll get an email with the link once it’s granted.',
  },
  accessRemoved: { fr: 'Votre accès a été retiré. Vous pouvez le redemander.', en: 'Your access was removed. You can ask again.' },
  adminsOnly: { fr: 'Admins seulement', en: 'Admins only' },
  notConnected: { fr: 'Pas encore relié', en: 'Not connected yet' },
  openApp: { fr: 'Ouvrir l’application', en: 'Open app' },
  opensNewTab: { fr: '(nouvel onglet)', en: '(new tab)' },
  subAdmin: { fr: 'Vos applications, et les demandes qui attendent une décision.', en: 'Your apps, and who is waiting on a decision.' },
  subOneStore: { fr: 'Vos applications et le restaurant qui vous est attribué.', en: 'Your apps and the restaurant you’re set up for.' },
  subStores: { fr: 'Vos applications et les restaurants qui vous sont attribués.', en: 'Your apps and the restaurants you’re set up for.' },
  subApps: { fr: 'Vos applications.', en: 'Your apps.' },
  noGrantsTitle: { fr: 'Le bureau ne vous a encore accordé aucune application', en: 'The office hasn’t granted you any apps yet' },
  signedInAsLong: { fr: 'Vous êtes connecté en tant que', en: 'You’re signed in as' },
  noGrantsBody: {
    fr: 'La connexion confirme votre identité\u00a0; le bureau accorde l’accès à chaque application.',
    en: 'Signing in confirms who you are; the office grants access to each app.',
  },
  switchAccount: {
    fr: 'Ce n’est pas vous, ou vous attendiez un accès\u00a0? Se connecter avec un autre compte →',
    en: 'Not you, or expected access? Sign in with a different account →',
  },
  statApps: { fr: 'Applications', en: 'Apps' },
  statAppsSub: { fr: 'accessibles pour vous', en: 'available to you' },
  statWaiting: { fr: 'En attente de vous', en: 'Waiting for you' },
  toReview: { fr: 'À traiter', en: 'To review' },
  statWaitingSub: { fr: 'demandes d’accès', en: 'access requests' },
  statPeople: { fr: 'Personnes avec accès', en: 'People with access' },
  statPeopleSub: { fr: 'dans {n} restaurants', en: 'across {n} restaurants' },
  statPeopleSubOne: { fr: 'dans 1 restaurant', en: 'across 1 restaurant' },
  statStore: { fr: 'Votre restaurant', en: 'Your restaurant' },
  statStores: { fr: 'Vos restaurants', en: 'Your restaurants' },
  statMyRequests: { fr: 'Vos demandes', en: 'Your requests' },
  statMyRequestsSub: { fr: 'en attente du bureau', en: 'waiting for the office' },
  searchApps: { fr: 'Rechercher une application', en: 'Search apps' },
  category: { fr: 'Catégorie', en: 'Category' },
  allCategories: { fr: 'Toutes les catégories', en: 'All categories' },
  secInternalLine: { fr: 'Les applications auxquelles vous avez accès.', en: 'Apps you have access to.' },
  secExternalLine: {
    fr: 'Les sites d’autres entreprises. Chacun vous connecte avec son propre compte.',
    en: 'Other companies’ sites. Each one signs you in with its own account.',
  },
  secCanAsk: { fr: 'Demandez l’accès\u202f: le bureau est prévenu tout de suite.', en: 'Ask for access and the office is told straight away.' },
  viewAll: { fr: 'Tout voir', en: 'View all' },
  groupInternalLine: { fr: 'Toutes les applications auxquelles vous avez accès.', en: 'All the apps you have access to.' },
  groupExternalLine: {
    fr: 'Les sites d’autres entreprises. Chacun vous connecte avec son propre compte.',
    en: 'Other companies’ sites. Each one signs you in with its own account.',
  },
  appCount: { fr: '{n} applications', en: '{n} apps' },
  noMatch: { fr: 'Aucune application ne correspond.', en: 'No app matches.' },
  clearSearch: { fr: 'Effacer la recherche', en: 'Clear the search' },
  send: { fr: 'Envoyer la demande', en: 'Send request' },
  cancel: { fr: 'Annuler', en: 'Cancel' },
  sending: { fr: 'Envoi de votre demande…', en: 'Sending your request…' },
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
  // The reader's language (§67); "Gérant", not "Gestionnaire" (§81).
  role_viewer: { fr: 'Consultation', en: 'Viewer' },
  roleAdmin: { fr: 'Admin', en: 'Admin' },
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
