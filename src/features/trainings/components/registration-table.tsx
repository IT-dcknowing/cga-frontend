import { Download } from 'lucide-react';
import { ActionMenu, type ActionMenuItem } from '@/components/shared/action-menu';
import { StatusBadge } from '@/components/shared/status-badge';
import type { TrainingRegistration } from '@/features/trainings/api/trainings-api';
import { formatNumber, formatTimestampDate } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';

/*
 * Tableau des inscriptions d'une formation (03-APPFLOW §3.2 onglets Inscrits et Liste d'attente, §4.3) :
 * personne (agent ou adhérent, entreprise pour son CGA seulement, RG-SEC-01), statut et rang en liste
 * d'attente (RG-FOR-03), paiement (RG-FOR-06), reçu et attestation ; actions de la ligne selon l'appelant.
 */
const labels = fr.trainings.registrations;

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
  if (registrations.length === 0) {
    return <p className="text-note text-muted">{labels.empty}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-body">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border text-label text-muted">
            <th scope="col" className="py-2 pr-4 font-semibold">
              {labels.person}
            </th>
            <th scope="col" className="py-2 pr-4 font-semibold">
              {labels.status}
            </th>
            {paid ? (
              <th scope="col" className="py-2 pr-4 font-semibold">
                {labels.payment}
              </th>
            ) : null}
            <th scope="col" className="py-2 pr-4 font-semibold">
              {labels.registeredAt}
            </th>
            <th scope="col" className="py-2">
              <span className="sr-only">{labels.actionsColumn}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {registrations.map((registration) => {
            const { person } = registration;
            const items = actions?.(registration) ?? [];

            return (
              <tr key={registration.id} className="border-b border-border align-top">
                <td className="py-2 pr-4">
                  <span className="grid">
                    <span className="font-semibold">{person.name}</span>
                    <span className="text-note text-muted">
                      {[
                        person.kind === 'agent' ? labels.agent : labels.member,
                        person.company_name,
                        person.organization.name,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </td>
                <td className="py-2 pr-4">
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
                </td>
                {paid ? (
                  <td className="py-2 pr-4">
                    <span className="grid justify-items-start gap-1">
                      <StatusBadge domain="trainingPayment" status={registration.payment_status} />
                      {registration.receipt_url === null ? null : (
                        <a
                          href={registration.receipt_url}
                          className="inline-flex items-center gap-1 text-note text-primary underline"
                        >
                          <Download aria-hidden="true" className="size-3.5" />
                          {`${labels.receipt} ${registration.receipt_number ?? ''}`.trim()}
                        </a>
                      )}
                    </span>
                  </td>
                ) : null}
                <td className="py-2 pr-4">
                  <span className="grid justify-items-start gap-1">
                    {formatTimestampDate(registration.registered_at)}
                    {registration.certificate_url === null ? null : (
                      <a
                        href={registration.certificate_url}
                        className="inline-flex items-center gap-1 text-note text-primary underline"
                      >
                        <Download aria-hidden="true" className="size-3.5" />
                        {labels.certificate}
                      </a>
                    )}
                  </span>
                </td>
                <td className="py-2 text-right">
                  <ActionMenu label={labels.actions(person.name)} items={items} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
