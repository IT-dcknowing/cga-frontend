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
        <div className="w-full max-w-[440px]">
          <div className="mb-6 text-center">
            <span className="inline-block rounded-full bg-primary-soft px-3.5 py-1 text-[11px] font-extrabold uppercase tracking-widest text-primary-dark">
              {fr.public.banner}
            </span>
            <p className="mt-3 text-center text-[32px] font-extrabold tracking-tight text-ink">
              CGA <span className="text-primary">Connect</span>
            </p>
            <p className="mt-1 text-center text-[13px] font-medium text-muted">
              Plateforme cloud du réseau des Centres de Gestion Agréés
            </p>
          </div>

          <Card className="rounded-card border border-border bg-card p-6 shadow-none">
            <CardContent className="p-0">
              <h1 className="text-page-title-mobile font-extrabold text-ink md:text-page-title">
                {title}
              </h1>
              <div className="mt-5">{children}</div>
            </CardContent>
          </Card>

          <p className="mt-6 text-center text-note text-muted">{fr.public.note}</p>
        </div>
      </main>
    </div>
  );
}
