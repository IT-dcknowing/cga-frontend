import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { PublicLayout } from '@/components/layout/public-layout';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { fieldProps } from '@/components/ui/field-props';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { attemptsLeftOf } from '@/features/auth/api/auth-api';
import { authRoutes } from '@/features/auth/lib/destination';
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
 * `/mot-de-passe-oublie` (F-AUTH-03, 03-APPFLOW §2) en deux temps : demande du code, puis code à
 * 6 chiffres et nouveau mot de passe. L'étape 1 répond toujours la même chose, que le compte existe
 * ou non (A07). Le compte des essais et l'expiration du code appartiennent au serveur (02-TRD §6.1).
 */
const identifierSchema = z.object({
  identifier: z.string().trim().min(1, fr.forgottenPassword.errors.identifierRequired),
});

const resetSchema = z
  .object({
    code: codeField(),
    password: passwordField(),
    confirmation: z.string(),
  })
  .refine(confirmationMatches, confirmationError);

type IdentifierForm = z.infer<typeof identifierSchema>;
type ResetForm = z.infer<typeof resetSchema>;

export function ForgottenPasswordPage() {
  const { api } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const identifierForm = useForm<IdentifierForm>({
    resolver: zodResolver(identifierSchema),
    defaultValues: { identifier: '' },
  });

  const resetForm = useForm<ResetForm>({
    resolver: zodResolver(resetSchema),
    defaultValues: { code: '', password: '', confirmation: '' },
  });

  const requestCode = identifierForm.handleSubmit(async (values) => {
    try {
      await api.requestPasswordCode(values.identifier);
      setFailure(null);
      setIdentifier(values.identifier);
    } catch (error) {
      if (!showValidationErrors(error, identifierForm.setError, { identifier: 'identifier' })) {
        toastUnexpectedError(error);
      }
    }
  });

  const resetPassword = resetForm.handleSubmit(async (values) => {
    if (identifier === null) {
      return;
    }

    try {
      await api.resetPassword({ identifier, code: values.code, password: values.password });
      toast.success(fr.forgottenPassword.done);
      await navigate(authRoutes.login, { replace: true });
    } catch (error) {
      if (showValidationErrors(error, resetForm.setError, { code: 'code', password: 'password' })) {
        return;
      }

      if (!(error instanceof ApiBusinessError)) {
        toastUnexpectedError(error);

        return;
      }

      const left = attemptsLeftOf(error);

      if (error.code === 'wrong_code' && left !== null) {
        setFailure(fr.forgottenPassword.errors.wrongCode(String(left)));

        return;
      }

      // 3 échecs ou code expiré : retour à la première étape (03-APPFLOW §2).
      setFailure(fr.forgottenPassword.errors.expired);
      setIdentifier(null);
      resetForm.reset();
    }
  });

  return (
    <PublicLayout title={fr.forgottenPassword.title}>
      {identifier === null ? (
        <form noValidate onSubmit={requestCode} className="grid gap-4">
          <p className="text-note text-muted">
            {fr.forgottenPassword.step1(String(config.codeLength))}
          </p>

          <FormField
            id="identifier"
            label={fr.forgottenPassword.identifier}
            required
            error={identifierForm.formState.errors.identifier?.message}
          >
            <Input
              {...fieldProps('identifier', identifierForm.formState.errors.identifier?.message)}
              autoComplete="username"
              {...identifierForm.register('identifier')}
            />
          </FormField>

          <Button type="submit" loading={identifierForm.formState.isSubmitting} className="w-full">
            {fr.forgottenPassword.requestCode}
          </Button>
        </form>
      ) : (
        <form noValidate onSubmit={resetPassword} className="grid gap-4">
          <Banner tone="success">{fr.forgottenPassword.codeSent}</Banner>
          <p className="text-note text-muted">{fr.forgottenPassword.step2}</p>

          <FormField
            id="code"
            label={fr.forgottenPassword.code(String(config.codeLength))}
            required
            error={resetForm.formState.errors.code?.message}
          >
            <Input
              {...fieldProps('code', resetForm.formState.errors.code?.message)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={config.codeLength}
              {...resetForm.register('code')}
            />
          </FormField>

          <FormField
            id="password"
            label={fr.forgottenPassword.newPassword}
            required
            hint={fr.validation.passwordHint(String(config.passwordMinLength))}
            error={resetForm.formState.errors.password?.message}
          >
            <Input
              {...fieldProps('password', resetForm.formState.errors.password?.message, true)}
              type="password"
              autoComplete="new-password"
              {...resetForm.register('password')}
            />
          </FormField>

          <FormField
            id="confirmation"
            label={fr.forgottenPassword.confirmPassword}
            required
            error={resetForm.formState.errors.confirmation?.message}
          >
            <Input
              {...fieldProps('confirmation', resetForm.formState.errors.confirmation?.message)}
              type="password"
              autoComplete="new-password"
              {...resetForm.register('confirmation')}
            />
          </FormField>

          <Button type="submit" loading={resetForm.formState.isSubmitting} className="w-full">
            {fr.forgottenPassword.submit}
          </Button>
        </form>
      )}

      {failure !== null ? (
        <Banner tone="danger" role="alert" className="mt-4">
          {failure}
        </Banner>
      ) : null}

      <p className="mt-4 text-center">
        <Button variant="link" asChild>
          <Link to={authRoutes.login}>{fr.errorScreens.backToLogin}</Link>
        </Button>
      </p>
    </PublicLayout>
  );
}
