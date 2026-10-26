import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// 04-UX-UI §6 : case à cocher + libellé, erreur en `danger` sous la ligne.
export function Checkbox({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn(
        'mt-0.5 size-4 shrink-0 rounded-[4px] border border-border accent-primary',
        className,
      )}
      {...props}
    />
  );
}

type CheckboxFieldProps = {
  id: string;
  label: ReactNode;
  error?: string;
  children: ReactNode;
};

/** Ligne « case + libellé » : la cible tactile couvre tout le libellé (04-UX-UI §4). */
export function CheckboxField({ id, label, error, children }: CheckboxFieldProps) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="flex min-h-11 items-start gap-2 text-body md:min-h-0">
        {children}
        <span>{label}</span>
      </label>
      {error !== undefined ? (
        <p id={`${id}-error`} className="text-note text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
