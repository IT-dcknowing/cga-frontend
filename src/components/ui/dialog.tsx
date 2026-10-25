import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ComponentProps } from 'react';
import { fr } from '@/lib/i18n/fr';
import { cn } from '@/lib/utils';

/*
 * 04-UX-UI §6 (Modal) : 560 px pour un formulaire, 720 px pour un aperçu, plein écran sur mobile
 * (§8) ; titre, sous-titre `muted`, corps, pied avec l'action principale à droite et « Annuler » à
 * gauche. Radix gère le focus piégé, Échap et l'annonce aux lecteurs d'écran (§9). Un clic hors de
 * la modale ne la ferme pas : la saisie d'un formulaire n'est jamais perdue par mégarde.
 */
export const Dialog = DialogPrimitive.Root;
export const DialogClose = DialogPrimitive.Close;

type DialogContentProps = Omit<ComponentProps<typeof DialogPrimitive.Content>, 'title'> & {
  title: string;
  description?: string;
  size?: 'form' | 'preview';
};

export function DialogContent({
  title,
  description,
  size = 'form',
  className,
  children,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/40" />
      <DialogPrimitive.Content
        data-slot="dialog"
        // Sans sous-titre, Radix attend un `aria-describedby` explicitement vide.
        {...(description === undefined ? { 'aria-describedby': undefined } : {})}
        onInteractOutside={(event) => {
          event.preventDefault();
        }}
        className={cn(
          'fixed inset-0 z-50 flex flex-col bg-card text-ink',
          'md:inset-auto md:left-1/2 md:top-1/2 md:max-h-[calc(100vh-4rem)] md:w-[calc(100%-3rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-card md:border md:border-border md:shadow-card',
          size === 'form' ? 'md:max-w-[560px]' : 'md:max-w-[720px]',
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-card-title font-bold">
              {title}
            </DialogPrimitive.Title>
            {description !== undefined ? (
              <DialogPrimitive.Description className="mt-0.5 text-note text-muted">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          <DialogPrimitive.Close
            aria-label={fr.common.close}
            className="-mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-control text-muted hover:bg-neutral-soft hover:text-ink md:size-8"
          >
            <X className="size-4" aria-hidden="true" />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Corps de la modale : il défile seul quand le contenu dépasse la hauteur de l'écran. */
export function DialogBody({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-body"
      className={cn('grid min-h-0 flex-1 gap-4 overflow-y-auto px-5 py-4', className)}
      {...props}
    />
  );
}

/**
 * Pied : « Annuler » à gauche, action principale à droite ; sur mobile, boutons pleine largeur,
 * l'action principale au-dessus (04-UX-UI §8). Les enfants se donnent dans l'ordre « Annuler », action.
 */
export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'flex flex-col-reverse gap-2 border-t border-border px-5 py-3 md:flex-row md:items-center md:justify-between',
        '[&>[data-slot=button]]:w-full md:[&>[data-slot=button]]:w-auto',
        className,
      )}
      {...props}
    />
  );
}
