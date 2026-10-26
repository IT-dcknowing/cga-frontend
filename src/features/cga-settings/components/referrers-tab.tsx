import { useQueryClient } from '@tanstack/react-query';
import { Handshake, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { FormDialog } from '@/components/shared/form-dialog';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox, CheckboxField } from '@/components/ui/checkbox';
import { fieldProps } from '@/components/ui/field-props';
import { FormField } from '@/components/ui/form-field';
import { Skeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/features/auth/session/auth-context';
import { httpMembersApi as membersApi, type Referrer } from '@/features/members/api/members-api';
import { memberKeys, useReferrers } from '@/features/members/api/queries';
import { ReferrerTag } from '@/features/members/components/portfolio-badge';
import { ApiBusinessError } from '@/lib/api-errors';
import { formatNumber } from '@/lib/format';
import { showValidationErrors } from '@/lib/form-errors';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';
import { permissionCodes } from '@/lib/reference/permissions';

/*
 * Onglet « Apporteurs d'affaires » de `/cga/parametres` (06-IMPLEMENTATION-PLAN étape 2.16,
 * RG-PTF-06) : liste « Accessoire n » (nom, contact, conditions, nombre de dossiers, actif), ajout,
 * modification, suppression d'un apporteur jamais rattaché. Lecture avec « Voir les apporteurs » ;
 * écriture pour le gérant (« Modifier la fiche du centre »). Interne au centre : jamais imprimé.
 */
const labels = fr.cgaSettings.referrers;

type ReferrerForm = {
  label: string;
  name: string;
  phone: string;
  email: string;
  terms: string;
  active: boolean;
};

function formOf(referrer: Referrer | null): ReferrerForm {
  return {
    label: referrer?.label ?? '',
    name: referrer?.name ?? '',
    phone: referrer?.phone ?? '',
    email: referrer?.email ?? '',
    terms: referrer?.terms ?? '',
    active: referrer?.active ?? true,
  };
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed;
}

function ReferrerDialog({ referrer, onClose }: { referrer: Referrer | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [conflict, setConflict] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ReferrerForm>({ defaultValues: formOf(referrer) });
  const text = labels.dialog;

  const submit = handleSubmit(async (values) => {
    if (values.name.trim() === '') {
      setError('name', { message: fr.members.create.errors.required });

      return;
    }

    setConflict(null);

    const input = {
      label: textOrNull(values.label),
      name: values.name.trim(),
      phone: textOrNull(values.phone),
      email: textOrNull(values.email),
      terms: textOrNull(values.terms),
      active: values.active,
    };

    try {
      await (referrer === null
        ? membersApi.createReferrer(input)
        : membersApi.updateReferrer(referrer.id, input));
      toast.success(referrer === null ? text.created : text.saved);
      await queryClient.invalidateQueries({ queryKey: memberKeys.referrers });
      onClose();
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        setConflict(error.message);
      } else if (
        !showValidationErrors(error, setError, {
          label: 'label',
          name: 'name',
          phone: 'phone',
          email: 'email',
          terms: 'terms',
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
      title={referrer === null ? text.createTitle : text.editTitle}
      description={text.description}
      submitLabel={text.submit}
      submitting={isSubmitting}
      onSubmit={submit}
      conflict={conflict}
    >
      <TextField
        id="referrer-label"
        label={text.label}
        hint={text.labelHint}
        error={errors.label?.message}
        {...register('label')}
      />
      <TextField
        id="referrer-name"
        label={text.name}
        required
        error={errors.name?.message}
        {...register('name')}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <TextField
          id="referrer-phone"
          type="tel"
          label={text.phone}
          error={errors.phone?.message}
          {...register('phone')}
        />
        <TextField
          id="referrer-email"
          type="email"
          label={text.email}
          error={errors.email?.message}
          {...register('email')}
        />
      </div>
      <FormField
        id="referrer-terms"
        label={text.terms}
        hint={text.termsHint}
        error={errors.terms?.message}
      >
        <Textarea
          {...fieldProps('referrer-terms', errors.terms?.message, true)}
          {...register('terms')}
        />
      </FormField>
      <CheckboxField id="referrer-active" label={text.active}>
        <Checkbox id="referrer-active" {...register('active')} />
      </CheckboxField>
    </FormDialog>
  );
}

function DeleteReferrerDialog({ referrer, onClose }: { referrer: Referrer; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [conflict, setConflict] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const text = labels.delete;

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={text.title}
      description={`${referrer.label} · ${referrer.name}`}
      submitLabel={text.submit}
      submitting={submitting}
      conflict={conflict}
      effects={text.effects}
      onSubmit={(event) => {
        event.preventDefault();
        setConflict(null);
        setSubmitting(true);
        membersApi
          .deleteReferrer(referrer.id)
          .then(async () => {
            toast.success(text.done);
            await queryClient.invalidateQueries({ queryKey: memberKeys.referrers });
            onClose();
          })
          .catch((error: unknown) => {
            setSubmitting(false);

            if (error instanceof ApiBusinessError) {
              setConflict(error.message);
            } else {
              toastUnexpectedError(error);
            }
          });
      }}
    >
      {null}
    </ConfirmDialog>
  );
}

export function ReferrersTab() {
  const { can } = useAuth();
  const referrers = useReferrers(true);
  const manages = can(permissionCodes.cga.profileManage);
  const [editing, setEditing] = useState<Referrer | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Referrer | null>(null);

  const add = manages ? (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => {
        setEditing('new');
      }}
    >
      <Plus aria-hidden="true" />
      {labels.add}
    </Button>
  ) : null;

  let body;

  if (referrers.isPending) {
    body = (
      <div aria-busy="true" className="grid gap-2">
        <span className="sr-only">{fr.common.loading}</span>
        <Skeleton className="h-5 w-full" />
      </div>
    );
  } else if (referrers.isError) {
    body = (
      <Banner
        tone="danger"
        action={
          <Button variant="secondary" size="sm" onClick={() => void referrers.refetch()}>
            {fr.common.retry}
          </Button>
        }
      >
        {labels.loadError}
      </Banner>
    );
  } else if (referrers.data.length === 0) {
    body = (
      <EmptyState icon={Handshake} action={add}>
        {labels.empty}
      </EmptyState>
    );
  } else {
    body = (
      <ul aria-label={labels.caption} className="divide-y divide-border">
        {referrers.data.map((referrer) => (
          <li key={referrer.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div className="grid gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <ReferrerTag label={referrer.label} />
                <span className="font-semibold">{referrer.name}</span>
                {referrer.active ? null : (
                  <span className="rounded-badge bg-neutral-soft px-2 py-0.5 text-badge font-bold text-muted">
                    {labels.inactive}
                  </span>
                )}
              </span>
              <span className="text-note text-muted">
                {[referrer.phone, referrer.email].filter(Boolean).join(' · ') || fr.table.none}
              </span>
              {referrer.terms !== null ? (
                <span className="text-table">{referrer.terms}</span>
              ) : null}
              <span className="text-note text-muted">
                {labels.members(formatNumber(referrer.members_count))}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {referrer.can.update && manages ? (
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={labels.editLabel(referrer.label)}
                  onClick={() => {
                    setEditing(referrer);
                  }}
                >
                  <Pencil aria-hidden="true" />
                  {labels.edit}
                </Button>
              ) : null}
              {referrer.can.delete && manages ? (
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={labels.deleteLabel(referrer.label)}
                  onClick={() => {
                    setDeleting(referrer);
                  }}
                >
                  <Trash2 aria-hidden="true" />
                  {labels.delete.action}
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
        <CardTitle>{labels.title}</CardTitle>
        {referrers.data !== undefined && referrers.data.length > 0 ? add : null}
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-note text-muted">{labels.intro}</p>
        {body}
      </CardContent>

      {editing !== null ? (
        <ReferrerDialog
          referrer={editing === 'new' ? null : editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
      {deleting !== null ? (
        <DeleteReferrerDialog
          referrer={deleting}
          onClose={() => {
            setDeleting(null);
          }}
        />
      ) : null}
    </Card>
  );
}
