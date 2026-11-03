import { useQuery } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { useState } from 'react';
import { ActionMenu, type ActionMenuItem } from '@/components/shared/action-menu';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/session/auth-context';
import { duesApi, duesKeys, type NetworkDue } from '@/features/dues/api/dues-api';
import {
  InvoiceDuesDialog,
  RecordPaymentDialog,
  RemindDialog,
  ReviewPaymentDialog,
} from '@/features/dues/components/dues-dialogs';
import { formatAmount, formatTimestampDate } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';
import { permissionCodes } from '@/lib/reference/permissions';

/*
 * Cotisations vues du CNCGA (F-COT-02, 03-APPFLOW §3.2) : par CGA, dû (prorata), réglé, reste, statut,
 * paiement « En attente de confirmation », dernière relance, facture FNE ; actions selon les droits
 * effectifs : Examiner, Enregistrer un paiement, Relancer, Facturer (étape 6.9). Aucune action
 * « Suspendre » : la Présidente décide depuis la fiche du CGA (RG-COT-06).
 */
const labels = fr.dues;

type Dialog = { name: 'review' | 'record' | 'remind' | 'invoice'; due: NetworkDue };

/** « Examiner » lit la cotisation avec ses paiements avant d'ouvrir la modale. */
function ReviewLoader({ due, onClose }: { due: NetworkDue; onClose: () => void }) {
  const query = useQuery({
    queryKey: duesKeys.detail(due.id),
    queryFn: () => duesApi.detail(due.id),
  });

  return query.data === undefined ? null : (
    <ReviewPaymentDialog due={query.data} onClose={onClose} />
  );
}

function DueRow({
  due,
  showCga,
  onAction,
}: {
  due: NetworkDue;
  showCga: boolean;
  onAction: (dialog: Dialog) => void;
}) {
  const { can } = useAuth();
  const name = due.cga?.name ?? String(due.year);
  const items: ActionMenuItem[] = [];
  const manage = can(permissionCodes.cncga.duesPayments);

  if (manage && due.pending_confirmation === true) {
    items.push({ label: labels.actions.review, onSelect: () => onAction({ name: 'review', due }) });
  }
  if (manage && due.balance > 0) {
    items.push({ label: labels.actions.record, onSelect: () => onAction({ name: 'record', due }) });
  }
  if (can(permissionCodes.cncga.duesRemind) && due.balance > 0) {
    items.push({ label: labels.actions.remind, onSelect: () => onAction({ name: 'remind', due }) });
  }
  if (can(permissionCodes.cncga.duesInvoice) && due.invoice === null) {
    items.push({
      label: labels.actions.invoice,
      onSelect: () => onAction({ name: 'invoice', due }),
    });
  }

  return (
    <li className="grid gap-2 py-3 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto] md:items-center">
      <div className="grid gap-1">
        <p className="text-table font-semibold">{showCga ? name : String(due.year)}</p>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge domain="dues" status={due.status} />
          {due.pending_confirmation === true ? (
            <StatusBadge domain="payment" status="pending_confirmation" />
          ) : null}
        </div>
        {due.prorata_ratio < 1 ? (
          <p className="text-note text-muted">{labels.prorata(String(due.prorata_ratio))}</p>
        ) : null}
      </div>
      <p className="text-table">
        <span className="text-note text-muted md:sr-only">{labels.columns.due} </span>
        {formatAmount(due.amount_due)}
      </p>
      <p className="text-table">
        <span className="text-note text-muted md:sr-only">{labels.columns.paid} </span>
        {formatAmount(due.amount_paid)}
      </p>
      <div className="grid gap-0.5 text-note text-muted">
        <span className="text-table text-ink">
          <span className="text-note text-muted md:sr-only">{labels.columns.balance} </span>
          {formatAmount(due.balance)}
        </span>
        <span>
          {labels.columns.lastReminder} :{' '}
          {due.last_reminder_at === null ? labels.never : formatTimestampDate(due.last_reminder_at)}
        </span>
        <span>
          {labels.columns.invoice} :{' '}
          {due.invoice === null
            ? labels.noInvoice
            : `${due.invoice.number} (${due.invoice.status_label})`}
        </span>
      </div>
      {items.length > 0 ? <ActionMenu label={labels.rowActions(name)} items={items} /> : <span />}
    </li>
  );
}

export function NetworkDuesList({
  dues,
  showCga = true,
}: {
  dues: NetworkDue[];
  showCga?: boolean;
}) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const close = () => {
    setDialog(null);
  };

  return (
    <>
      {dues.length === 0 ? (
        <EmptyState icon={Wallet}>{labels.empty}</EmptyState>
      ) : (
        <ul aria-label={labels.caption(String(dues[0].year))} className="divide-y divide-border">
          {dues.map((due) => (
            <DueRow key={due.id} due={due} showCga={showCga} onAction={setDialog} />
          ))}
        </ul>
      )}
      {dialog?.name === 'review' ? <ReviewLoader due={dialog.due} onClose={close} /> : null}
      {dialog?.name === 'record' ? <RecordPaymentDialog due={dialog.due} onClose={close} /> : null}
      {dialog?.name === 'remind' ? <RemindDialog due={dialog.due} onClose={close} /> : null}
      {dialog?.name === 'invoice' ? <InvoiceDuesDialog due={dialog.due} onClose={close} /> : null}
    </>
  );
}

/** Squelette d'une liste de cotisations en chargement. */
export function DuesListSkeleton() {
  return (
    <div className="grid gap-2" aria-busy="true">
      <Skeleton className="h-14" />
      <Skeleton className="h-14" />
      <Skeleton className="h-14" />
    </div>
  );
}
