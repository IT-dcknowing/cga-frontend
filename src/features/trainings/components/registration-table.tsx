import type { ColumnDef, PaginationState } from '@tanstack/react-table';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { ActionMenu, type ActionMenuItem } from '@/components/shared/action-menu';
import { DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import type { TrainingRegistration } from '@/features/trainings/api/trainings-api';
import { config } from '@/lib/config';
import { formatNumber, formatTimestampDate } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';

/*
 * Tableau des inscriptions d'une formation (03-APPFLOW §3.2 onglets Inscrits et Liste d'attente, §4.3 ;
 * `DataTable` du 04-UX-UI §6) : personne (agent ou adhérent, entreprise pour son CGA seulement,
 * RG-SEC-01), statut et rang en liste d'attente (RG-FOR-03), paiement (RG-FOR-06), reçu et attestation ;
 * actions de la ligne selon l'appelant. L'API renvoie toutes les inscriptions : pages découpées ici.
 */
const labels = fr.trainings.registrations;

function DownloadLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} className="inline-flex items-center gap-1 text-note text-primary underline">
      <Download aria-hidden="true" className="size-3.5" />
      {children}
    </a>
  );
}

function columns(
  paid: boolean,
  actions: ((registration: TrainingRegistration) => ActionMenuItem[]) | undefined,
): ColumnDef<TrainingRegistration>[] {
  return [
    {
      id: 'person',
      header: labels.person,
      cell: ({ row }) => {
        const { person } = row.original;

        return (
          <span className="grid">
            <span>{person.name}</span>
            <span className="text-note font-normal text-muted">
              {[
                person.kind === 'agent' ? labels.agent : labels.member,
                person.company_name,
                person.organization.name,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
        );
      },
    },
    {
      id: 'status',
      header: labels.status,
      cell: ({ row }) => {
        const registration = row.original;

        return (
          <span className="grid justify-items-start gap-1">
            <StatusBadge domain="trainingRegistration" status={registration.status} />
            {registration.waitlist_rank === null ? null : (
              <span className="text-note text-muted">
                {labels.rank(formatNumber(registration.waitlist_rank))}
              </span>
            )}
            {registration.rejection_reason === null ? null : (
              <span className="text-note text-muted">{registration.rejection_reason}</span>
            )}
          </span>
        );
      },
    },
    ...(paid
      ? [
          {
            id: 'payment',
            header: labels.payment,
            cell: ({ row }) => (
              <span className="grid justify-items-start gap-1">
                <StatusBadge domain="trainingPayment" status={row.original.payment_status} />
                {row.original.receipt_url === null ? null : (
                  <DownloadLink href={row.original.receipt_url}>
                    {`${labels.receipt} ${row.original.receipt_number ?? ''}`.trim()}
                  </DownloadLink>
                )}
              </span>
            ),
          } satisfies ColumnDef<TrainingRegistration>,
        ]
      : []),
    {
      id: 'registered',
      header: labels.registeredAt,
      cell: ({ row }) => (
        <span className="grid justify-items-start gap-1">
          {formatTimestampDate(row.original.registered_at)}
          {row.original.certificate_url === null ? null : (
            <DownloadLink href={row.original.certificate_url}>{labels.certificate}</DownloadLink>
          )}
        </span>
      ),
    },
    ...(actions === undefined
      ? []
      : [
          {
            id: 'actions',
            header: labels.actionsColumn,
            cell: ({ row }) => (
              <ActionMenu
                label={labels.actions(row.original.person.name)}
                items={actions(row.original)}
              />
            ),
          } satisfies ColumnDef<TrainingRegistration>,
        ]),
  ];
}

type RegistrationTableProps = {
  registrations: TrainingRegistration[];
  caption: string;
  /** Formation payante : colonne « Paiement ». */
  paid: boolean;
  /** Actions permises sur une ligne (menu « ⋯ ») ; aucune : pas de menu. */
  actions?: (registration: TrainingRegistration) => ActionMenuItem[];
};

export function RegistrationTable({
  registrations,
  caption,
  paid,
  actions,
}: RegistrationTableProps) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: config.pageSize,
  });
  const start = pagination.pageIndex * pagination.pageSize;

  return (
    <DataTable
      caption={caption}
      columns={columns(paid, actions)}
      data={registrations.slice(start, start + pagination.pageSize)}
      rowCount={registrations.length}
      pagination={pagination}
      onPaginationChange={setPagination}
      getRowId={(registration) => registration.id}
      empty={labels.empty}
    />
  );
}
