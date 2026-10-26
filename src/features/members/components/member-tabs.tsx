import { useQueryClient } from '@tanstack/react-query';
import { FileText, History, KeyRound, UserPlus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { EmptyState } from '@/components/shared/empty-state';
import { FormDialog } from '@/components/shared/form-dialog';
import { KeyValueList } from '@/components/shared/key-value-list';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fieldProps } from '@/components/ui/field-props';
import { FormField } from '@/components/ui/form-field';
import { Radio, RadioGroupField, RadioOption } from '@/components/ui/radio';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/session/auth-context';
import {
  httpMembersApi as membersApi,
  INVITATION_CHANNELS,
  type HistoryEntry,
  type Member,
  type MemberAccess,
} from '@/features/members/api/members-api';
import { memberKeys, useAccesses, useHistory, usePieces } from '@/features/members/api/queries';
import { memberNumber } from '@/features/members/lib/member';
import { ApiBusinessError } from '@/lib/api-errors';
import { formatAmount, formatDate, formatTimestamp } from '@/lib/format';
import { showValidationErrors } from '@/lib/form-errors';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';
import { permissionCodes } from '@/lib/reference/permissions';

/*
 * Onglets du dossier (F-ADH-03, 03-APPFLOW §4.3) : Identité (fiche en lecture), Pièces (statut et
 * dépôt, RG-PJ-01, 02), Accès en ligne (invitation, renvoi, désactivation, F-ADH-09), Historique
 * (journal des modifications, du plus récent au plus ancien).
 */
const labels = fr.members.detail;
const fields = fr.members.fields;

function orNull(value: string | number | null | undefined): string | null {
  return value === null || value === undefined || value === '' ? null : String(value);
}

function dateOrNull(value: string | null | undefined): string | null {
  return value === null || value === undefined ? null : formatDate(value);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Banner
      tone="danger"
      action={
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {fr.common.retry}
        </Button>
      }
    >
      {message}
    </Banner>
  );
}

function Loading() {
  return (
    <div aria-busy="true" className="grid gap-2">
      <span className="sr-only">{fr.common.loading}</span>
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-5 w-full" />
    </div>
  );
}

/* ---------------------------------------------------------------- Identité */

