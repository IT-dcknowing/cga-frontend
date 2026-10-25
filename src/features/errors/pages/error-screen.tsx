import { FileQuestion, ServerCrash, ShieldOff, type LucideIcon } from 'lucide-react';
import { Link, useRouteError } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { PublicLayout } from '@/components/layout/public-layout';
import { useInShell } from '@/components/layout/shell-context';
import { Button } from '@/components/ui/button';
import { authRoutes, spaceHomeFor } from '@/features/auth/lib/destination';
import { useAuth } from '@/features/auth/session/auth-context';
import { errorKindOf, type ErrorKind } from '@/features/errors/lib/error-kind';
import { fr } from '@/lib/i18n/fr';

/*
 * Écrans d'erreur communs (03-APPFLOW §7) : « Vous n'avez pas accès à cette page » (403),
 * « Élément introuvable » (404), erreur imprévue. Dans la coque d'un espace, ils gardent l'en-tête
 * et le menu ; sinon, ils s'affichent comme une page publique.
 */
const screens: Record<ErrorKind, { title: string; body: string; icon: LucideIcon }> = {
  forbidden: {
    title: fr.errorScreens.forbiddenTitle,
    body: fr.errorScreens.forbiddenBody,
    icon: ShieldOff,
  },
  notFound: {
    title: fr.errorScreens.notFoundTitle,
    body: fr.errorScreens.notFoundBody,
    icon: FileQuestion,
  },
  unexpected: {
    title: fr.errorScreens.unexpectedTitle,
    body: fr.errors.unexpected,
    icon: ServerCrash,
  },
};

/** Où renvoyer l'utilisateur : son tableau de bord, le sélecteur d'espace, ou la connexion. */
function useWayBack(): { to: string; label: string } {
  const { session, activeMembership } = useAuth();

  if (activeMembership !== null) {
    return { to: spaceHomeFor(activeMembership), label: fr.errorScreens.backToDashboard };
  }

  if (session !== null) {
    return { to: authRoutes.chooseSpace, label: fr.chooseSpace.title };
  }

  return { to: authRoutes.login, label: fr.errorScreens.backToLogin };
}

export function ErrorScreen({ kind }: { kind: ErrorKind }) {
  const inShell = useInShell();
  const wayBack = useWayBack();
  const { title, body, icon: Icon } = screens[kind];

  const content = (
    <div className="grid justify-items-center gap-3 py-4 text-center">
      <Icon className="size-10 text-muted" aria-hidden="true" />
      <p className="text-body text-muted">{body}</p>
      <Button asChild variant="secondary">
        <Link to={wayBack.to}>{wayBack.label}</Link>
      </Button>
    </div>
  );

  if (!inShell) {
    return <PublicLayout title={title}>{content}</PublicLayout>;
  }

  return (
    <>
      <PageHeader title={title} />
      <div className="rounded-card border border-border bg-card p-6 shadow-card">{content}</div>
    </>
  );
}

/**
 * `errorElement` des routes : un écran qui lève une erreur de l'API (403, 404…) affiche l'écran
 * commun correspondant au lieu de casser l'application.
 */
export function RouteErrorPage() {
  return <ErrorScreen kind={errorKindOf(useRouteError())} />;
}
