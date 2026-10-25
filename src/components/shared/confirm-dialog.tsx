import { FormDialog, type FormDialogProps } from '@/components/shared/form-dialog';
import { fr } from '@/lib/i18n/fr';

type ConfirmDialogProps = Omit<FormDialogProps, 'variant'> & {
  /** Effets de l'action, repris en liste avant la confirmation (03-APPFLOW §7). */
  effects: readonly string[];
};

/**
 * Confirmation d'une action irréversible (04-UX-UI §6, ConfirmDialog) : liste des effets, champs
 * éventuels (motif, case « Je confirme » quand l'effet est majeur), bouton `danger`.
 */
export function ConfirmDialog({ effects, children, ...props }: ConfirmDialogProps) {
  return (
    <FormDialog variant="danger" {...props}>
      <div>
        <p className="text-label font-semibold text-muted">{fr.common.effects}</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-body">
          {effects.map((effect) => (
            <li key={effect}>{effect}</li>
          ))}
        </ul>
      </div>
      {children}
    </FormDialog>
  );
}