export function IdentityTab({ member }: { member: Member }) {
  const cga = member.portfolio === 'cga';
  const individual = member.entity_type === 'individual';
  const revenue = member.reference_revenue;
  const periodicity =
    fr.members.periodicities[member.fees_periodicity as 'monthly'] ?? member.fees_periodicity;

  return (
    <div className="grid gap-4">
      <Section title={labels.sections.membership}>
        <KeyValueList
          items={[
            { label: fields.portfolio, value: member.portfolio_label },
            { label: labels.fields.number, value: orNull(memberNumber(member)) },
            { label: fields.legacyNumber, value: orNull(member.legacy_number) },
            ...(cga && member.referrer
              ? [
                  {
                    label: fields.referrer,
                    value: `${member.referrer.label} · ${member.referrer.name}`,
                  },
                ]
              : []),
            { label: labels.fields.adhesionDate, value: dateOrNull(member.adhesion_date) },
            ...(cga
              ? [
                  {
                    label: labels.fields.contract,
                    value:
                      member.contract.signed_on === null
                        ? null
                        : `${formatDate(member.contract.signed_on)} · ${
                            member.contract.confirmed
                              ? labels.values.contractConfirmed
                              : labels.values.contractNotConfirmed
                          }`,
                  },
                ]
              : []),
            ...(member.contract.ended_on !== null
              ? [
                  {
                    label: labels.fields.contractEndedOn,
                    value: formatDate(member.contract.ended_on),
                  },
                ]
              : []),
          ]}
        />
      </Section>

      <Section title={labels.sections.identity}>
        <KeyValueList
          items={[
            {
              label: fields.entityType,
              value: fr.members.entityTypes[member.entity_type as 'company'] ?? member.entity_type,
            },
            { label: fields.companyName, value: member.company_name },
            { label: fields.sigle, value: orNull(member.sigle) },
            { label: fields.legalForm, value: member.legal_form_label },
            ...(individual
              ? [
                  { label: fields.ownerLastName, value: orNull(member.owner.last_name) },
                  { label: fields.ownerFirstNames, value: orNull(member.owner.first_names) },
                  { label: fields.ownerNationality, value: orNull(member.owner.nationality) },
                  {
                    label: fields.ownerIdDocumentType,
                    value: orNull(member.owner.id_document_type),
                  },
                  {
                    label: fields.ownerIdDocumentNumber,
                    value: orNull(member.owner.id_document_number),
                  },
                ]
              : [
                  {
                    label: fields.shareCapital,
                    value:
                      member.share_capital === null ? null : formatAmount(member.share_capital),
                  },
                ]),
            { label: fields.signatoryName, value: orNull(member.signatory_name) },
            { label: fields.signatoryTitle, value: orNull(member.signatory_title) },
          ]}
        />
      </Section>

      <Section title={labels.sections.tax}>
        <KeyValueList
          items={[
            { label: fields.ncc, value: member.ncc },
            { label: fields.rccm, value: orNull(member.rccm) },
            { label: fields.idu, value: orNull(member.idu) },
            { label: fields.regime, value: member.regime_label },
            { label: labels.fields.regimeSince, value: formatDate(member.regime_since) },
            { label: fields.taxOffice, value: orNull(member.tax_office?.name) },
            {
              label: fields.activityCode,
              value: orNull(member.activity_code?.code ?? member.activity_code_text),
            },
          ]}
        />
      </Section>

      <Section title={labels.sections.location}>
        <KeyValueList
          items={[
            { label: fields.address, value: orNull(member.address) },
            { label: fields.commune, value: orNull(member.commune?.name) },
            { label: fields.landSection, value: orNull(member.land_section) },
            { label: fields.landParcel, value: orNull(member.land_parcel) },
            { label: fields.phone, value: member.phone },
            { label: fields.whatsapp, value: orNull(member.whatsapp) },
            { label: fields.email, value: orNull(member.email) },
          ]}
        />
      </Section>

      <Section title={labels.sections.activity}>
        <KeyValueList
          items={[
            { label: fields.mainActivity, value: member.main_activity },
            { label: fields.sector, value: orNull(member.sector?.name) },
            { label: fields.employeesCount, value: orNull(member.employees_count) },
            {
              label: labels.fields.revenue,
              value:
                revenue === null
                  ? null
                  : labels.values.revenue(
                      formatAmount(revenue.amount),
                      fr.members.revenueKinds[revenue.kind as 'actual'] ?? revenue.kind,
                      String(revenue.year),
                    ),
            },
            ...(cga
              ? [{ label: fields.entryFee, value: formatAmount(member.entry_fee_amount) }]
              : []),
            {
              label: labels.fields.fees,
              value: labels.values.fees(formatAmount(member.fees_amount), periodicity),
            },
          ]}
        />
      </Section>
    </div>
  );
}

/* ---------------------------------------------------------------- Pièces (RG-PJ-01, 02) */

