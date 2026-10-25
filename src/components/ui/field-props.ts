/**
 * Attributs d'accessibilité d'un champ de `FormField` (04-UX-UI §9) : l'erreur et l'aide sont reliées
 * au champ par `aria-describedby`, selon la convention `{id}-hint` / `{id}-error` de `FormField`.
 */
export function fieldProps(id: string, error: string | undefined, hasHint = false) {
  const describedBy = [hasHint ? `${id}-hint` : null, error !== undefined ? `${id}-error` : null]
    .filter((part) => part !== null)
    .join(' ');

  return {
    id,
    'aria-invalid': error !== undefined,
    'aria-describedby': describedBy === '' ? undefined : describedBy,
  };
}
