import { fieldProps } from '@/components/ui/field-props';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';

/*
 * Champ de fichier (justificatif, pièce, preuve) : libellé, aide et erreur de `FormField`. Les types
 * acceptés ne sont qu'un confort : le serveur vérifie le fichier par son contenu (02-TRD §6.7).
 */
type FileFieldProps = {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  /** Types MIME proposés par le sélecteur du navigateur. */
  accept?: string;
  disabled?: boolean;
  className?: string;
  onChange: (file: File | null) => void;
};

export const DOCUMENT_TYPES = 'application/pdf,image/jpeg,image/png';

export function FileField({
  id,
  label,
  required = false,
  hint,
  error,
  accept = DOCUMENT_TYPES,
  disabled,
  className,
  onChange,
}: FileFieldProps) {
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
        type="file"
        accept={accept}
        aria-required={required || undefined}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.files?.[0] ?? null);
        }}
      />
    </FormField>
  );
}
