import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download, ReceiptText } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ActionMenu, type ActionMenuItem } from '@/components/shared/action-menu';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  invoiceKeys,
  invoicesApi,
  type Invoice,
  type InvoiceFilters,
} from '@/features/invoices/api/invoices-api';
import { CancelInvoiceDialog, CertifyDialog } from '@/features/invoices/components/invoice-dialogs';
import { ApiBusinessError } from '@/lib/api-errors';
import { formatAmount, formatDate } from '@/lib/format';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';

/*
 * Liste des factures et avoirs (03-APPFLOW §4.3) : n°, client, montant TTC, date, statut FNE ; motif
 * d'un rejet de la DGI. Par ligne, selon le bloc `can` du serveur : « Saisir la certification »,
 * « Corriger et resoumettre », « Télécharger PDF » et « Envoyer à l'adhérent » (certifiée seulement),
 * « Émettre un avoir », annulation d'une facture non certifiée (RG-FNE-01 à 05).
 */
const labels = fr.invoices;

type Dialog = { name: 'certify' | 'cancel'; invoice: Invoice };

export function InvoiceList({
  status = '',
  memberId,
  showMember = true,
}: {
  status?: string;
  memberId?: string;
  showMember?: boolean;
}) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const filters: InvoiceFilters = { status, memberId, page };
  const query = useQuery({
    queryKey: invoiceKeys.list(filters),
    queryFn: () => invoicesApi.list(filters),
  });

  async function act(invoice: Invoice, action: 'resubmit' | 'credit-note' | 'deliver') {
    try {
      const result = await invoicesApi.act(invoice.id, action);

      toast.success(
        action === 'resubmit'
          ? labels.resubmitted(invoice.number)
          : action === 'deliver'
            ? labels.delivered(invoice.number)
            : labels.creditNoted(result.number),
      );
      await queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        toast.error(error.message);
      } else {
        toastUnexpectedError(error);
      }
    }
  }

  function actions(invoice: Invoice): ActionMenuItem[] {
    const items: ActionMenuItem[] = [];
    const { can } = invoice;

    if (can.certify_manually) {
      items.push({
        label: labels.certify.action,
        onSelect: () => {
          setDialog({ name: 'certify', invoice });
        },
      });
    }

    if (can.resubmit) {
      items.push({ label: labels.resubmit, onSelect: () => void act(invoice, 'resubmit') });
    }

    if (can.deliver) {
      items.push({ label: labels.deliver, onSelect: () => void act(invoice, 'deliver') });
    }

    if (can.issue_credit_note) {
      items.push({ label: labels.creditNote, onSelect: () => void act(invoice, 'credit-note') });
    }

    if (can.cancel) {
      items.push({
        label: labels.cancel.action,
        danger: true,
        onSelect: () => {
          setDialog({ name: 'cancel', invoice });
        },
      });
    }

    return items;
  }

  if (query.isPending) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (query.isError) {
    return (
      <Banner
        tone="danger"
        action={
          <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
            {fr.common.retry}
          </Button>
        }
      >
        {labels.loadError}
      </Banner>
    );
  }

  if (query.data.data.length === 0) {
    return <EmptyState icon={ReceiptText}>{labels.empty}</EmptyState>;
  }

  const { current_page: current, last_page: last } = query.data.meta;

  return (
    <>
      <ul aria-label={labels.caption} className="divide-y divide-border">
        {query.data.data.map((invoice) => (
          <li key={invoice.id} className="grid gap-1.5 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <span className="grid gap-0.5">
                <span className="font-semibold">
                  {labels.line(invoice.number, formatAmount(invoice.amount_incl_tax))}
                </span>
                <span className="text-note text-muted">
                  {[
                    invoice.type === 'credit_note' ? invoice.type_label : null,
                    showMember ? (invoice.member?.company_name ?? null) : null,
                    formatDate(invoice.issue_date),
                    invoice.certification_mode_label,
                    invoice.fne_number === null ? null : labels.fneNumber(invoice.fne_number),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <StatusBadge domain="invoice" status={invoice.status} />
                {invoice.status === 'certified' && invoice.pdf ? (
                  <Button variant="link" size="sm" asChild>
                    <a href={invoice.pdf.url} target="_blank" rel="noreferrer">
                      <Download aria-hidden="true" />
                      {labels.download}
                    </a>
                  </Button>
                ) : null}
                <ActionMenu label={labels.rowActions(invoice.number)} items={actions(invoice)} />
              </span>
            </div>
            {invoice.status === 'rejected' && invoice.rejection_reason !== null ? (
              <p className="text-note text-danger">{labels.rejected(invoice.rejection_reason)}</p>
            ) : null}
          </li>
        ))}
      </ul>
      {last > 1 ? (
        <div className="flex items-center justify-end gap-2 pt-3 text-note text-muted">
          <Button
            variant="secondary"
            size="sm"
            disabled={current <= 1}
            aria-label={fr.referentials.previous}
            onClick={() => {
              setPage(current - 1);
            }}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          {fr.referentials.page(String(current), String(last))}
          <Button
            variant="secondary"
            size="sm"
            disabled={current >= last}
            aria-label={fr.referentials.next}
            onClick={() => {
              setPage(current + 1);
            }}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      ) : null}
      {dialog?.name === 'certify' ? (
        <CertifyDialog
          invoice={dialog.invoice}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.name === 'cancel' ? (
        <CancelInvoiceDialog
          invoice={dialog.invoice}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
    </>
  );
}
