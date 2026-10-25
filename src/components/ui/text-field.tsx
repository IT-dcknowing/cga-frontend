import type { ComponentProps } from 'react';
import { fieldProps } from '@/components/ui/field-props';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';

type TextFieldProps = Omit<ComponentProps<'input'>, 'id' | 'required'> & {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
};

/**
 * `FormField` + `Input` (04-UX-UI §6) : libellé, astérisque si obligatoire, aide et erreur reliées
 * au champ (§9). Les autres propriétés (celles de `register`, `type`…) vont au champ.
 */
export function TextField({
  id,
  label,
  required = false,
  hint,
  error,
  className,
  ...inputProps
}: TextFieldProps) {
  return (
    <FormField
      id={id}
      label={label}
      required={required}
      hint={hint}
      error={error}
      className={className}
    >
      <Input
        {...fieldProps(id, error, hint !== undefined)}
        aria-required={required || undefined}
        {...inputProps}
      />
    </FormField>
  );
}
