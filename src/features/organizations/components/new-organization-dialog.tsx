import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormDialog } from '@/components/shared/form-dialog';
import { Checkbox, CheckboxField } from '@/components/ui/checkbox';
import { TextField } from '@/components/ui/text-field';
import { organizationsApi } from '@/features/organizations/api';
import type { Organization } from '@/features/organizations/api/organizations-api';
import { useOrganizationSaved } from '@/features/organizations/api/queries';
import { RegistrationFields } from '@/features/organizations/components/registration-fields';
import { organizationRoutes } from '@/features/organizations/lib/organization';
import {
  checkAgreement,
  emptyRegistration,
  registrationApiFields,
  registrationInput,
  registrationShape,
} from '@/features/organizations/lib/schemas';
import { ApiBusinessError, ApiValidationError } from '@/lib/api-errors';
import { showValidationErrors } from '@/lib/form-errors';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';

/*
 * Modale « Nouveau CGA » (F-ORG-02, 03-APPFLOW §3.2) : fiche minimale et option « Ouvrir l'accès
 * maintenant », qui invite le gérant (prénom, nom, téléphone). Enregistrer → toast « CGA
 * enregistré » → fiche du CGA ; avec l'option, toast « Invitation envoyée au gérant ».
 */
const labels = fr.organization;
const errors = labels.errors;

const schema = z
  .object({
    ...registrationShape,
    open_access: z.boolean(),
    manager_first_name: z.string().trim(),
    manager_last_name: z.string().trim(),
    manager_phone: z.string().trim(),
  })
  .superRefine((values, context) => {
    checkAgreement(values, context);

    if (!values.open_access) {
      return;
    }

    const required = [
      ['manager_first_name', errors.firstNameRequired],
      ['manager_last_name', errors.lastNameRequired],
      ['manager_phone', errors.phoneRequired],
    ] as const;

    for (const [field, message] of required) {
      if (values[field] === '') {
        context.addIssue({ code: 'custom', path: [field], message });
      }
    }
  });

type NewOrganizationForm = z.infer<typeof schema>;

/** Premier message d'un refus de l'API, pour expliquer un échec d'invitation. */
function refusalOf(error: unknown): string | undefined {
  if (error instanceof ApiValidationError) {
    return Object.values(error.fields)[0];
  }

  return error instanceof ApiBusinessError ? error.message : undefined;
}

export function NewOrganizationDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const saved = useOrganizationSaved();
  const [conflict, setConflict] = useState<string | null>(null);
  const form = useForm<NewOrganizationForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      ...emptyRegistration,
      open_access: false,
      manager_first_name: '',
      manager_last_name: '',
      manager_phone: '',
    },
  });
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors: fieldErrors, isSubmitting },
  } = form;
  const openAccess = useWatch({ control, name: 'open_access' });

  async function inviteManager(organization: Organization, values: NewOrganizationForm) {
    try {
      saved(
        await organizationsApi.inviteManager(organization.id, {
          first_name: values.manager_first_name,
          last_name: values.manager_last_name,
          phone: values.manager_phone,
        }),
      );
      toast.success(labels.create.invited);
    } catch (error) {
      // Le CGA existe déjà : l'invitation se refait depuis l'onglet Utilisateurs de sa fiche.
      toast.error(labels.create.inviteFailed, { description: refusalOf(error) });
    }
  }

  const submit = handleSubmit(async (values) => {
    setConflict(null);

    let organization: Organization;

    try {
      organization = await organizationsApi.create(registrationInput(values));
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        setConflict(error.message);
      } else if (!showValidationErrors(error, setError, registrationApiFields)) {
        toastUnexpectedError(error);
      }

      return;
    }

    saved(organization);
    toast.success(labels.create.done);

    if (values.open_access) {
      await inviteManager(organization, values);
    }

    await navigate(organizationRoutes.detail(organization.id));
  });

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={labels.create.title}
      description={labels.create.description}
      submitLabel={labels.create.submit}
      submitting={isSubmitting}
      onSubmit={submit}
      conflict={conflict}
    >
      <RegistrationFields form={form} idPrefix="new-org" />

      <CheckboxField id="new-org-open-access" label={labels.create.openAccess}>
        <Checkbox id="new-org-open-access" {...register('open_access')} />
      </CheckboxField>

      {openAccess ? (
        <div className="grid gap-4 md:grid-cols-2">
          <p className="text-note text-muted md:col-span-2">{labels.create.openAccessHint}</p>
          <TextField
            id="new-org-manager-first-name"
            label={labels.create.managerFirstName}
            required
            autoComplete="off"
            error={fieldErrors.manager_first_name?.message}
            {...register('manager_first_name')}
          />
          <TextField
            id="new-org-manager-last-name"
            label={labels.create.managerLastName}
            required
            autoComplete="off"
            error={fieldErrors.manager_last_name?.message}
            {...register('manager_last_name')}
          />
          <TextField
            id="new-org-manager-phone"
            label={labels.create.managerPhone}
            required
            type="tel"
            autoComplete="off"
            error={fieldErrors.manager_phone?.message}
            {...register('manager_phone')}
          />
        </div>
      ) : null}
    </FormDialog>
  );
}
