import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, Download } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  closingApi,
  closingKeys,
  type ClosingItem,
  type ClosingStep,
} from '@/features/closing/api/closing-api';
import { EditItemDialog, MarkStepDialog } from '@/features/closing/components/closing-dialogs';
import { ItemSteps } from '@/features/closing/components/closing-steps';
import { fr } from '@/lib/i18n/fr';

/*
 * Onglet « Clôture » du dossier (03-APPFLOW §4.3) : pour chaque exercice suivi, les 4 étapes (date,
 * faite, en retard), le livrable et l'agent ; « Marquer l'étape faite » (la suivante, dans l'ordre ;
 * dépôt : référence et accusé) et « Livrable et agent », selon le bloc `can` du serveur.
 */
const labels = fr.closing;

type Dialog =
  { name: 'mark'; item: ClosingItem; step: ClosingStep } | { name: 'edit'; item: ClosingItem };

export function MemberClosingTab({ memberId }: { memberId: string }) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const query = useQuery({
    queryKey: closingKeys.member(memberId),
    queryFn: () => closingApi.forMember(memberId),
  });

  if (query.isPending) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (query.isError) {
    return (
      <Banner tone="danger" role="alert">
        {labels.memberTab.loadError}
      </Banner>
    );
  }

  if (query.data.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState icon={CalendarCheck}>{labels.memberTab.empty}</EmptyState>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {query.data.map((item) => {
        const next = item.next_step;

        return (
          <Card key={item.id}>
            <CardHeader>
              <CardTitle>{labels.memberTab.year(String(item.campaign.fiscal_year))}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <p className="text-note text-muted">
                {[
                  item.deliverable_label,
                  item.assigned_to === undefined || item.assigned_to === null
                    ? labels.list.unassigned
                    : labels.list.assignedTo(item.assigned_to.name),
                ].join(' · ')}
              </p>
              <ItemSteps steps={item.steps} />
              {item.filing_reference === null ? null : (
                <p className="flex flex-wrap items-center gap-2 text-note text-muted">
                  {labels.list.reference(item.filing_reference)}
                  {item.filing_receipt ? (
                    <Button variant="link" size="sm" asChild>
                      <a href={item.filing_receipt.url} target="_blank" rel="noreferrer">
                        <Download aria-hidden="true" />
                        {labels.list.receipt}
                      </a>
                    </Button>
                  ) : null}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {item.can?.mark_step === true && next !== null ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      setDialog({ name: 'mark', item, step: next });
                    }}
                  >
                    {labels.list.markNext(labels.steps[next] ?? next)}
                  </Button>
                ) : null}
                {item.can?.update === true ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setDialog({ name: 'edit', item });
                    }}
                  >
                    {labels.list.edit}
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        );
      })}
      {dialog?.name === 'mark' ? (
        <MarkStepDialog
          item={dialog.item}
          step={dialog.step}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.name === 'edit' ? (
        <EditItemDialog
          item={dialog.item}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
    </div>
  );
}
