import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormDialog } from '@/components/shared/form-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { fieldProps } from '@/components/ui/field-props';
import { FileField } from '@/components/ui/file-field';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { TextField } from '@/components/ui/text-field';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/features/auth/session/auth-context';
import { invoiceKeys, invoicesApi, type Invoice } from '@/features/invoices/api/invoices-api';
import { dossierApi } from '@/features/members/api/dossier-api';
import { httpMembersApi as membersApi } from '@/features/members/api/members-api';
import { dossierKeys } from '@/features/members/api/queries';
import { chargeLabel } from '@/features/members/lib/charges';
import { ApiBusinessError } from '@/lib/api-errors';
import { config } from '@/lib/config';
import { formatAmount } from '@/lib/format';
import { showValidationErrors } from '@/lib/form-errors';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';
import { permissionCodes } from '@/lib/reference/permissions';

/*
 * Modales des factures FNE (F-PAY-05, 06, 03-APPFLOW §4.3 `/cga/factures`) : « Émettre une facture »
 * (adhérent, sommes dues non encore facturées ; montants calculés par le serveur, soumission à la
 * certification), « Saisir la certification » (mode manuel : numéro FNE et PDF certifié), annulation
 * d'une facture non certifiée (motif). Le serveur refait chaque contrôle (RG-FNE-01 à 05).
 */
const labels = fr.invoices;
const required = fr.members.create.errors.required;

async function refresh(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
}

/** « Émettre une facture » ; `member` : l'adhérent déjà choisi (depuis son dossier). */
export function IssueInvoiceDialog({
  member,
  onClose,
}: {
  member?: { id: string; company_name: string };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [memberId, setMemberId] = useState(member?.id ?? '');
  const [selected, setSelected] = useState<string[]>([]);
  const [errors, setErrors] = useState<{ member?: string; charges?: string }>({});
  const [conflict, setConflict] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const text = labels.issue;
  const candidates = useQuery({
    queryKey: ['invoices', 'members', search],
    queryFn: () =>
      membersApi.list({
        portfolio: can(permissionCodes.cga.cabinet) ? 'all' : 'cga',
        statuses: ['active', 'radiation_pending'],
        search,
        regime: null,
        taxOfficeId: null,
        referrerId: null,
        sort: null,
        page: 1,
      }),
    enabled: member === undefined,
  });
  const charges = useQuery({
    queryKey: dossierKeys.charges(memberId),
    queryFn: () => dossierApi.charges(memberId),
    enabled: memberId !== '',
  });
  // Sommes dues encore à facturer : ni facturées, ni annulées.
  const billable = (charges.data ?? []).filter(
    (charge) => charge.invoice_id === null && charge.status !== 'cancelled',
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(typed.trim());
    }, config.searchDebounceMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [typed]);

  async function submit() {
    const found = {
      member: memberId === '' ? required : undefined,
      charges: memberId !== '' && selected.length === 0 ? text.chargesRequired : undefined,
    };

    setErrors(found);

    if (found.member !== undefined || found.charges !== undefined) {
      return;
    }

    setSubmitting(true);
    setConflict(null);

    try {
      const invoice = await invoicesApi.issue(memberId, selected);

      toast.success(text.done(invoice.number));
      await refresh(queryClient);
      await queryClient.invalidateQueries({ queryKey: dossierKeys.all(memberId) });
      onClose();
    } catch (error) {
      setSubmitting(false);

      if (error instanceof ApiBusinessError) {
        setConflict(error.message);
      } else if (
        !showValidationErrors(
          error,
          (name, fieldError) => {
            setErrors((current) => ({
              ...current,
              [name === 'member_id' ? 'member' : 'charges']: fieldError.message,
            }));
          },
          { member_id: 'member_id', charge_ids: 'charge_ids', 'charge_ids.0': 'charge_ids' },
        )
      ) {
        toastUnexpectedError(error);
      }
    }
  }

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={text.title}
      description={member === undefined ? text.description : member.company_name}
      submitLabel={text.submit}
      submitting={submitting}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      conflict={conflict}
    >
      {member === undefined ? (
        <>
          <FormField id="invoice-search" label={text.search}>
            <Input
              id="invoice-search"
              type="search"
              value={typed}
              onChange={(event) => {
                setTyped(event.target.value);
              }}
            />
          </FormField>
          <FormField id="invoice-member" label={text.member} required error={errors.member}>
            <Select
              {...fieldProps('invoice-member', errors.member)}
              aria-required
              value={memberId}
              onChange={(event) => {
                setMemberId(event.target.value);
                setSelected([]);
                setErrors({});
              }}
            >
              <option value="">{fr.referentials.none}</option>
              {(candidates.data?.items ?? []).map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.company_name}
                </option>
              ))}
            </Select>
          </FormField>
        </>
      ) : null}
      {memberId !== '' ? (
        <fieldset
          className="grid gap-2"
          aria-describedby={errors.charges ? 'invoice-charges-error' : undefined}
        >
          <legend className="mb-1.5 text-label font-semibold text-muted">{text.charges}</legend>
          {charges.isPending ? null : billable.length === 0 ? (
            <p className="text-note text-muted">{text.noCharge}</p>
          ) : (
            billable.map((charge) => (
              <label key={charge.id} className="flex items-start justify-between gap-3 text-body">
                <span className="flex items-start gap-2">
                  <Checkbox
                    checked={selected.includes(charge.id)}
                    onChange={(event) => {
                      setSelected((current) =>
                        event.target.checked
                          ? [...current, charge.id]
                          : current.filter((id) => id !== charge.id),
                      );
                      setErrors((current) => ({ ...current, charges: undefined }));
                    }}
                  />
                  {chargeLabel(charge)}
                </span>
                <span className="font-semibold">{formatAmount(charge.amount)}</span>
              </label>
            ))
          )}
          {errors.charges !== undefined ? (
            <p id="invoice-charges-error" className="text-note text-danger">
              {errors.charges}
            </p>
          ) : null}
        </fieldset>
      ) : null}
    </FormDialog>
  );
}

