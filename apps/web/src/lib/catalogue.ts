/**
 * The portal's catalogue: every app and link, taken from the Apps Script portal's
 * PORTAL_APPS, CATEGORIES and APP_GROUPS (RBAC/portal/Portal.gs, 2026-09-25). Names,
 * blurbs, colours and rules are that file's; RBAC/CLAUDE.md explains each.
 *
 * - Names are the incumbent's, never invented or translated (RBAC §28/§83).
 * - Visibility: `governed` apps are held through the roster (can()); `adminOnly` ones
 *   are shown to system admins only; `openToAll` ones to everyone, governed by nobody.
 * - The label and the tab (§76/§77/§82): an app that signs people in itself and is not
 *   `isApp` says "Ouvrir ↗", in a new tab if it is another company's site or `newTab`;
 *   everything else says "Ouvrir l'application ↗" in the same tab.
 * - Every URL can be replaced without a code change: APP_URL_<KEY> in the environment,
 *   e.g. APP_URL_MCDGUIDES, whose default carries a year and will go stale.
 * - The letters' colours were checked against McDonald's red and gold, and against each
 *   other (§81). The ink is computed, so a colour added later cannot ship unreadable.
 */

export type Group = 'internal' | 'external';
export type CategoryKey = 'finance' | 'development' | 'resources' | 'hr' | 'shift' | 'performance' | 'request' | 'links';

export interface CatalogueApp {
  key: string;
  category: CategoryKey;
  group: Group;
  name: string;
  nameFr: string;
  blurb: string;
  blurbFr: string;
  /** Held through the roster (App_* rows, can()). */
  governed?: boolean;
  adminOnly?: boolean;
  openToAll?: boolean;
  /** Signs people in itself: the tap goes straight to its URL. */
  selfAuth?: boolean;
  /** A real app of ours, not a link: says "Open app" (§82/§84). */
  isApp?: boolean;
  newTab?: boolean;
  /** Our own logo, the Arches, or GitHub's mark; otherwise letters on `tint`. */
  logo?: 'cashbalancing' | 'projects' | 'github' | 'arches';
  mark: string;
  tint?: string;
  defaultUrl?: string;
  /** Per-role help in the Grant panel. */
  roleHelp?: Partial<Record<'office' | 'manager' | 'viewer', { en: string; fr: string }>>;
}

export const CATEGORIES: readonly { key: CategoryKey; name: string; nameFr: string }[] = [
  { key: 'finance', name: 'Finance', nameFr: 'Finances' },
  { key: 'development', name: 'Development', nameFr: 'Développement' },
  { key: 'resources', name: 'Resources', nameFr: 'Ressources' },
  { key: 'hr', name: 'Human resources', nameFr: 'Ressources humaines' },
  { key: 'shift', name: 'Shift', nameFr: 'Gestion du quart' },
  { key: 'performance', name: 'Performance', nameFr: 'Performance' },
  { key: 'request', name: 'Requests', nameFr: 'Faire une demande' },
  { key: 'links', name: 'Useful links', nameFr: 'Liens utiles' },
];

export const APP_GROUPS: readonly { key: Group; name: string; nameFr: string }[] = [
  { key: 'internal', name: 'My apps', nameFr: 'Mes applications' },
  { key: 'external', name: 'Other tools', nameFr: 'Autres outils' },
];

