import { zodResolver } from '@hookform/resolvers/zod';
import { History, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { EmptyState } from '@/components/shared/empty-state';
import { KeyValueList, type KeyValueItem } from '@/components/shared/key-value-list';
import { StatusBadge } from '@/components/shared/status-badge';
import { UnsavedChangesGuard } from '@/components/shared/unsaved-changes-guard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { organizationsApi } from '@/features/organizations/api';
import type { Organization } from '@/features/organizations/api/organizations-api';
import { useOrganizationSaved } from '@/features/organizations/api/queries';
import { RegistrationFields } from '@/features/organizations/components/registration-fields';
import {
  registrationApiFields,
  registrationInput,
  registrationSchema,
  type RegistrationForm,
} from '@/features/organizations/lib/schemas';
import { formatDate, formatNumber, formatTimestampDate } from '@/lib/format';
import { showValidationErrors } from '@/lib/form-errors';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';

/*
 * Onglet « Identité » de la fiche d'un CGA (F-ORG-04) : la fiche du registre en clé / valeur
 * (04-UX-UI §7), puis **Modifier** → formulaire en place → **Enregistrer** → toast ✓ (03-APPFLOW
 * §3.2) ; l'historique des événements tracés (suspension, réactivation, retrait, abonnement). Le
 * reste de la fiche du centre (NCC, RCCM, gérant, images) est complété par le CGA lui-même (F-ORG-03).
 */
const labels = fr.organization;
const fields = labels.fields;

function dateOrNull(value: string | null): string | null {
  return value === null ? null : formatDate(value);
}

function identityItems(organization: Organization): KeyValueItem[] {
  const { subscription } = organization;

  return [
    { label: fields.name, value: organization.name },
    { label: fields.sigle, value: organization.sigle },
    { label: fields.city, value: organization.city },
    { label: fields.phone, value: organization.phone_1 },
    { label: fields.email, value: organization.email },
    { label: fields.region, value: organization.regional_directorate?.name ?? null },
    {
      label: fields.agreementStatus,
      value: <StatusBadge domain="agreement" status={organization.agreement_status} />,
    },
    { label: fields.agreementNumber, value: organization.agreement_number },
    { label: fields.agreementDate, value: dateOrNull(organization.agreement_date) },
    ...(organization.agreement_withdrawn_at === null
      ? []
      : [
          {
            label: fields.agreementWithdrawnAt,
            value: formatDate(organization.agreement_withdrawn_at),
          },
        ]),
    {
      label: fields.subscription,
      value: <StatusBadge domain="subscription" status={subscription.status} />,
    },
    { label: fields.subscriptionStartedAt, value: dateOrNull(subscription.started_at) },
    ...(subscription.trial_ends_at === null
      ? []
      : [{ label: fields.trialEndsAt, value: formatDate(subscription.trial_ends_at) }]),
    ...(subscription.ended_at === null
      ? []
      : [{ label: fields.subscriptionEndedAt, value: formatDate(subscription.ended_at) }]),
    ...(subscription.data_deletion_due_at === null
      ? []
      : [
          { label: fields.dataDeletionDueAt, value: formatDate(subscription.data_deletion_due_at) },
        ]),
    // RG-ORG-02 : toujours calculé par le serveur, portefeuille CGA seulement.
    { label: fields.members, value: formatNumber(organization.members_count) },
    {
      label: fields.profile,
      value:
        organization.profile_completed_at === null
          ? labels.profileIncomplete
          : labels.profileCompleted(formatTimestampDate(organization.profile_completed_at)),
    },
    {
      label: fields.createdAt,
      value: organization.created_at === null ? null : formatTimestampDate(organization.created_at),
    },
  ];
}

function formValues(organization: Organization): RegistrationForm {
  return {
    name: organization.name,
    sigle: organization.sigle ?? '',
    city: organization.city,
    phone_1: organization.phone_1,
    email: organization.email ?? '',
    agreement_status: organization.agreement_status === 'granted' ? 'granted' : 'pending',
    agreement_number: organization.agreement_number ?? '',
    agreement_date: organization.agreement_date ?? '',
  };
}

function IdentityForm({
  organization,
  onDone,
}: {
  organization: Organization;
  onDone: () => void;
}) {
  const saved = useOrganizationSaved();
  const form = useForm<RegistrationForm>({
    resolver: zodResolver(registrationSchema),
    defaultValues: formValues(organization),
  });
  const {
    handleSubmit,
    setError,
    formState: { isDirty, isSubmitting },
  } = form;

  const submit = handleSubmit(async (values) => {
    try {
      saved(await organizationsApi.update(organization.id, registrationInput(values)));
      toast.success(labels.saved);
      onDone();
    } catch (error) {
      if (!showValidationErrors(error, setError, registrationApiFields)) {
        toastUnexpectedError(error);
      }
    }
  });

  return (
    <form noValidate onSubmit={submit} className="grid gap-4">
      <UnsavedChangesGuard when={isDirty && !isSubmitting} />
      <RegistrationFields form={form} idPrefix="org" />

      <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
        <Button variant="secondary" onClick={onDone} disabled={isSubmitting}>
          {fr.common.cancel}
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {labels.save}
        </Button>
      </div>
    </form>
  );
}

function HistoryCard({ organization }: { organization: Organization }) {
  const events = organization.status_events ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.history.title}</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <EmptyState icon={History}>{labels.history.empty}</EmptyState>
        ) : (
          <ol className="divide-y divide-border">
            {events.map((event) => (
              <li key={`${event.event}-${event.occurred_at}`} className="grid gap-0.5 py-2.5">
                <p className="font-semibold">
                  {event.event_label}
                  <span className="ml-2 text-note font-normal text-muted">
                    {formatTimestampDate(event.occurred_at)}
                    {event.actor === null ? null : ` · ${labels.history.by(event.actor.name)}`}
                  </span>
                </p>
                {event.reason === '' ? null : (
                  <p className="text-table text-muted">{event.reason}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export function IdentityTab({
  organization,
  canEdit,
}: {
  organization: Organization;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{labels.tabs.identity}</CardTitle>
          {canEdit && !editing ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setEditing(true);
              }}
            >
              <Pencil aria-hidden="true" />
              {labels.edit}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {editing ? (
            <IdentityForm
              organization={organization}
              onDone={() => {
                setEditing(false);
              }}
            />
          ) : (
            <KeyValueList items={identityItems(organization)} />
          )}
        </CardContent>
      </Card>
      <HistoryCard organization={organization} />
    </div>
  );
}