/** « Saisir la certification » (mode manuel) : numéro FNE et PDF certifié. */
export function CertifyDialog({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | undefined>();
  const [conflict, setConflict] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<{ fne_number: string }>({ defaultValues: { fne_number: '' } });
  const text = labels.certify;

  const submit = handleSubmit(async ({ fne_number: fneNumber }) => {
    let invalid = false;

    if (fneNumber.trim() === '') {
      setError('fne_number', { message: required });
      invalid = true;
    }

    setFileError(file === null ? required : undefined);

    if (invalid || file === null) {
      return;
    }

    setConflict(null);

    try {
      await invoicesApi.certify(invoice.id, fneNumber.trim(), file);
      toast.success(text.done(invoice.number));
      await refresh(queryClient);
      onClose();
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        setConflict(error.message);
      } else if (
        !showValidationErrors(
          error,
          (name, fieldError) => {
            if (name === ('file' as 'fne_number')) {
              setFileError(fieldError.message);
            } else {
              setError('fne_number', fieldError);
            }
          },
          { fne_number: 'fne_number', file: 'file' as 'fne_number' },
        )
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
      description={labels.line(invoice.number, formatAmount(invoice.amount_incl_tax))}
      submitLabel={text.submit}
      submitting={isSubmitting}
      onSubmit={submit}
      conflict={conflict}
    >
      <TextField
        id="certify-number"
        label={text.number}
        required
        error={errors.fne_number?.message}
        {...register('fne_number')}
      />
      <FileField
        id="certify-file"
        label={text.file}
        required
        accept="application/pdf"
        error={fileError}
        onChange={(chosen) => {
          setFile(chosen);
          setFileError(undefined);
        }}
      />
    </FormDialog>
  );
}

/** Annulation d'une facture non certifiée (une facture certifiée se corrige par un avoir). */
export function CancelInvoiceDialog({
  invoice,
  onClose,
}: {
  invoice: Invoice;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [conflict, setConflict] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<{ reason: string }>({ defaultValues: { reason: '' } });
  const text = labels.cancel;

  const submit = handleSubmit(async ({ reason }) => {
    if (reason.trim() === '') {
      setError('reason', { message: required });

      return;
    }

    setConflict(null);

    try {
      await invoicesApi.cancel(invoice.id, reason.trim());
      toast.success(text.done(invoice.number));
      await refresh(queryClient);
      onClose();
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        setConflict(error.message);
      } else if (!showValidationErrors(error, setError, { reason: 'reason' })) {
        toastUnexpectedError(error);
      }
    }
  });

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={text.title}
      description={invoice.number}
      submitLabel={text.submit}
      submitting={isSubmitting}
      onSubmit={submit}
      conflict={conflict}
      effects={text.effects}
    >
      <FormField
        id="cancel-invoice-reason"
        label={text.reason}
        required
        error={errors.reason?.message}
      >
        <Textarea
          {...fieldProps('cancel-invoice-reason', errors.reason?.message)}
          aria-required
          {...register('reason')}
        />
      </FormField>
    </ConfirmDialog>
  );
}
