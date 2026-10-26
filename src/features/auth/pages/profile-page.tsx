import { zodResolver } from '@hookform/resolvers/zod';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { PageHeader } from '@/components/layout/page-header';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox, CheckboxField } from '@/components/ui/checkbox';
import { fieldProps } from '@/components/ui/field-props';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { attemptsLeftOf, type SessionUser } from '@/features/auth/api/auth-api';
import { spaceKindOf } from '@/features/auth/lib/destination';
import {
  codeField,
  confirmationError,
  confirmationMatches,
  passwordField,
} from '@/features/auth/schemas';
import { useAuth } from '@/features/auth/session/auth-context';
import { ApiBusinessError } from '@/lib/api-errors';
import { config } from '@/lib/config';
import { showValidationErrors } from '@/lib/form-errors';
import { fr } from '@/lib/i18n/fr';
import { toastUnexpectedError } from '@/lib/http-error-toast';

/*
 * `/profil` (F-AUTH-05, 03-APPFLOW §5.2), commun à tous les espaces : nom, e-mail, téléphone
 * (changement confirmé par un code envoyé au nouveau numéro), mot de passe et, pour un adhérent,
 * préférences SMS / WhatsApp (RG-NOT-04). Chaque bloc s'enregistre séparément ; le serveur renvoie
 * l'état à jour de `/me`, qui remplace la session affichée.
 */
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

const identitySchema = z.object({
  first_name: z.string().trim().min(1, fr.profile.errors.firstNameRequired),
  last_name: z.string().trim().min(1, fr.profile.errors.lastNameRequired),
  // L'e-mail est facultatif (RG-ACC-01) : vide, il est retiré du compte.
  email: z.union([z.literal(''), z.email(fr.profile.errors.emailFormat)]),
});

type IdentityForm = z.infer<typeof identitySchema>;

function IdentitySection({ user }: { user: SessionUser }) {
  const { api, setSession } = useAuth();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<IdentityForm>({
    resolver: zodResolver(identitySchema),
    defaultValues: {
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email ?? '',
    },
  });

  const submit = handleSubmit(async (values) => {
    try {
      const session = await api.updateProfile({
        first_name: values.first_name.trim(),
        last_name: values.last_name.trim(),
        email: values.email === '' ? null : values.email.trim(),
      });

      setSession(session);
      reset({
        first_name: session.user.first_name,
        last_name: session.user.last_name,
        email: session.user.email ?? '',
      });
      toast.success(fr.profile.saved);
    } catch (error) {
      if (
        !showValidationErrors(error, setError, {
          first_name: 'first_name',
          last_name: 'last_name',
          email: 'email',
        })
      ) {
        toastUnexpectedError(error);
      }
    }
  });

  return (
    <Section title={fr.profile.identity}>
      <form noValidate onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <FormField
          id="first_name"
          label={fr.profile.firstName}
          required
          error={errors.first_name?.message}
        >
          <Input
            {...fieldProps('first_name', errors.first_name?.message)}
            autoComplete="given-name"
            {...register('first_name')}
          />
        </FormField>

        <FormField
          id="last_name"
          label={fr.profile.lastName}
          required
          error={errors.last_name?.message}
        >
          <Input
            {...fieldProps('last_name', errors.last_name?.message)}
            autoComplete="family-name"
            {...register('last_name')}
          />
        </FormField>

        <FormField
          id="email"
          label={fr.profile.email}
          className="md:col-span-2"
          error={errors.email?.message}
        >
          <Input
            {...fieldProps('email', errors.email?.message)}
            type="email"
            autoComplete="email"
            {...register('email')}
          />
        </FormField>

        <div className="md:col-span-2 md:text-right">
          <Button type="submit" loading={isSubmitting} className="w-full md:w-auto">
            {fr.profile.save}
          </Button>
        </div>
      </form>
    </Section>
  );
}

const phoneSchema = z.object({
  // Format vérifié par le serveur (E.164, 05-BACKEND-SCHEMA) : aucun motif de numéro en dur ici.
  phone: z.string().trim().min(1, fr.profile.errors.phoneRequired),
});

