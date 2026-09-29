/**
 * JM DevOps' words, French and English. The old app was English only. An issue is a
 * "tâche" in French: the owner's word for them. Held to the portal's rules by the i18n
 * test: no dash as punctuation, a non-breaking space before French ? : ! ;.
 */

import type { Lang } from '../i18n';

const nb = ' ';

export const devopsDict = {
  app_title: { fr: 'JM DevOps', en: 'JM DevOps' },
  brand_home: { fr: 'JM DevOps, aller à la vue d’ensemble', en: 'JM DevOps, go to the overview' },
  no_access: { fr: 'JM DevOps est réservé aux administrateurs.', en: 'JM DevOps is for administrators only.' },

  nav_overview: { fr: 'Vue d’ensemble', en: 'Overview' },
  nav_projects: { fr: 'Projets', en: 'Projects' },
  nav_projects_menu: { fr: 'Projets JM DevOps', en: 'JM DevOps projects' },

  overview_line: { fr: 'Tous les projets et leurs tâches.', en: 'Every project and its issues.' },
  search_projects: { fr: 'Rechercher un projet', en: 'Search projects' },
  no_projects: { fr: 'Aucun projet pour l’instant.', en: 'No projects yet.' },
  no_project_match: { fr: 'Aucun projet ne correspond.', en: 'No project matches.' },

  new_project: { fr: 'Nouveau projet', en: 'New project' },
  edit_project: { fr: 'Modifier le projet', en: 'Edit project' },
  delete_project: { fr: 'Supprimer le projet', en: 'Delete project' },
  delete_project_body: {
    fr: 'seront supprimées définitivement, avec leurs commentaires et tout l’historique du projet. Rien n’est gardé et cela ne peut pas être annulé.',
    en: 'will be deleted for good, with their comments and the project’s whole history. Nothing is kept and it cannot be undone.',
  },
  delete_project_body_one: {
    fr: 'sera supprimée définitivement, avec ses commentaires et tout l’historique du projet. Rien n’est gardé et cela ne peut pas être annulé.',
    en: 'will be deleted for good, with its comments and the project’s whole history. Nothing is kept and it cannot be undone.',
  },
  delete_project_empty: {
    fr: 'Ce projet n’a aucune tâche. Il sera supprimé définitivement, avec son historique. Cela ne peut pas être annulé.',
    en: 'This project has no issues. It will be deleted for good, with its history. It cannot be undone.',
  },
  delete_type_name: { fr: 'Pour confirmer, tapez le nom exact du projet', en: 'To confirm, type the project’s exact name' },
  manage: { fr: 'Gérer', en: 'Manage' },
  proj_name: { fr: 'Nom', en: 'Name' },
  proj_repo: { fr: 'Lien GitHub (facultatif)', en: 'GitHub link (optional)' },
  create: { fr: 'Créer', en: 'Create' },
  save: { fr: 'Enregistrer', en: 'Save' },
  cancel: { fr: 'Annuler', en: 'Cancel' },
  close: { fr: 'Fermer', en: 'Close' },

  tab_board: { fr: 'Tableau', en: 'Board' },
  tab_list: { fr: 'Liste', en: 'List' },
  tab_dashboard: { fr: 'Tableau de bord', en: 'Dashboard' },
  new_issue: { fr: 'Nouvelle tâche', en: 'New issue' },
  issues_n: { fr: 'tâches', en: 'issues' },
  issue_one: { fr: 'tâche', en: 'issue' },
  no_issues: { fr: 'Aucune tâche', en: 'No issues' },
  no_issue_match: { fr: 'Aucune tâche ne correspond aux filtres.', en: 'No issue matches the filters.' },
  cancelled_in_list: { fr: 'annulées, dans la liste', en: 'cancelled, in the list' },

  status_new: { fr: 'Nouvelle', en: 'New' },
  status_active: { fr: 'En cours', en: 'Active' },
  status_completed: { fr: 'Terminée', en: 'Completed' },
  status_cancelled: { fr: 'Annulée', en: 'Cancelled' },
  type_bug: { fr: 'Bogue', en: 'Bug' },
  type_feature: { fr: 'Fonctionnalité', en: 'Feature' },
  type_task: { fr: 'Tâche', en: 'Task' },
  priority_critical: { fr: 'Critique', en: 'Critical' },
  priority_high: { fr: 'Haute', en: 'High' },
  priority_medium: { fr: 'Moyenne', en: 'Medium' },
  priority_low: { fr: 'Basse', en: 'Low' },

  filter_search: { fr: 'Rechercher une tâche', en: 'Search issues' },
  filter_all_types: { fr: 'Tous les types', en: 'All types' },
  filter_all_priorities: { fr: 'Toutes les priorités', en: 'All priorities' },
  filter_everyone: { fr: 'Tout le monde', en: 'Everyone' },
  filter_unassigned: { fr: 'Personne', en: 'Nobody' },
  filter_clear: { fr: 'Effacer les filtres', en: 'Clear filters' },

  col_key: { fr: 'Clé', en: 'Key' },
  field_title: { fr: 'Titre', en: 'Title' },
  field_status: { fr: 'Statut', en: 'Status' },
  field_type: { fr: 'Type', en: 'Type' },
  field_priority: { fr: 'Priorité', en: 'Priority' },
  field_assignee: { fr: 'Assignée à', en: 'Assignee' },
  field_dueDate: { fr: 'Échéance', en: 'Due date' },
  field_description: { fr: 'Description', en: 'Description' },
  nobody: { fr: 'Personne', en: 'Nobody' },
  due: { fr: 'Échéance', en: 'Due' },
  overdue: { fr: 'En retard', en: 'Overdue' },
  overdue_n: { fr: 'en retard', en: 'overdue' },
  move_to: { fr: 'Déplacer vers', en: 'Move to' },

  dash_completion: { fr: 'Avancement', en: 'Completion' },
  dash_done_of: { fr: 'terminées sur', en: 'completed of' },
  dash_cancelled_note: { fr: 'Les tâches annulées ne comptent pas.', en: 'Cancelled issues are not counted.' },
  dash_by_status: { fr: 'Par statut', en: 'By status' },
  dash_by_type: { fr: 'Par type', en: 'By type' },
  dash_by_priority: { fr: 'Par priorité', en: 'By priority' },

  created_by: { fr: 'Créée par', en: 'Created by' },
  created_on: { fr: 'le', en: 'on' },
  from_sheet: { fr: 'la feuille de calcul', en: 'the spreadsheet' },
  created_imported: { fr: 'Importée de la feuille de calcul, créée le', en: 'Imported from the spreadsheet, created on' },
  pill_new: { fr: 'nouvelle', en: 'new' },
  pill_new_n: { fr: 'nouvelles', en: 'new' },
  pill_active: { fr: 'en cours', en: 'active' },
  pill_active_n: { fr: 'en cours', en: 'active' },
  pill_completed: { fr: 'terminée', en: 'done' },
  pill_completed_n: { fr: 'terminées', en: 'done' },
  sheet_text: { fr: 'noté dans la feuille', en: 'as written in the sheet' },
  saving: { fr: 'Enregistrement…', en: 'Saving…' },
  saved: { fr: 'Enregistré', en: 'Saved' },
  cancel_reason: { fr: 'Raison de l’annulation', en: 'Reason for cancelling' },
  cancel_reason_hint: { fr: 'Par exemple, en double avec une autre tâche, ou n’est plus nécessaire.', en: 'For example, a duplicate of another issue, or no longer needed.' },
  cancel_issue: { fr: 'Annuler la tâche', en: 'Cancel the issue' },
  back_to_project: { fr: 'Retour au projet', en: 'Back to the project' },

  comments: { fr: 'Commentaires', en: 'Comments' },
  no_comments: { fr: 'Aucun commentaire.', en: 'No comments.' },
  add_comment: { fr: 'Ajouter un commentaire', en: 'Add a comment' },
  post_comment: { fr: 'Publier', en: 'Post' },
  sheet_notes: { fr: 'Notes de la feuille', en: 'Notes from the sheet' },

  history: { fr: 'Historique', en: 'History' },
  ev_created: { fr: 'a créé la tâche', en: 'created the issue' },
  ev_imported: { fr: 'Importée de la feuille de calcul', en: 'Imported from the spreadsheet' },
  ev_changed: { fr: 'a changé', en: 'changed' },
  ev_cleared: { fr: 'a retiré', en: 'cleared' },
  ev_reason: { fr: 'Raison', en: 'Reason' },

  delete_issue: { fr: 'Supprimer la tâche', en: 'Delete the issue' },
  delete_body: {
    fr: 'La tâche et ses commentaires sont supprimés. Son numéro n’est jamais redonné, et l’historique du projet en garde une copie.',
    en: 'The issue and its comments are deleted. Its number is never given out again, and the project history keeps a copy.',
  },
  delete_type_key: { fr: 'Pour confirmer, tapez son numéro', en: 'To confirm, type its number' },
  delete_confirm: { fr: 'Supprimer', en: 'Delete' },

  out_changed: {
    fr: `Quelqu’un a modifié ceci entre-temps. La page montre maintenant sa version${nb}; refaites votre changement si besoin.`,
    en: 'Someone changed this meanwhile. The page now shows their version; make your change again if needed.',
  },
  out_invalid: { fr: 'Cette valeur n’est pas acceptée.', en: 'That value is not accepted.' },
  out_not_found: { fr: 'Introuvable. Il a peut-être été supprimé.', en: 'Not found. It may have been deleted.' },
  out_name_taken: { fr: 'Un projet porte déjà ce nom.', en: 'A project already has that name.' },
  out_denied: { fr: 'Réservé aux administrateurs.', en: 'Administrators only.' },
  out_expired: { fr: 'Votre session a expiré. Rechargez la page pour vous reconnecter.', en: 'Your session has expired. Reload the page to sign in again.' },
  out_error: { fr: 'Une erreur est survenue. Réessayez.', en: 'Something went wrong. Please try again.' },
  title_required: { fr: 'Le titre est obligatoire.', en: 'A title is required.' },

  theme_label: { fr: 'Thème', en: 'Theme' },
  theme_light: { fr: 'Clair', en: 'Light' },
  theme_dark: { fr: 'Sombre', en: 'Dark' },
} as const satisfies Record<string, { fr: string; en: string }>;

export type DevopsKey = keyof typeof devopsDict;

export function dt(lang: Lang, key: DevopsKey): string {
  return devopsDict[key][lang];
}

/** "1 tâche", "0 tâche", "2 tâches"; "1 issue", "0 issues". French is singular below 2. */
export function issuesWord(lang: Lang, n: number): string {
  return dt(lang, (lang === 'fr' ? n < 2 : n === 1) ? 'issue_one' : 'issues_n');
}
