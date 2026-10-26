import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { PublicLayout } from '@/components/layout/public-layout';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Checkbox, CheckboxField } from '@/components/ui/checkbox';
import { fieldProps } from '@/components/ui/field-props';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { authRoutes, resolveDestination } from '@/features/auth/lib/destination';
import { confirmationError, confirmationMatches, passwordField } from '@/features/auth/schemas';
import { useAuth } from '@/features/auth/session/auth-context';
import { ApiBusinessError } from '@/lib/api-errors';
import { config } from '@/lib/config';
import { showValidationErrors } from '@/lib/form-errors';
import { fr } from '@/lib/i18n/fr';
import { roleLabel } from '@/lib/reference/roles';
import { toastUnexpectedError } from '@/lib/http-error-toast';

/*
 * `/activer/:jeton` (F-AUTH-02, 03-APPFLOW §2) : accueil nominatif, choix du mot de passe,
 * acceptation des conditions d'utilisation et, pour un adhérent, consentements SMS / WhatsApp
 * (RG-NOT-04, loi n° 2013-450). Un lien invalide ou expiré affiche le contact de l'organisation qui
 * invite ; c'est le serveur qui juge le jeton (usage unique, 7 jours — 02-TRD §6.1).
 */
const activationSchema = z
  .object({
    password: passwordField(),
    confirmation: z.string(),
    terms: z.boolean().refine((accepted) => accepted, {
      message: fr.activation.errors.termsRequired,
    }),
    sms: z.boolean(),
    whatsapp: z.boolean(),
  })
  .refine(confirmationMatches, confirmationError);

type ActivationForm = z.infer<typeof activationSchema>;

function InvalidLink({ contact }: { contact: string | null }) {
  return (
    <PublicLayout title={fr.activation.invalid}>
      <p className="text-body text-muted">
        {contact !== null ? fr.activation.invalidHelp(contact) : fr.activation.invalidNoContact}
      </p>
      <p className="mt-4 text-center">
        <Button variant="link" asChild>
          <Link to={authRoutes.login}>{fr.errorScreens.backToLogin}</Link>
        </Button>
      </p>
    </PublicLayout>
  );
}

export function ActivationPage() {
  const { jeton = '' } = useParams();
  const navigate = useNavigate();
  const { api, setSession } = useAuth();
  // Jeton refusé au moment de l'activation (utilisé entre-temps, expiré) : même écran que le lien invalide.
  const [rejected, setRejected] = useState(false);

  const invitation = useQuery({
    queryKey: ['invitation', jeton],
    queryFn: () => api.readInvitation(jeton),
    retry: false,
  });

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ActivationForm>({
    resolver: zodResolver(activationSchema),
    defaultValues: { password: '', confirmation: '', terms: false, sms: false, whatsapp: false },
  });

  const submit = handleSubmit(async (values) => {
    try {
      const session = await api.activate({
        token: jeton,
        password: values.password,
        accepted_terms: values.terms,
        sms_opt_in: values.sms,
        whatsapp_opt_in: values.whatsapp,
      });

      setSession(session);
      await navigate(resolveDestination(session), { replace: true });
    } catch (error) {
      if (
        showValidationErrors(error, setError, { password: 'password', accepted_terms: 'terms' })
      ) {
        return;
      }

      if (error instanceof ApiBusinessError) {
        setRejected(true);

        return;
      }

      toastUnexpectedError(error);
    }
  });

  if (invitation.isPending) {
    return (
      <PublicLayout title={fr.activation.title}>
        <div role="status" className="grid gap-3">
          <span className="sr-only">{fr.common.loading}</span>
          <span aria-hidden="true" className="h-12 animate-pulse rounded-card bg-primary-soft" />
          <span aria-hidden="true" className="h-10 animate-pulse rounded-control bg-bg" />
          <span aria-hidden="true" className="h-10 animate-pulse rounded-control bg-bg" />
        </div>
      </PublicLayout>
    );
  }

  if (invitation.isError) {
    return (
      <PublicLayout title={fr.activation.title}>
        <Banner tone="danger" role="alert">
          {fr.errors.unexpected}
        </Banner>
      </PublicLayout>
    );
  }

  if (invitation.data.status === 'invalid' || rejected) {
    return <InvalidLink contact={invitation.data.organization_contact} />;
  }

  const { first_name, organization_name, role, is_member } = invitation.data;

  return (
    <PublicLayout title={fr.activation.title}>
      <Banner tone="success">
        {fr.activation.welcome(first_name, organization_name, roleLabel(role))}
      </Banner>

      <form noValidate onSubmit={submit} className="mt-4 grid gap-4">
        <FormField
          id="password"
          label={fr.activation.password}
          required
          hint={fr.validation.passwordHint(String(config.passwordMinLength))}
          error={errors.password?.message}
        >
          <Input
            {...fieldProps('password', errors.password?.message, true)}
            type="password"
            autoComplete="new-password"
            {...register('password')}
          />
        </FormField>

        <FormField
          id="confirmation"
          label={fr.activation.confirmPassword}
          required
          error={errors.confirmation?.message}
        >
          <Input
            {...fieldProps('confirmation', errors.confirmation?.message)}
            type="password"
            autoComplete="new-password"
            {...register('confirmation')}
          />
        </FormField>

        <CheckboxField id="terms" label={fr.activation.terms} error={errors.terms?.message}>
          <Checkbox {...fieldProps('terms', errors.terms?.message)} {...register('terms')} />
        </CheckboxField>

        {is_member ? (
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-label font-semibold text-muted">
              {fr.activation.consents}
            </legend>

            <CheckboxField id="sms" label={fr.activation.smsOptIn}>
              <Checkbox id="sms" {...register('sms')} />
            </CheckboxField>

            <CheckboxField id="whatsapp" label={fr.activation.whatsappOptIn}>
              <Checkbox id="whatsapp" {...register('whatsapp')} />
            </CheckboxField>
          </fieldset>
        ) : null}

        <Button type="submit" loading={isSubmitting} className="w-full">
          {fr.activation.submit}
        </Button>
      </form>
    </PublicLayout>
  );
}