const phoneCodeSchema = z.object({ code: codeField() });

type PhoneForm = z.infer<typeof phoneSchema>;
type PhoneCodeForm = z.infer<typeof phoneCodeSchema>;

function PhoneSection({ user }: { user: SessionUser }) {
  const { api, setSession } = useAuth();
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const phoneForm = useForm<PhoneForm>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: '' },
  });

  const codeForm = useForm<PhoneCodeForm>({
    resolver: zodResolver(phoneCodeSchema),
    defaultValues: { code: '' },
  });

  const requestCode = phoneForm.handleSubmit(async ({ phone }) => {
    try {
      await api.requestPhoneCode(phone.trim());
      setFailure(null);
      setPendingPhone(phone.trim());
    } catch (error) {
      if (!showValidationErrors(error, phoneForm.setError, { phone: 'phone' })) {
        toastUnexpectedError(error);
      }
    }
  });

  const cancel = () => {
    setPendingPhone(null);
    codeForm.reset();
  };

  const confirm = codeForm.handleSubmit(async ({ code }) => {
    if (pendingPhone === null) {
      return;
    }

    try {
      setSession(await api.confirmPhone({ phone: pendingPhone, code }));
      setFailure(null);
      cancel();
      phoneForm.reset();
      toast.success(fr.profile.phoneChanged);
    } catch (error) {
      if (showValidationErrors(error, codeForm.setError, { code: 'code' })) {
        return;
      }

      if (!(error instanceof ApiBusinessError)) {
        toastUnexpectedError(error);

        return;
      }

      const left = attemptsLeftOf(error);

      if (error.code === 'wrong_code' && left !== null) {
        setFailure(fr.profile.errors.wrongCode(String(left)));

        return;
      }

      // Code expiré ou essais épuisés : on redemande un code (02-TRD §6.1, 3 essais).
      setFailure(fr.profile.errors.expiredCode);
      cancel();
    }
  });

  return (
    <Section title={fr.profile.phone}>
      <p className="text-body">
        <span className="text-muted">{fr.profile.currentPhone} </span>
        <span className="font-semibold text-ink">{user.phone}</span>
      </p>

      {pendingPhone === null ? (
        <form noValidate onSubmit={requestCode} className="mt-4 grid gap-4">
          <FormField
            id="phone"
            label={fr.profile.newPhone}
            required
            hint={fr.profile.phoneHelp}
            error={phoneForm.formState.errors.phone?.message}
          >
            <Input
              {...fieldProps('phone', phoneForm.formState.errors.phone?.message, true)}
              type="tel"
              autoComplete="tel"
              {...phoneForm.register('phone')}
            />
          </FormField>

          <div className="md:text-right">
            <Button
              type="submit"
              variant="secondary"
              loading={phoneForm.formState.isSubmitting}
              className="w-full md:w-auto"
            >
              {fr.profile.requestPhoneCode}
            </Button>
          </div>
        </form>
      ) : (
        <form noValidate onSubmit={confirm} className="mt-4 grid gap-4">
          <Banner tone="success">{fr.profile.phoneCodeSent(pendingPhone)}</Banner>

          <FormField
            id="phone_code"
            label={fr.profile.phoneCode(String(config.codeLength))}
            required
            error={codeForm.formState.errors.code?.message}
          >
            <Input
              {...fieldProps('phone_code', codeForm.formState.errors.code?.message)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={config.codeLength}
              {...codeForm.register('code')}
            />
          </FormField>

          <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
            <Button type="button" variant="secondary" onClick={cancel}>
              {fr.common.cancel}
            </Button>
            <Button type="submit" loading={codeForm.formState.isSubmitting}>
              {fr.profile.confirmPhone}
            </Button>
          </div>
        </form>
      )}

      {failure !== null ? (
        <Banner tone="danger" role="alert" className="mt-4">
          {failure}
        </Banner>
      ) : null}
    </Section>
  );
}

const passwordSchema = z
  .object({
    current_password: z.string().min(1, fr.profile.errors.currentPasswordRequired),
    password: passwordField(),
    confirmation: z.string(),
  })
  .refine(confirmationMatches, confirmationError);

