import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, Plus, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { ActionMenu, type ActionMenuItem } from '@/components/shared/action-menu';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardActions, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/session/auth-context';
import type { Member } from '@/features/members/api/members-api';
import {
  OBLIGATION_CATEGORIES,
  obligationKeys,
  obligationsApi,
  type CategorySummary,
  type ObligationInstance,
} from '@/features/obligations/api/obligations-api';
import {
  AmountDialog,
  DeclarationReviewDialog,
  DiligenceDialog,
  ManageObligationsDialog,
  MarkDoneDialog,
  ObligationPaymentDialog,
  OtherAuthorityDialog,
} from '@/features/obligations/components/instance-dialogs';
import { formatAmount, formatDate, formatTimestampDate } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';
import { permissionCodes } from '@/lib/reference/permissions';
import { cn } from '@/lib/utils';

/*
 * Onglet « Obligations » du dossier (03-APPFLOW §4.3, étape 4.6, F-OBL-03, 04) : quatre blocs (Impôts,
 * CNPS, CMU, Autres) avec leur récapitulatif (reste dû, montants à saisir, retards) ; par ligne, les
 * actions que le serveur permet (`can`) : Marquer faite, Saisir le montant dû, Enregistrer un
 * paiement, Confirmer la déclaration de l'adhérent ou la corriger, statut d'une diligence. Les
 * lignes déclarées par l'adhérent, à confirmer, sont en surbrillance orange (RG-OBL-09).
 */
const labels = fr.obligations.tab;

type Action =
  | {
      name: 'markDone' | 'setAmount' | 'recordPayment' | 'review' | 'diligence';
      instance: ObligationInstance;
    }
  | { name: 'manage' | 'other' };

function amounts(instance: ObligationInstance): string | null {
  if (instance.kind !== 'payment') {
    return instance.done_at === null ? null : labels.done(formatDate(instance.done_at));
  }
  if (instance.amount_due === null) {
    return labels.amountUnknown;
  }

  return labels.amounts(
    formatAmount(instance.amount_due),
    formatAmount(instance.amount_paid),
    formatAmount(instance.balance ?? 0),
  );
}

function Line({
  instance,
  onAction,
}: {
  instance: ObligationInstance;
  onAction: (action: Action) => void;
}) {
  const declared = instance.member_declared_status !== null;
  const items: ActionMenuItem[] = [];
  const can = instance.can;

  if (can.review_declaration === true) {
    items.push({
      label: labels.actions.review,
      onSelect: () => onAction({ name: 'review', instance }),
    });
  }
  if (can.mark_done === true) {
    items.push({
      label: labels.actions.markDone,
      onSelect: () => onAction({ name: 'markDone', instance }),
    });
  }
  if (can.set_amount === true) {
    items.push({
      label: labels.actions.setAmount,
      onSelect: () => onAction({ name: 'setAmount', instance }),
    });
  }
  if (can.record_payment === true) {
    items.push({
      label: labels.actions.recordPayment,
      onSelect: () => onAction({ name: 'recordPayment', instance }),
    });
  }
  if (can.set_diligence === true) {
    items.push({
      label: labels.actions.diligence,
      onSelect: () => onAction({ name: 'diligence', instance }),
    });
  }
  const detail = amounts(instance);

  return (
    <li
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 px-2 py-2.5',
        declared && 'rounded-card bg-accent-soft',
      )}
    >
      <span className="grid gap-0.5">
        <span className="font-semibold">{instance.label}</span>
        <span className="text-note text-muted">
          {[instance.authority_name, instance.platform, labels.due(formatDate(instance.due_date))]
            .filter(Boolean)
            .join(' · ')}
          {instance.overdue ? (
            <span className="font-semibold text-danger"> · {labels.late}</span>
          ) : null}
        </span>
        {detail === null ? null : <span className="text-table">{detail}</span>}
        {declared ? (
          <span className="text-note font-semibold text-accent-text">
            {labels.declared(
              instance.member_declared_status_label ?? '',
              instance.member_declared_at === null
                ? ''
                : formatTimestampDate(instance.member_declared_at),
            )}
          </span>
        ) : null}
        {instance.member_declaration_rejection === null ? null : (
          <span className="text-note text-danger">
            {labels.rejected(instance.member_declaration_rejection)}
          </span>
        )}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <StatusBadge domain="obligation" status={instance.status} />
        {items.length > 0 ? (
          <ActionMenu label={labels.rowActions(instance.label)} items={items} />
        ) : null}
      </span>
    </li>
  );
}

