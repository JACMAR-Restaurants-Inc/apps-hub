/**
 * Forms' words, French and English. Held to the portal's rules by the i18n test: no dash
 * as punctuation, a non-breaking space before French ? : ! ;.
 */

import type { Lang } from '../i18n';

export const formsDict = {
  title: { fr: 'Formulaires', en: 'Forms' },
  line: { fr: 'Les formulaires que les RH vous ont partagés.', en: 'The forms HR shared with you.' },
  to_fill: { fr: 'À remplir', en: 'To fill' },
  none_to_fill: { fr: 'Aucun formulaire ne vous est partagé pour l’instant.', en: 'No form is shared with you for now.' },
  fill: { fr: 'Remplir', en: 'Fill in' },
  sent_on: { fr: 'Envoyé le {date}', en: 'Sent on {date}' },
  manage: { fr: 'Gestion des formulaires', en: 'Managing forms' },
  manage_line: { fr: 'Tous les formulaires, leur état et leurs réponses.', en: 'Every form, its state and its answers.' },
  no_forms: { fr: 'Aucun formulaire pour l’instant.', en: 'No forms yet.' },
  status_draft: { fr: 'Brouillon', en: 'Draft' },
  status_open: { fr: 'Ouvert', en: 'Open' },
  status_closed: { fr: 'Fermé', en: 'Closed' },
  responses: { fr: 'Réponses', en: 'Answers' },
  responses_of: { fr: 'Réponses de vos restaurants', en: 'Answers from your restaurants' },

  not_available: { fr: 'Ce formulaire n’est pas disponible pour vous.', en: 'This form is not available to you.' },
  back: { fr: 'Retour aux formulaires', en: 'Back to forms' },
  you: { fr: 'Vos renseignements', en: 'About you' },
  you_line: { fr: 'Tirés du répertoire d’accès, ils accompagnent votre envoi.', en: 'From the access directory, sent with your answers.' },
  name: { fr: 'Nom', en: 'Name' },
  number: { fr: 'Numéro d’employé', en: 'Employee number' },
  email: { fr: 'Courriel', en: 'Email' },
  restaurant: { fr: 'Restaurant', en: 'Restaurant' },
  choose: { fr: 'Choisir…', en: 'Choose…' },
  required_mark: { fr: 'obligatoire', en: 'required' },
  signature: { fr: 'Signature', en: 'Signature' },
  signature_line: {
    fr: 'En tapant votre nom, vous confirmez que ces réponses sont exactes et vous acceptez ce qui précède. La date et l’heure sont enregistrées.',
    en: 'By typing your name, you confirm these answers are true and agree to the above. The date and time are recorded.',
  },
  signed_name: { fr: 'Votre nom complet', en: 'Your full name' },
  send: { fr: 'Envoyer', en: 'Send' },
  sending: { fr: 'Envoi…', en: 'Sending…' },
  sent: { fr: 'Merci, votre formulaire a été envoyé.', en: 'Thank you, your form was sent.' },
  already: { fr: 'Vous avez déjà envoyé ce formulaire.', en: 'You already sent this form.' },

  err_required: { fr: 'Ce champ est obligatoire.', en: 'This field is required.' },
  err_invalid: { fr: 'Cette réponse n’est pas valide.', en: 'This answer is not valid.' },
  err_too_long: { fr: 'Cette réponse est trop longue.', en: 'This answer is too long.' },
  err_fix: { fr: 'Corrigez les champs indiqués.', en: 'Fix the fields shown.' },
  err_changed: {
    fr: 'Les RH viennent de modifier ce formulaire. Rechargez la page pour voir les nouvelles questions.',
    en: 'HR just changed this form. Reload the page to see the new questions.',
  },
  err_not_open: { fr: 'Ce formulaire n’accepte plus de réponses.', en: 'This form no longer takes answers.' },
  err_denied: { fr: 'Ce formulaire ne vous est plus partagé.', en: 'This form is no longer shared with you.' },
  err_too_many: { fr: 'Trop de tentatives. Réessayez dans une heure.', en: 'Too many attempts. Try again in an hour.' },
  err_error: { fr: 'L’envoi a échoué. Réessayez.', en: 'Sending failed. Try again.' },

  no_responses: { fr: 'Aucune réponse pour l’instant.', en: 'No answers yet.' },
  submitted: { fr: 'Envoyé', en: 'Sent' },
  version: { fr: 'Version', en: 'Version' },
  cleared: { fr: 'Effacé', en: 'Cleared' },
  yes: { fr: 'Oui', en: 'Yes' },
} as const;

export type FormsKey = keyof typeof formsDict;

export function ft(lang: Lang, key: FormsKey): string {
  return formsDict[key][lang];
}
