import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { Banner } from '@/components/ui/banner';
import { Card, CardContent } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { DUES_STATUSES, duesApi, duesKeys } from '@/features/dues/api/dues-api';
import { DuesListSkeleton, NetworkDuesList } from '@/features/dues/components/network-dues-list';
import { config } from '@/lib/config';
import { formatAmount } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';
import { oneOf } from '@/lib/list-params';

/*
 * `/cncga/cotisations` (F-COT-02, 03-APPFLOW §3.2) : choix de l'année et du statut (dans l'adresse),
 * totaux dû / réglé / reste, une ligne par CGA avec ses actions (examen d'un paiement déclaré,
 * paiement reçu, relance, facture FNE).
 */
const labels = fr.dues;

function years(): string[] {
  const current = new Date().getFullYear();

  return Array.from({ length: config.duesYearsShown }, (_, index) => String(current - index));
}

export function NetworkDuesPage() {
  const [params, setParams] = useSearchParams();
  const choices = years();
  const year = oneOf(choices, params.get('annee')) ?? choices[0];
  const status = oneOf(DUES_STATUSES, params.get('statut')) ?? '';
  const query = useQuery({
    queryKey: duesKeys.network(Number(year), status),
    queryFn: () => duesApi.network({ year: Number(year), status }),
  });

  function filter(key: 'annee' | 'statut', value: string) {
    const next = new URLSearchParams(params);

    if (value === '') {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setParams(next, { replace: true });
  }

  return (
    <>
      <PageHeader title={labels.networkTitle} />
      <Card>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap gap-4">
            <FormField id="dues-year" label={labels.year} className="w-40">
              <Select
                id="dues-year"
                value={year}
                onChange={(event) => {
                  filter('annee', event.target.value === choices[0] ? '' : event.target.value);
                }}
              >
                {choices.map((choice) => (
                  <option key={choice} value={choice}>
                    {choice}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="dues-status" label={labels.status} className="w-48">
              <Select
                id="dues-status"
                value={status}
                onChange={(event) => {
                  filter('statut', event.target.value);
                }}
              >
                <option value="">{fr.common.all}</option>
                {DUES_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {fr.status.dues[value]}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          {query.isPending ? (
            <DuesListSkeleton />
          ) : query.isError ? (
            <Banner tone="danger" role="alert">
              {labels.loadError}
            </Banner>
          ) : (
            <>
              <p className="text-table font-semibold">
                {labels.totals(
                  formatAmount(query.data.totals.amount_due),
                  formatAmount(query.data.totals.amount_paid),
                  formatAmount(query.data.totals.balance),
                )}
              </p>
              <NetworkDuesList dues={query.data.dues} />
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
