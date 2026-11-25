import { FileSpreadsheet } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { QUARTERS, type NetworkReportRow } from '@/features/reports/api/network-reports-api';
import {
  StatusCell,
  SummaryDialog,
  type Selected,
} from '@/features/reports/components/network-reports';
import { useNetworkYear } from '@/features/reports/lib/use-network-year';
import { formatDate } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';
import { oneOf } from '@/lib/list-params';

/*
 * `/cncga/rapports` (03-APPFLOW §3.2, RG-RPT-04, RG-RPT-07, étape 5.9) : tableau CGA × trimestre de
 * l'année choisie (Transmis, Accusé reçu, En retard, Hors délai réglementaire, Non transmis), filtre dans
 * l'adresse (`?filter=late` depuis l'alerte du tableau de bord) ; un clic sur une cellule transmise ouvre
 * le tableau de synthèse agrégé, sans nom d'adhérent.
 */
const labels = fr.reports.network;
const FILTERS = ['late', 'not_transmitted'] as const;
const YEARS_SHOWN = 5;

function matches(rows: (NetworkReportRow | undefined)[], filter: string): boolean {
  if (filter === 'late') {
    return rows.some((row) => row?.status === 'late' || row?.status === 'legally_late');
  }
  if (filter === 'not_transmitted') {
    return rows.some((row) => row?.status === 'not_transmitted');
  }

  return true;
}

export function NetworkReportsPage() {
  const [params, setParams] = useSearchParams();
  const currentYear = new Date().getFullYear();
  const requested = Number.parseInt(params.get('annee') ?? '', 10);
  const year = Number.isInteger(requested) ? requested : currentYear;
  const filter = oneOf(FILTERS, params.get('filter')) ?? '';
  const network = useNetworkYear(year);
  const [selected, setSelected] = useState<Selected | null>(null);

  function set(key: 'annee' | 'filter', value: string) {
    const next = new URLSearchParams(params);

    if (value === '') {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setParams(next, { replace: true });
  }

  const cgas = network.quarters.at(0)?.rows.map((row) => row.cga) ?? [];
  const byQuarter = (quarter: number, cgaId: string) =>
    network.quarters
      .find((item) => item.quarter === quarter)
      ?.rows.find((row) => row.cga.id === cgaId);
  const shown = cgas.filter((cga) =>
    matches(
      QUARTERS.map((quarter) => byQuarter(quarter, cga.id)),
      filter,
    ),
  );

  return (
    <>
      <PageHeader title={labels.title} />
      <Card>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap gap-4">
            <FormField id="network-reports-year" label={labels.year} className="w-36">
              <Select
                id="network-reports-year"
                value={String(year)}
                onChange={(event) => {
                  set(
                    'annee',
                    event.target.value === String(currentYear) ? '' : event.target.value,
                  );
                }}
              >
                {Array.from({ length: YEARS_SHOWN }, (_, index) => currentYear - index).map(
                  (value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ),
                )}
              </Select>
            </FormField>
            <FormField id="network-reports-filter" label={labels.filter} className="w-60">
              <Select
                id="network-reports-filter"
                value={filter}
                onChange={(event) => {
                  set('filter', event.target.value);
                }}
              >
                {Object.entries(labels.filters).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          {network.isPending ? (
            <Skeleton className="h-32 w-full" />
          ) : network.isError ? (
            <Banner
              tone="danger"
              role="alert"
              action={
                <Button variant="secondary" size="sm" onClick={network.refetch}>
                  {fr.common.retry}
                </Button>
              }
            >
              {labels.loadError}
            </Banner>
          ) : (
            <>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-note text-muted">
                {network.quarters.map((quarter) => (
                  <li key={quarter.quarter}>
                    {labels.quarterHeader(
                      String(quarter.quarter),
                      formatDate(quarter.deadline),
                      formatDate(quarter.legal_deadline),
                    )}
                  </li>
                ))}
              </ul>
              {shown.length === 0 ? (
                <EmptyState icon={FileSpreadsheet}>{labels.empty}</EmptyState>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-table">
                    <caption className="sr-only">{labels.caption(String(year))}</caption>
                    <thead>
                      <tr className="border-b border-border text-left text-muted">
                        <th scope="col" className="py-2 pr-3">
                          {labels.cga}
                        </th>
                        {QUARTERS.map((quarter) => (
                          <th key={quarter} scope="col" className="py-2 pr-3">
                            {labels.quarter(String(quarter))}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((cga) => (
                        <tr key={cga.id} className="border-b border-border">
                          <th scope="row" className="py-2 pr-3 text-left font-normal">
                            {cga.sigle === null ? cga.name : `${cga.sigle} — ${cga.name}`}
                          </th>
                          {QUARTERS.map((quarter) => (
                            <td key={quarter} className="py-2 pr-3">
                              <StatusCell
                                row={byQuarter(quarter, cga.id)}
                                quarter={quarter}
                                onOpen={setSelected}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
      {selected === null ? null : (
        <SummaryDialog
          selected={selected}
          year={year}
          onClose={() => {
            setSelected(null);
          }}
        />
      )}
    </>
  );
}