export function PiecesTab({ member }: { member: Member }) {
  const pieces = usePieces(member.id);
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState<string | null>(null);
  const text = labels.pieces;

  async function upload(type: string, file: File | null) {
    if (file === null) {
      return;
    }

    setUploading(type);

    try {
      await membersApi.uploadPiece(member.id, type, file);
      toast.success(text.uploaded);
      // État des pièces du dossier recalculé par le serveur (RG-PJ-02).
      await queryClient.invalidateQueries({ queryKey: memberKeys.detail(member.id) });
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        toast.error(error.message);
      } else if (!showValidationErrors(error, () => undefined, {})) {
        toastUnexpectedError(error);
      }
    } finally {
      setUploading(null);
    }
  }

  if (pieces.isPending) {
    return <Loading />;
  }

  if (pieces.isError) {
    return <LoadError message={text.loadError} onRetry={() => void pieces.refetch()} />;
  }

  if (pieces.data.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState icon={FileText}>{text.empty}</EmptyState>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent flush>
        <ul aria-label={text.caption} className="divide-y divide-border">
          {pieces.data.map((piece) => (
            <li
              key={piece.type}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="grid gap-1">
                <span className="font-semibold">{piece.type_label}</span>
                <span className="flex flex-wrap items-center gap-2 text-note text-muted">
                  <StatusBadge domain="piece" status={piece.status} />
                  {piece.received_at !== null
                    ? `${text.columns.receivedAt} ${formatDate(piece.received_at)}`
                    : null}
                  {piece.expires_at !== null
                    ? ` · ${text.columns.expiresAt} ${formatDate(piece.expires_at)}`
                    : null}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {piece.file !== null ? (
                  <Button variant="link" asChild>
                    <a href={piece.file.url} target="_blank" rel="noreferrer">
                      {text.open}
                    </a>
                  </Button>
                ) : null}
                {piece.can.upload ? (
                  <label className="inline-flex h-11 cursor-pointer items-center rounded-control border border-border bg-card px-3 text-label font-semibold hover:bg-neutral-soft md:h-8">
                    {uploading === piece.type ? fr.common.loading : text.upload}
                    <input
                      type="file"
                      className="sr-only"
                      accept="application/pdf,image/jpeg,image/png"
                      aria-label={text.uploadLabel(piece.type_label)}
                      disabled={uploading !== null}
                      onChange={(event) => {
                        void upload(piece.type, event.target.files?.[0] ?? null);
                        event.target.value = '';
                      }}
                    />
                  </label>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------- Accès en ligne (F-ADH-09) */

type InviteForm = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  channel: string;
  role: string;
};

function InviteAccessDialog({
  member,
  hasOwner,
  onClose,
}: {
  member: Member;
  hasOwner: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [conflict, setConflict] = useState<string | null>(null);
  const text = labels.accesses.dialog;
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<InviteForm>({
    defaultValues: {
      first_name: '',
      last_name: '',
      phone: member.phone,
      email: member.email ?? '',
      channel: 'sms',
      // Un seul accès principal par adhérent ; les suivants sont secondaires.
      role: hasOwner ? 'member_user' : 'member_owner',
    },
  });
  const required = fr.members.create.errors.required;

  const submit = handleSubmit(async (values) => {
    let invalid = false;

    for (const field of ['first_name', 'last_name', 'phone'] as const) {
      if (values[field].trim() === '') {
        setError(field, { message: required });
        invalid = true;
      }
    }

    if (invalid) {
      return;
    }

    setConflict(null);

    try {
      await membersApi.inviteAccess(member.id, {
        first_name: values.first_name.trim(),
        last_name: values.last_name.trim(),
        phone: values.phone.trim(),
        email: values.email.trim() === '' ? null : values.email.trim(),
        channel: values.channel,
        role: values.role,
      });
      toast.success(text.done);
      await queryClient.invalidateQueries({ queryKey: memberKeys.accesses(member.id) });
      onClose();
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        setConflict(error.message);
      } else if (
        !showValidationErrors(error, setError, {
          first_name: 'first_name',
          last_name: 'last_name',
          phone: 'phone',
          email: 'email',
          channel: 'channel',
          role: 'role',
        })
      ) {
        toastUnexpectedError(error);
      }
    }
  });

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={text.title}
      description={text.description}
      submitLabel={text.submit}
      submitting={isSubmitting}
      onSubmit={submit}
      conflict={conflict}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <TextField
          id="invite-first-name"
          label={text.firstName}
          required
          error={errors.first_name?.message}
          {...register('first_name')}
        />
        <TextField
          id="invite-last-name"
          label={text.lastName}
          required
          error={errors.last_name?.message}
          {...register('last_name')}
        />
        <TextField
          id="invite-phone"
          type="tel"
          label={text.phone}
          required
          error={errors.phone?.message}
          {...register('phone')}
        />
        <TextField
          id="invite-email"
          type="email"
          label={text.email}
          error={errors.email?.message}
          {...register('email')}
        />
      </div>
      <FormField id="invite-channel" label={text.channel} required error={errors.channel?.message}>
        <Select {...fieldProps('invite-channel', errors.channel?.message)} {...register('channel')}>
          {INVITATION_CHANNELS.map((channel) => (
            <option key={channel} value={channel}>
              {labels.accesses.channels[channel]}
            </option>
          ))}
        </Select>
      </FormField>
      <RadioGroupField id="invite-role" legend={text.role} required error={errors.role?.message}>
        <div className="flex flex-wrap gap-4">
          {(['member_owner', 'member_user'] as const).map((role) => (
            <RadioOption key={role} label={fr.roles[role]}>
              <Radio value={role} {...register('role')} />
            </RadioOption>
          ))}
        </div>
      </RadioGroupField>
    </FormDialog>
  );
}

export function AccessesTab({ member }: { member: Member }) {
  const { can } = useAuth();
  const accesses = useAccesses(member.id);
  const queryClient = useQueryClient();
  const [inviting, setInviting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const text = labels.accesses;
  const canInvite =
    can(permissionCodes.cga.membersAccess) &&
    member.status !== 'radiated' &&
    member.status !== 'closed';

  async function act(access: MemberAccess, action: 'resend' | 'disable' | 'enable') {
    setBusy(access.id);

    try {
      await membersApi.accessAction(member.id, access.id, action);
      toast.success({ resend: text.resent, disable: text.disabled, enable: text.enabled }[action]);
      await queryClient.invalidateQueries({ queryKey: memberKeys.accesses(member.id) });
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        toast.error(error.message);
      } else {
        toastUnexpectedError(error);
      }
    } finally {
      setBusy(null);
    }
  }

  const invite = canInvite ? (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => {
        setInviting(true);
      }}
    >
      <UserPlus aria-hidden="true" />
      {text.invite}
    </Button>
  ) : null;

  let body: ReactNode;

  if (accesses.isPending) {
    body = <Loading />;
  } else if (accesses.isError) {
    body = <LoadError message={text.loadError} onRetry={() => void accesses.refetch()} />;
  } else if (accesses.data.length === 0) {
    body = (
      <EmptyState icon={KeyRound} action={invite}>
        {text.empty}
      </EmptyState>
    );
  } else {
    body = (
      <ul aria-label={text.caption} className="divide-y divide-border">
        {accesses.data.map((access) => (
          <li key={access.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="grid gap-1">
              <span className="font-semibold">{`${access.first_name} ${access.last_name}`}</span>
              <span className="flex flex-wrap items-center gap-2 text-note text-muted">
                {access.role_label} · {access.phone}
                <StatusBadge domain="access" status={access.status} />
                {access.invitation !== null
                  ? text.invitationSent(formatTimestamp(access.invitation.sent_at))
                  : null}
                {access.read_only_until !== null
                  ? text.readOnlyUntil(formatDate(access.read_only_until))
                  : null}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {access.can.resend_invitation ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => void act(access, 'resend')}
                >
                  {text.resend}
                </Button>
              ) : null}
              {access.can.disable ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => void act(access, 'disable')}
                >
                  {text.disable}
                </Button>
              ) : null}
              {access.can.enable ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => void act(access, 'enable')}
                >
                  {text.enable}
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{text.caption}</CardTitle>
        {accesses.data !== undefined && accesses.data.length > 0 ? invite : null}
      </CardHeader>
      <CardContent>{body}</CardContent>

      {inviting ? (
        <InviteAccessDialog
          member={member}
          hasOwner={(accesses.data ?? []).some((access) => access.role === 'member_owner')}
          onClose={() => {
            setInviting(false);
          }}
        />
      ) : null}
    </Card>
  );
}

/* ---------------------------------------------------------------- Historique */

function shownValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return fr.table.none;
  }

  return typeof value === 'boolean'
    ? value
      ? fr.common.yes
      : fr.common.no
    : String(value as string | number);
}

function HistoryItem({ entry }: { entry: HistoryEntry }) {
  const text = labels.history;

  return (
    <li className="grid gap-1.5 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">{`${entry.subject_label} · ${entry.event_label}`}</span>
        <span className="text-note text-muted">
          {formatTimestamp(entry.occurred_at)} · {entry.actor ?? text.system}
        </span>
      </div>
      {entry.changes.length > 0 ? (
        <ul className="grid gap-0.5 text-table">
          {entry.changes.map((change) => (
            <li key={change.field}>
              <span className="text-muted">{text.change(change.label)}</span>{' '}
              <span className="line-through decoration-muted">{shownValue(change.before)}</span>
              {' → '}
              <span className="font-semibold">{shownValue(change.after)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-3 text-note text-muted">
        {entry.source_label !== null ? <span>{text.source(entry.source_label)}</span> : null}
        {entry.justification !== null ? (
          <a
            className="font-semibold text-primary underline"
            href={entry.justification.url}
            target="_blank"
            rel="noreferrer"
          >
            {`${text.justification} : ${entry.justification.name}`}
          </a>
        ) : null}
      </div>
    </li>
  );
}

export function HistoryTab({ member }: { member: Member }) {
  const [page, setPage] = useState(1);
  const history = useHistory(member.id, page);
  const text = labels.history;

  if (history.isPending) {
    return <Loading />;
  }

  if (history.isError) {
    return <LoadError message={text.loadError} onRetry={() => void history.refetch()} />;
  }

  const { items, total, perPage } = history.data;
  const lastPage = Math.max(1, Math.ceil(total / perPage));

  return (
    <Card>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState icon={History}>{text.empty}</EmptyState>
        ) : (
          <ul aria-label={text.caption} className="divide-y divide-border">
            {items.map((entry) => (
              <HistoryItem key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
        {lastPage > 1 ? (
          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <Button
              variant="secondary"
              size="sm"
              disabled={page === 1}
              onClick={() => {
                setPage(page - 1);
              }}
            >
              {fr.table.previous}
            </Button>
            <span className="text-note text-muted">{`${String(page)} / ${String(lastPage)}`}</span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page === lastPage}
              onClick={() => {
                setPage(page + 1);
              }}
            >
              {fr.table.next}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
