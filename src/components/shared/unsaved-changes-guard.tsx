import { useEffect } from 'react';
import { useBlocker } from 'react-router';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { fr } from '@/lib/i18n/fr';

/**
 * 03-APPFLOW §7 (Formulaire modifié non enregistré) : quitter la page ouvre la modale « Quitter
 * sans enregistrer ? ». Recharger la page ou fermer l'onglet passe par la confirmation du
 * navigateur. Rien n'est bloqué tant que `when` est faux.
 */
export function UnsavedChangesGuard({ when }: { when: boolean }) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      when &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );

  useEffect(() => {
    if (!when) {
      return;
    }

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener('beforeunload', warn);

    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [when]);

  const stay = () => {
    blocker.reset?.();
  };

  return (
    <Dialog
      open={blocker.state === 'blocked'}
      onOpenChange={(open) => {
        if (!open) {
          stay();
        }
      }}
    >
      <DialogContent title={fr.unsaved.title} description={fr.unsaved.body}>
        <DialogFooter>
          <Button variant="secondary" onClick={stay}>
            {fr.unsaved.stay}
          </Button>
          <Button variant="danger" onClick={() => blocker.proceed?.()}>
            {fr.unsaved.leave}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
