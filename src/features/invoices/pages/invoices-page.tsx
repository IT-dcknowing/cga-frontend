import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { useAuth } from '@/features/auth/session/auth-context';
import { INVOICE_STATUSES } from '@/features/invoices/api/invoices-api';
import { IssueInvoiceDialog } from '@/features/invoices/components/invoice-dialogs';
import { InvoiceList } from '@/features/invoices/components/invoice-list';
import { fr } from '@/lib/i18n/fr';
import { oneOf } from '@/lib/list-params';
import { permissionCodes } from '@/lib/reference/permissions';

/*
 * `/cga/factures` (F-PAY-05, 06, 03-APPFLOW §4.3) : factures et avoirs du centre avec leur statut
 * FNE, filtre par statut (dans l'adresse) ; « Émettre une facture ». Aucune facture n'est remise à
 * l'adhérent avant sa certification (RG-FNE-01).
 */
const labels = fr.invoices;

export function InvoicesPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [issuing, setIssuing] = useState(false);
  const status = oneOf(INVOICE_STATUSES, params.get('statut')) ?? '';

  return (
    <>
      <PageHeader
        title={labels.title}
        actions={
          can(permissionCodes.cga.invoices) ? (
            <Button
              onClick={() => {
                setIssuing(true);
              }}
            >
              <Plus aria-hidden="true" />
              {labels.issue.action}
            </Button>
          ) : null
        }
      />
      <Card>
        <CardContent className="grid gap-4">
          <FormField id="invoices-status" label={labels.status} className="md:max-w-xs">
            <Select
              id="invoices-status"
              value={status}
              onChange={(event) => {
                setParams(event.target.value === '' ? {} : { statut: event.target.value }, {
                  replace: true,
                });
              }}
            >
              <option value="">{fr.common.all}</option>
              {INVOICE_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {fr.status.invoice[value]}
                </option>
              ))}
            </Select>
          </FormField>
          <InvoiceList key={status} status={status} />
        </CardContent>
      </Card>
      {issuing ? (
        <IssueInvoiceDialog
          onClose={() => {
            setIssuing(false);
          }}
        />
      ) : null}
    </>
  );
}
