import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiValidationError } from '@/lib/api-errors';

/**
 * 03-APPFLOW §7 (422) : erreurs sous chaque champ, focus sur le premier champ en erreur, saisie
 * conservée. `fields` relie le nom de champ de l'API à celui du formulaire. Renvoie `false` quand
 * l'erreur n'est pas une 422 ou ne vise aucun champ de l'écran : l'appelant affiche alors un toast.
 */
export function showValidationErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: Partial<Record<string, Path<T>>>,
): boolean {
  if (!(error instanceof ApiValidationError)) {
    return false;
  }

  let shown = false;

  for (const [apiField, message] of Object.entries(error.fields)) {
    const field = fields[apiField];

    if (field !== undefined) {
      setError(field, { type: 'server', message }, { shouldFocus: !shown });
      shown = true;
    }
  }

  return shown;
}
