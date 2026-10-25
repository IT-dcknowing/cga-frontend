import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// 04-UX-UI §6 : bouton radio + libellé ; la cible tactile couvre tout le libellé (§4).
export function Radio({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type="radio"
      data-slot="radio"
      className={cn('mt-0.5 size-4 shrink-0 accent-primary', className)}
      {...props}
    />
  );
}

type RadioOptionProps = {
  label: ReactNode;
  children: ReactNode;
};

export function RadioOption({ label, children }: RadioOptionProps) {
  return (
    <label className="flex min-h-11 items-start gap-2 text-body md:min-h-0">
      {children}
      <span>{label}</span>
    </label>
  );
}

type RadioGroupFieldProps = {
  /** Identifiant du groupe : l'erreur est `{id}-error`, comme pour `FormField`. */
  id: string;
  legend: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: ReactNode;
};

/** Groupe de boutons radio : légende au style d'un libellé de champ, erreur sous le groupe. */
export function RadioGroupField({
  id,
  legend,
  required = false,
  error,
  className,
  children,
}: RadioGroupFieldProps) {
  return (
    <fieldset
      id={id}
      aria-describedby={error !== undefined ? `${id}-error` : undefined}
      className={cn('grid gap-1.5', className)}
    >
      <legend className="mb-1.5 text-label font-semibold text-muted">
        {legend}
        {required ? (
          <span className="text-danger" aria-hidden="true">
            &nbsp;*
          </span>
        ) : null}
      </legend>
      <div className="flex flex-wrap gap-x-6 gap-y-1">{children}</div>
      {error !== undefined ? (
        <p id={`${id}-error`} className="text-note text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
