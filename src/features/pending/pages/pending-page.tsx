import { Construction } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { fr } from '@/lib/i18n/fr';

/*
 * Écran d'attente, dans la coque de l'espace, des entrées de menu pas encore construites (tableaux
 * de bord, listes…). Remplacé écran par écran au fil du plan : il n'affiche aucune donnée et ne
 * porte aucune règle de gestion.
 */
export function PendingPage({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />

      <Card>
        <CardContent className="grid justify-items-center gap-3 py-10 text-center">
          <Construction className="size-10 text-muted" aria-hidden="true" />
          <p className="text-body text-muted">{fr.pending.body}</p>
        </CardContent>
      </Card>
    </>
  );
}
