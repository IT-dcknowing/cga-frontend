import type { FormEventHandler, ReactNode } from 'react';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { fr } from '@/lib/i18n/fr';

export type FormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  submitLabel: string;
  submitting: boolean;
  onSubmit: FormEventHandler<HTMLFormElement>;
  /** Conflit métier (409) : le message de l'API, en bandeau en tête du corps (03-APPFLOW §7). */
  conflict?: string | null;
  /** `danger` pour une action irréversible (03-APPFLOW §7, 04-UX-UI §6). */
  variant?: 'primary' | 'danger';
  /** 720 px pour un formulaire long (fiche complète), 560 px sinon (04-UX-UI §6). */
  size?: 'form' | 'preview';
  children: ReactNode;
};

/**
 * Modale de formulaire (04-UX-UI §6) : champs dans le corps, « Annuler » à gauche, action principale
 * à droite. Pendant l'envoi, la modale ne se ferme pas et ses boutons sont désactivés.
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  submitting,
  onSubmit,
  conflict = null,
  variant = 'primary',
  size = 'form',
  children,
}: FormDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting) {
          onOpenChange(next);
        }
      }}
    >
      <DialogContent title={title} description={description} size={size}>
        <form noValidate onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody>
            {conflict !== null ? (
              <Banner tone="danger" role="alert">
                {conflict}
              </Banner>
            ) : null}
            {children}
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" disabled={submitting}>
                {fr.common.cancel}
              </Button>
            </DialogClose>
            <Button type="submit" variant={variant} loading={submitting}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
