import { useQuery } from '@tanstack/react-query';
import { Download, Plus, Wallet } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardActions, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { duesApi, duesKeys, type NetworkDue } from '@/features/dues/api/dues-api';
import { DeclarePaymentDialog } from '@/features/dues/components/dues-dialogs';
import { DuesListSkeleton } from '@/features/dues/components/network-dues-list';
import { formatAmount, formatDate } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';

/*
 * `/cga/cotisation` (F-COT-06, 03-APPFLOW §4.3) : cotisation du centre par année (dû, réglé, reste,
 * date butoir, statut), paiements avec preuve et reçu, facture FNE une fois certifiée (RG-FNE-01) ;
 * « Déclarer un paiement » (gérant) → « En attente de confirmation » du CNCGA.
 */
const labels = fr.dues;

function DueCard({
  due,
  canDeclare,
  onDeclare,
}: {
  due: NetworkDue;
  canDeclare: boolean;
  onDeclare: () => void;
}) {
  const payments = due.payments ?? [];

  return (
    <Card aria-label={labels.caption(String(due.year))}>
      <CardHeader>
        <CardTitle>{labels.caption(String(due.year))}</CardTitle>
        <CardActions>
          {canDeclare && due.balance > 0 ? (
            <Button size="sm" onClick={onDeclare}>
              <Plus aria-hidden="true" />
              {labels.actions.declare}
            </Button>
          ) : null}
        </CardActions>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge domain="dues" status={due.status} />
          {due.pending_confirmation === true ? (
            <StatusBadge domain="payment" status="pending_confirmation" />
          ) : null}
        </div>
        <p className="text-table font-semibold">
          {labels.own.summary(
            formatAmount(due.amount_due),
            formatAmount(due.amount_paid),
            formatAmount(due.balance),
          )}
        </p>
        <p className="text-note text-muted">{labels.own.deadline(formatDate(due.deadline))}</p>
        {due.prorata_ratio < 1 ? (
          <p className="text-note text-muted">{labels.prorata(String(due.prorata_ratio))}</p>
        ) : null}
        {due.invoice?.pdf_url ? (
          <a
            className="inline-flex items-center gap-2 text-table text-primary underline"
            href={due.invoice.pdf_url}
            target="_blank"
            rel="noreferrer"
          >
            <Download className="size-4" aria-hidden="true" />
            {labels.actions.downloadInvoice} ({labels.own.invoiceCertified(due.invoice.number)})
          </a>
        ) : null}
        <section aria-label={labels.payments} className="grid gap-2">
          <h3 className="text-label font-semibold">{labels.payments}</h3>
          {payments.length === 0 ? (
            <p className="text-note text-muted">{labels.noPayments}</p>
          ) : (
            <ul className="divide-y divide-border">
              {payments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <div className="grid gap-0.5">
                    <span className="text-table">
                      {labels.payment.line(
                        formatAmount(payment.amount),
                        formatDate(payment.paid_on),
                        labels.payment.methods[payment.method] ?? payment.method_label,
                      )}
                    </span>
                    {payment.rejection_reason === null ? null : (
                      <span className="text-note text-danger">
                        {labels.payment.rejected(payment.rejection_reason)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge domain="payment" status={payment.status} />
                    {payment.receipt_url === null ? null : (
                      <a
                        className="text-table text-primary underline"
                        href={payment.receipt_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {labels.actions.receipt} {payment.receipt_number}
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

export function CgaDuesPage() {
  const [declaring, setDeclaring] = useState<NetworkDue | null>(null);
  const query = useQuery({ queryKey: duesKeys.own, queryFn: () => duesApi.own() });

  return (
    <>
      <PageHeader title={labels.ownTitle} />
      {query.isPending ? (
        <DuesListSkeleton />
      ) : query.isError ? (
        <Banner tone="danger" role="alert">
          {labels.loadError}
        </Banner>
      ) : query.data.dues.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState icon={Wallet}>{labels.emptyOwn}</EmptyState>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {query.data.dues.map((due) => (
            <DueCard
              key={due.id}
              due={due}
              canDeclare={query.data.canDeclare}
              onDeclare={() => {
                setDeclaring(due);
              }}
            />
          ))}
        </div>
      )}
      {declaring === null ? null : (
        <DeclarePaymentDialog
          due={declaring}
          onClose={() => {
            setDeclaring(null);
          }}
        />
      )}
    </>
  );
}
