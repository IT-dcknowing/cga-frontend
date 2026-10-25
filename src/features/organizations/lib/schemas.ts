import { z } from 'zod';
import type { OrganizationInput } from '@/features/organizations/api/organizations-api';
import { fr } from '@/lib/i18n/fr';

/*
 * Contrôles de confort de la fiche d'un CGA (F-ORG-02) : le serveur refait toutes les vérifications
 * (format du téléphone, unicité du n° d'agrément, dates) et ses refus 422 s'affichent sous les
 * champs. Aucun motif de numéro ni longueur en dur ici.
 */
const errors = fr.organization.errors;

/** Fiche du registre : dénomination, ville, téléphone et statut d'agrément obligatoires (F-ORG-02). */
export const registrationShape = {
  name: z.string().trim().min(1, errors.nameRequired),
  sigle: z.string().trim(),
  city: z.string().trim().min(1, errors.cityRequired),
  phone_1: z.string().trim().min(1, errors.phoneRequired),
  email: z.union([z.literal(''), z.email(errors.emailFormat)]),
  agreement_status: z.enum(['pending', 'granted']),
  agreement_number: z.string().trim(),
  agreement_date: z.string(),
};

/** RG-ORG-03 : un CGA agréé a son numéro et sa date d'agrément. */
export function checkAgreement(
  values: { agreement_status: string; agreement_number: string; agreement_date: string },
  context: z.RefinementCtx,
): void {
  if (values.agreement_status !== 'granted') {
    return;
  }

  if (values.agreement_number === '') {
    context.addIssue({
      code: 'custom',
      path: ['agreement_number'],
      message: errors.agreementNumberRequired,
    });
  }

  if (values.agreement_date === '') {
    context.addIssue({
      code: 'custom',
      path: ['agreement_date'],
      message: errors.agreementDateRequired,
    });
  }
}

export const registrationSchema = z.object(registrationShape).superRefine(checkAgreement);

export type RegistrationForm = z.infer<typeof registrationSchema>;

export const emptyRegistration: RegistrationForm = {
  name: '',
  sigle: '',
  city: '',
  phone_1: '',
  email: '',
  agreement_status: 'pending',
  agreement_number: '',
  agreement_date: '',
};

/** Champ facultatif laissé vide → `null` pour l'API. */
export function emptyToNull(value: string): string | null {
  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed;
}

/** Saisie → corps de `POST` / `PUT /network/organizations` ; sans agrément, ni numéro ni date. */
export function registrationInput(values: RegistrationForm): OrganizationInput {
  const granted = values.agreement_status === 'granted';

  return {
    name: values.name,
    sigle: emptyToNull(values.sigle),
    city: values.city,
    phone_1: values.phone_1,
    email: emptyToNull(values.email),
    agreement_status: values.agreement_status,
    agreement_number: granted ? values.agreement_number : null,
    agreement_date: granted ? values.agreement_date : null,
  };
}

/** Champs de l'API → champs du formulaire, pour placer ses erreurs 422 (03-APPFLOW §7). */
export const registrationApiFields = {
  name: 'name',
  sigle: 'sigle',
  city: 'city',
  phone_1: 'phone_1',
  email: 'email',
  agreement_status: 'agreement_status',
  agreement_number: 'agreement_number',
  agreement_date: 'agreement_date',
} as const;

/** Gérant invité (prénom, nom, téléphone), à la création ou depuis la fiche. */
export const managerSchema = z.object({
  first_name: z.string().trim().min(1, errors.firstNameRequired),
  last_name: z.string().trim().min(1, errors.lastNameRequired),
  phone: z.string().trim().min(1, errors.phoneRequired),
});

export type ManagerForm = z.infer<typeof managerSchema>;
