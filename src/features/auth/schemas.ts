import { z } from 'zod';
import { config } from '@/lib/config';
import { fr } from '@/lib/i18n/fr';

/*
 * Champs partagés des écrans d'accès (02-TRD §5.2). Contrôles de confort seulement : le serveur
 * refait chaque vérification (02-TRD §6.7) et refuse en plus les mots de passe trop courants.
 */
export function passwordField() {
  return z
    .string()
    .min(config.passwordMinLength, fr.validation.passwordLength(String(config.passwordMinLength)));
}

/** Code reçu par SMS : uniquement des chiffres, en nombre fixé par `config.codeLength`. */
export function codeField() {
  return z
    .string()
    .trim()
    .regex(
      new RegExp(`^\\d{${config.codeLength}}$`),
      fr.validation.codeFormat(String(config.codeLength)),
    );
}

/** Les deux saisies du nouveau mot de passe doivent être identiques ; l'erreur va sous la seconde. */
export function confirmationMatches(values: { password: string; confirmation: string }): boolean {
  return values.password === values.confirmation;
}

export const confirmationError = {
  message: fr.validation.passwordMismatch,
  path: ['confirmation'],
};