type PasswordForm = z.infer<typeof passwordSchema>;

function PasswordSection() {
  const { api } = useAuth();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current_password: '', password: '', confirmation: '' },
  });

  const submit = handleSubmit(async (values) => {
    try {
      await api.changePassword({
        current_password: values.current_password,
        password: values.password,
      });
      reset();
      toast.success(fr.profile.passwordChanged);
    } catch (error) {
      if (
        showValidationErrors(error, setError, {
          current_password: 'current_password',
          password: 'password',
        })
      ) {
        return;
      }

      if (error instanceof ApiBusinessError && error.code === 'wrong_password') {
        setError(
          'current_password',
          { type: 'server', message: fr.profile.errors.wrongPassword },
          { shouldFocus: true },
        );

        return;
      }

      toastUnexpectedError(error);
    }
  });

  return (
    <Section title={fr.profile.passwordSection}>
      <form noValidate onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <FormField
          id="current_password"
          label={fr.profile.currentPassword}
          required
          className="md:col-span-2"
          error={errors.current_password?.message}
        >
          <Input
            {...fieldProps('current_password', errors.current_password?.message)}
            type="password"
            autoComplete="current-password"
            {...register('current_password')}
          />
        </FormField>

        <FormField
          id="new_password"
          label={fr.profile.newPassword}
          required
          hint={fr.validation.passwordHint(String(config.passwordMinLength))}
          error={errors.password?.message}
        >
          <Input
            {...fieldProps('new_password', errors.password?.message, true)}
            type="password"
            autoComplete="new-password"
            {...register('password')}
          />
        </FormField>

        <FormField
          id="password_confirmation"
          label={fr.profile.confirmPassword}
          required
          error={errors.confirmation?.message}
        >
          <Input
            {...fieldProps('password_confirmation', errors.confirmation?.message)}
            type="password"
            autoComplete="new-password"
            {...register('confirmation')}
          />
        </FormField>

        <div className="md:col-span-2 md:text-right">
          <Button type="submit" loading={isSubmitting} className="w-full md:w-auto">
            {fr.profile.changePassword}
          </Button>
        </div>
      </form>
    </Section>
  );
}

type PreferencesForm = { sms: boolean; whatsapp: boolean };

function PreferencesSection({ user }: { user: SessionUser }) {
  const { api, setSession } = useAuth();
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<PreferencesForm>({ defaultValues: user.notification_preferences });

  const submit = handleSubmit(async (values) => {
    try {
      const session = await api.updatePreferences(values);

      setSession(session);
      reset(session.user.notification_preferences);
      toast.success(fr.profile.preferencesSaved);
    } catch (error) {
      toastUnexpectedError(error);
    }
  });

  return (
    <Section title={fr.profile.preferences}>
      <form noValidate onSubmit={submit} className="grid gap-3">
        <p className="text-note text-muted">{fr.profile.preferencesHelp}</p>

        <CheckboxField id="pref_sms" label={fr.profile.smsOptIn}>
          <Checkbox id="pref_sms" {...register('sms')} />
        </CheckboxField>

        <CheckboxField id="pref_whatsapp" label={fr.profile.whatsappOptIn}>
          <Checkbox id="pref_whatsapp" {...register('whatsapp')} />
        </CheckboxField>

        <div className="md:text-right">
          <Button type="submit" loading={isSubmitting} className="w-full md:w-auto">
            {fr.profile.savePreferences}
          </Button>
        </div>
      </form>
    </Section>
  );
}

export function ProfilePage() {
  const { session, activeMembership } = useAuth();

  // La coque (AnySpaceLayout) n'affiche cet écran qu'avec une session et un espace ouverts.
  if (session === null || activeMembership === null) {
    return null;
  }

  const { user } = session;

  return (
    <>
      <PageHeader title={fr.profile.title} />

      <div className="grid max-w-3xl gap-5">
        <IdentitySection user={user} />
        <PhoneSection user={user} />
        <PasswordSection />
        {spaceKindOf(activeMembership) === 'member' ? <PreferencesSection user={user} /> : null}
      </div>
    </>
  );
}