export const CATALOGUE: readonly CatalogueApp[] = [
  {
    key: 'SafeCount',
    category: 'finance',
    group: 'internal',
    governed: true,
    isApp: true,
    logo: 'cashbalancing',
    mark: 'CB',
    name: 'Cash Balancing',
    nameFr: 'Cash Balancing',
    blurb: 'Daily safe counts, till variances and the shift handover.',
    blurbFr: 'Décomptes quotidiens, écarts de caisse et passation de quart.',
    // This app, not the old GitHub Pages door: Cash Balancing is rebuilt here.
    defaultUrl: '/cash',
    roleHelp: {
      manager: {
        en: 'Counts the safe, fixes tills and sends to the accountant, at their restaurants.',
        fr: 'Compte le coffre, corrige les caisses et envoie au comptable, dans ses restaurants.',
      },
      viewer: {
        en: 'Sees the counts and dashboards for their restaurants, and all restaurants together. Changes nothing.',
        fr: 'Voit les décomptes et les tableaux de bord de ses restaurants, et de tous les restaurants ensemble. Ne modifie rien.',
      },
      office: {
        en: 'Everything a viewer sees, plus the admin panel.',
        fr: 'Tout ce que voit la consultation, plus le panneau d’administration.',
      },
    },
  },
  {
    key: 'Projects',
    category: 'development',
    group: 'internal',
    adminOnly: true,
    selfAuth: true,
    logo: 'projects',
    mark: 'PM',
    name: 'Project Management',
    nameFr: 'Gestion de projets',
    blurb: 'Issues, projects and the kanban board for the office.',
    blurbFr: 'Dossiers, projets et le tableau kanban du bureau.',
    defaultUrl: 'https://jacmar-restaurants-inc.github.io/project-manager-app/',
  },
  {
    key: 'GitHub',
    category: 'development',
    group: 'external',
    adminOnly: true,
    selfAuth: true,
    logo: 'github',
    mark: 'GH',
    name: 'GitHub',
    nameFr: 'GitHub',
    blurb: 'The code behind every app, with its history and reviews.',
    blurbFr: 'Le code de chaque application, avec son historique et ses révisions.',
    defaultUrl: 'https://github.com/JACMAR-Restaurants-Inc',
  },
  {
    key: 'Intuit',
    category: 'development',
    group: 'external',
    adminOnly: true,
    selfAuth: true,
    mark: 'IN',
    tint: '#475467',
    name: 'Intuit Developer',
    nameFr: 'Intuit Developer',
    blurb: 'Intuit’s developer portal: apps, API keys and test companies.',
    blurbFr: 'Le portail développeur d’Intuit : applications, clés d’API et entreprises de test.',
    defaultUrl: 'https://developer.intuit.com/dashboard',
  },
  {
    key: 'Twilio',
    category: 'development',
    group: 'external',
    adminOnly: true,
    selfAuth: true,
    mark: 'TW',
    tint: '#0E7490',
    name: 'Twilio',
    nameFr: 'Twilio',
    blurb: 'Twilio’s console: phone numbers, messaging and usage.',
    blurbFr: 'La console de Twilio : numéros de téléphone, messagerie et consommation.',
    defaultUrl: 'https://console.twilio.com/',
  },
  {
    key: 'AtMcd',
    category: 'resources',
    group: 'external',
    adminOnly: true,
    selfAuth: true,
    logo: 'arches',
    mark: '@',
    name: '@mcd',
    nameFr: '@mcd',
    blurb: 'McDonald’s own portal, signed in with your McDonald’s account.',
    blurbFr: 'Le portail de McDonald’s, avec votre compte McDonald’s.',
    defaultUrl: 'https://www.atmcd.com/',
  },
  {
    key: 'McdGuides',
    category: 'links',
    group: 'external',
    openToAll: true,
    selfAuth: true,
    logo: 'arches',
    mark: 'MG',
    name: 'Guides des Gérants',
    nameFr: 'Guides des Gérants',
    blurb: 'The manager’s guides on McDonald’s own portal.',
    blurbFr: 'Les guides des gérants sur le portail de McDonald’s.',
    defaultUrl: 'https://www.atmcd.com/sites/canada/operations/SitePage/2683130/manager-s-guides-2025',
  },
  {
    key: 'Campus',
    category: 'resources',
    group: 'external',
    adminOnly: true,
    selfAuth: true,
    mark: 'HU',
    tint: '#6B21A8',
    name: 'Campus for Hamburger University Online',
    nameFr: 'Campus for Hamburger University Online',
    blurb: 'McDonald’s training platform: Hamburger University courses.',
    blurbFr: 'La plateforme de formation de McDonald’s : les cours de Hamburger University.',
    defaultUrl: 'https://mcdcampus.sabacloud.com/Saba/Web_spf/PRODTNT128/app/dashboard',
  },
  {
    key: 'Clearview',
    category: 'shift',
    group: 'external',
    adminOnly: true,
    selfAuth: true,
    mark: 'CV',
    tint: '#3730A3',
    name: 'Clearview',
    nameFr: 'Clearview',
    blurb: 'Employee records, schedules and time cards for payroll.',
    blurbFr: 'Les dossiers d’employés, les horaires et les feuilles de temps pour la paie.',
    defaultUrl: 'https://www.qssweb.com/clearview/intro.aspx',
  },
  {
    key: 'Fujitsu',
    category: 'request',
    group: 'external',
    openToAll: true,
    selfAuth: true,
    mark: 'SSP',
    tint: '#166534',
    name: 'Fujitsu Self-Service Portal',
    nameFr: 'Portail Libre-Service Fujitsu',
    blurb: 'Fujitsu’s portal for the restaurants: equipment, tickets and support.',
    blurbFr: 'Le portail de Fujitsu pour les restaurants : équipement, billets et soutien.',
    defaultUrl: 'https://mcdonalds.fujitsu-ssp.com/restaurants',
  },
  {
    key: 'Gerants',
    category: 'resources',
    group: 'internal',
    adminOnly: true,
    selfAuth: true,
    newTab: true,
    mark: 'GJ',
    tint: '#9D2C7A',
    name: 'Gérants Jacmar',
    nameFr: 'Gérants Jacmar',
    blurb: 'The previous portal: links and tools, until it is retired.',
    blurbFr: 'L’ancien portail : liens et outils, jusqu’à son retrait.',
    defaultUrl: 'https://www.jotform.com/app/250557773348265',
  },
  {
    key: 'Prequart',
    category: 'shift',
    group: 'internal',
    openToAll: true,
    selfAuth: true,
    newTab: true,
    mark: 'VP',
    tint: '#3F6212',
    name: 'Vérification Préquart',
    nameFr: 'Vérification Préquart',
    blurb: 'The pre-shift check, before the doors open.',
    blurbFr: 'La vérification avant le début du quart.',
    defaultUrl: 'https://form.jotform.com/250407335041041',
  },
  {
    key: 'McValeurs',
    category: 'performance',
    group: 'internal',
    openToAll: true,
    selfAuth: true,
    isApp: true,
    mark: 'RM',
    tint: '#0F766E',
    name: 'Rendement McValeurs',
    nameFr: 'Rendement McValeurs',
    blurb: 'The restaurant’s McValeurs performance figures.',
    blurbFr: 'Le rendement McValeurs du restaurant.',
    defaultUrl: 'https://jacmar-restaurants-inc.github.io/portal/mcvaleurs/',
  },
  {
    key: 'Transfert',
    category: 'request',
    group: 'internal',
    openToAll: true,
    selfAuth: true,
    newTab: true,
    mark: 'BT',
    tint: '#155E75',
    name: 'Bon de Transfert',
    nameFr: 'Bon de Transfert',
    blurb: 'Moving stock between restaurants.',
    blurbFr: 'Transfert de marchandise entre restaurants.',
    defaultUrl: 'https://form.jotform.com/241685820073053',
  },
  {
    key: 'Reparation',
    category: 'request',
    group: 'internal',
    openToAll: true,
    selfAuth: true,
    newTab: true,
    mark: 'DR',
    tint: '#1D4ED8',
    name: 'Demande de Réparation / achat équipement',
    nameFr: 'Demande de Réparation / achat équipement',
    blurb: 'Ask for a repair, or for equipment to be bought.',
    blurbFr: 'Demander une réparation ou l’achat d’équipement.',
    defaultUrl: 'https://form.jotform.com/250557976258068',
  },
  {
    key: 'Calendrier',
    category: 'links',
    group: 'internal',
    openToAll: true,
    selfAuth: true,
    newTab: true,
    mark: 'PG',
    tint: '#4338CA',
    name: 'Calendrier Planner Gestion',
    nameFr: 'Calendrier Planner Gestion',
    blurb: 'The management planner, as a calendar.',
    blurbFr: 'Le planificateur de gestion, en calendrier.',
    defaultUrl:
      'https://calendar.google.com/calendar/embed?src=c_6799d3cb9c9f932adfdcfe41158fdfa98e411018828baf21c041777666a71535%40group.calendar.google.com&ctz=America%2FToronto&mode=WEEK',
  },
  {
    key: 'Ithq',
    category: 'links',
    group: 'internal',
    openToAll: true,
    selfAuth: true,
    newTab: true,
    mark: 'IT',
    tint: '#6D28D9',
    name: 'ITHQ - Google Drive',
    nameFr: 'ITHQ - Google Drive',
    blurb: 'The ITHQ folder on Google Drive.',
    blurbFr: 'Le dossier ITHQ sur Google Drive.',
    defaultUrl: 'https://drive.google.com/drive/folders/1A0ldsrpbyk4FENhida3XQSk6eat7P9oZ',
  },
  {
    key: 'JreTracker',
    category: 'performance',
    group: 'internal',
    openToAll: true,
    selfAuth: true,
    isApp: true,
    mark: 'JR',
    tint: '#86198F',
    name: 'JRE Tracker',
    nameFr: 'JRE Tracker',
    blurb: 'The JRE tracker for the restaurant’s results.',
    blurbFr: 'Le suivi JRE des résultats du restaurant.',
    defaultUrl: 'https://jacmar-restaurants-inc.github.io/portal/jre-tracker/',
  },
];

export const catalogueApp = (key: string) => CATALOGUE.find((a) => a.key === key);

/** APP_URL_<KEY> wins, then the default. Null means "Pas encore relié". */
export function appUrl(app: CatalogueApp, env: Record<string, string | undefined> = process.env): string | null {
  return env[`APP_URL_${app.key.toUpperCase()}`]?.trim() || app.defaultUrl || null;
}

/** How a held card opens: the label, and whether it leaves in a new tab (§76/§77/§82). */
export function openStyle(app: CatalogueApp): { label: 'open' | 'openApp'; newTab: boolean } {
  if (app.selfAuth && !app.isApp) return { label: 'open', newTab: app.group === 'external' || Boolean(app.newTab) };
  return { label: 'openApp', newTab: false };
}

/** WCAG relative luminance, for the letter squares' ink. */
function luminance(hex: string): number {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
export const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
};
/** White ink on a letter square when it reads at 4.5:1, dark otherwise. */
export const inkFor = (tint: string) => (contrast('#FFFFFF', tint) >= 4.5 ? '#FFFFFF' : '#1A1A1A');
