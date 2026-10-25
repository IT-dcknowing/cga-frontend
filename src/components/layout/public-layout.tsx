import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { fr } from '@/lib/i18n/fr';

/*
 * Coque des pages publiques — connexion, activation, vérification (04-UX-UI §5.3) :
 * fond `bg`, bandeau « République de Côte d'Ivoire · Dispositif CGA » (§7), logo au-dessus d'une
 * carte centrée de 420 px au maximum, mention du réseau en note sous la carte.
 */
type PublicLayoutProps = {
  /** Titre de l'écran : unique titre de niveau 1 de la page (04-UX-UI §3). */
  title: string;
  children: ReactNode;
};

export function PublicLayout({ title, children }: PublicLayoutProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <p className="bg-primary-dark px-4 py-2 text-center text-note font-semibold text-white md:px-6">
        {fr.public.banner}
      </p>

      <main className="flex flex-1 items-start justify-center px-4 py-8 md:items-center md:px-6">
        <div className="w-full max-w-[420px]">
          <p className="text-center text-page-title font-extrabold tracking-tight text-primary-dark">
            {fr.public.brand}
          </p>
          {/* Liseré décoratif sous le titre (04-UX-UI §2 : `accent`, jamais pour du texte). */}
          <span className="mx-auto mt-2 mb-6 block h-0.5 w-10 rounded-full bg-accent" />

          <Card>
            <CardContent className="p-6">
              <h1 className="text-page-title font-extrabold text-ink">{title}</h1>
              <div className="mt-5">{children}</div>
            </CardContent>
          </Card>

          <p className="mt-6 text-center text-note text-muted">{fr.public.note}</p>
        </div>
      </main>
    </div>
  );
}
