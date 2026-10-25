import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/*
 * 04-UX-UI §6 (Form fields) : libellé au-dessus, astérisque `danger` si obligatoire, aide en note
 * sous le champ, erreur en `danger` sous le champ.
 * Convention d'identifiants, pour que le champ puisse s'y relier lui-même (`aria-describedby`) :
 * l'aide est `{id}-hint`, l'erreur `{id}-error`.
 */
type FormFieldProps = {
  /** Identifiant du champ enveloppé : le libellé pointe dessus. */
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
};

export function FormField({
  id,
  label,
  required = false,
  hint,
  error,
  className,
  children,
}: FormFieldProps) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <label htmlFor={id} className="text-label font-semibold text-muted">
        {label}
        {required ? (
          <span className="text-danger" aria-hidden="true">
            &nbsp;*
          </span>
        ) : null}
      </label>
      {children}
      {hint !== undefined ? (
        <p id={`${id}-hint`} className="text-note text-muted">
          {hint}
        </p>
      ) : null}
      {error !== undefined ? (
        <p id={`${id}-error`} className="text-note text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
