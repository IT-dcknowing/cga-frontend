import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  networkReportKeys,
  networkReportsApi,
  type NetworkReportRow,
} from '@/features/reports/api/network-reports-api';
import { SummaryTable } from '@/features/reports/components/report-sections';
import { useNetworkYear } from '@/features/reports/lib/use-network-year';
import { formatDate, formatTimestampDate } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';

/*
 * Rapports vus du réseau (RG-RPT-04, étape 5.9) : grille CGA × trimestre de l'année, cellule = état de
 * transmission ; une cellule transmise (ou accusé reçu) ouvre le « Tableau de synthèse » agrégé, sans
 * nom d'adhérent. Utilisée par `/cncga/rapports` et l'onglet « Rapports » de la fiche d'un CGA.
 */
const labels = fr.reports.network;

export type Selected = { cga: NetworkReportRow['cga']; quarter: number };

function transmitted(row: NetworkReportRow | undefined): boolean {
  return row?.status === 'transmitted' || row?.status === 'acknowledged';
}

export function StatusCell({
  row,
  quarter,
  onOpen,
}: {
  row: NetworkReportRow | undefined;
  quarter: number;
  onOpen: (selected: Selected) => void;
}) {
  if (row === undefined) {
    return <span className="text-muted">—</span>;
  }
  const badge = <StatusBadge domain="networkReport" status={row.status} />;

  return transmitted(row) ? (
    <button
      type="button"
      className="rounded-full focus-visible:outline-2 focus-visible:outline-primary"
      aria-label={labels.openSummary(row.cga.sigle ?? row.cga.name, String(quarter))}
      onClick={() => {
        onOpen({ cga: row.cga, quarter });
      }}
    >
      {badge}
    </button>
  ) : (
    badge
  );
}

export function SummaryDialog({
  selected,
  year,
  onClose,
}: {
  selected: Selected;
  year: number;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: networkReportKeys.summary(selected.cga.id, year, selected.quarter),
    queryFn: () => networkReportsApi.summary(selected.cga.id, year, selected.quarter),
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent
        size="preview"
        title={labels.summaryTitle(selected.cga.name, String(selected.quarter), String(year))}
        description={labels.summaryHint}
      >
        <DialogBody>
          {query.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : query.isError ? (
            <Banner tone="danger" role="alert">
              {labels.summaryError}
            </Banner>
          ) : (
            <div className="grid gap-2">
              {query.data.transmitted_at === null ? null : (
                <p className="text-note text-muted">
                  {labels.transmittedOn(formatTimestampDate(query.data.transmitted_at))}
                </p>
              )}
              <SummaryTable summary={query.data.summary} />
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {fr.common.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Onglet « Rapports » de la fiche d'un CGA : ses 4 trimestres de l'année. */
export function CgaReportsTab({ cgaId, year }: { cgaId: string; year: number }) {
  const network = useNetworkYear(year);
  const [selected, setSelected] = useState<Selected | null>(null);

  if (network.isPending) {
    return <Skeleton className="h-24 w-full" />;
  }
  if (network.isError) {
    return (
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
    );
  }

  return (
    <div className="grid gap-3">
      <p className="text-note text-muted">{labels.tabIntro}</p>
      <ul aria-label={labels.caption(String(year))} className="divide-y divide-border">
        {network.quarters.map((quarter) => {
          const row = quarter.rows.find((candidate) => candidate.cga.id === cgaId);

          return (
            <li
              key={quarter.quarter}
              className="flex flex-wrap items-center justify-between gap-3 py-2"
            >
              <span className="grid gap-0.5">
                <span className="font-semibold">
                  {labels.quarter(String(quarter.quarter))} {year}
                </span>
                <span className="text-note text-muted">
                  {labels.quarterHeader(
                    String(quarter.quarter),
                    formatDate(quarter.deadline),
                    formatDate(quarter.legal_deadline),
                  )}
                </span>
              </span>
              <StatusCell row={row} quarter={quarter.quarter} onOpen={setSelected} />
            </li>
          );
        })}
      </ul>
      {selected === null ? null : (
        <SummaryDialog
          selected={selected}
          year={year}
          onClose={() => {
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}