function Block({
  category,
  instances,
  summary,
  onAction,
}: {
  category: (typeof OBLIGATION_CATEGORIES)[number];
  instances: ObligationInstance[];
  summary: CategorySummary | undefined;
  onAction: (action: Action) => void;
}) {
  const title = fr.obligations.categories[category];
  const notes = [
    labels.summary(formatAmount(summary?.total_due ?? 0)),
    (summary?.amounts_to_enter ?? 0) > 0 ? labels.toEnter(String(summary?.amounts_to_enter)) : null,
    (summary?.overdue ?? 0) > 0 ? labels.overdue(String(summary?.overdue)) : null,
  ].filter((note) => note !== null);

  return (
    <Card aria-label={title}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardActions>
          <span className="text-table font-semibold">{notes.join(' · ')}</span>
        </CardActions>
      </CardHeader>
      <CardContent>
        {instances.length === 0 ? (
          <EmptyState icon={CalendarCheck}>{labels.empty}</EmptyState>
        ) : (
          <ul aria-label={title} className="divide-y divide-border">
            {instances.map((instance) => (
              <Line key={instance.id} instance={instance} onAction={onAction} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function ObligationsTab({ member }: { member: Member }) {
  const { can } = useAuth();
  const manages = can(permissionCodes.cga.obligations);
  const [action, setAction] = useState<Action | null>(null);
  const query = useQuery({
    queryKey: obligationKeys.instances(member.id),
    queryFn: () => obligationsApi.instances(member.id),
  });
  const close = () => {
    setAction(null);
  };

  if (query.isPending) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (query.isError) {
    return (
      <Banner
        tone="danger"
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void query.refetch();
            }}
          >
            {fr.common.retry}
          </Button>
        }
      >
        {labels.loadError}
      </Banner>
    );
  }

  return (
    <div className="grid gap-4">
      {manages ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setAction({ name: 'manage' });
            }}
          >
            <Settings2 aria-hidden="true" />
            {labels.manage}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setAction({ name: 'other' });
            }}
          >
            <Plus aria-hidden="true" />
            {labels.otherAuthority}
          </Button>
        </div>
      ) : null}

      {OBLIGATION_CATEGORIES.map((category) => (
        <Block
          key={category}
          category={category}
          instances={query.data.instances.filter((instance) => instance.category === category)}
          summary={query.data.summary[category]}
          onAction={setAction}
        />
      ))}

      {action?.name === 'manage' ? (
        <ManageObligationsDialog memberId={member.id} onClose={close} />
      ) : null}
      {action?.name === 'other' ? (
        <OtherAuthorityDialog memberId={member.id} onClose={close} />
      ) : null}
      {action?.name === 'markDone' ? (
        <MarkDoneDialog memberId={member.id} instance={action.instance} onClose={close} />
      ) : null}
      {action?.name === 'setAmount' ? (
        <AmountDialog memberId={member.id} instance={action.instance} onClose={close} />
      ) : null}
      {action?.name === 'recordPayment' ? (
        <ObligationPaymentDialog memberId={member.id} instance={action.instance} onClose={close} />
      ) : null}
      {action?.name === 'diligence' ? (
        <DiligenceDialog memberId={member.id} instance={action.instance} onClose={close} />
      ) : null}
      {action?.name === 'review' ? (
        <DeclarationReviewDialog memberId={member.id} instance={action.instance} onClose={close} />
      ) : null}
    </div>
  );
}
