import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { PublicLayout } from '@/components/layout/public-layout';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { LoginError, type LoginFailure } from '@/features/auth/api/auth-api';
import {
  authRoutes,
  loginDestination,
  RETURN_PARAM,
  safeReturnPath,
} from '@/features/auth/lib/destination';
import { useAuth } from '@/features/auth/session/auth-context';
import { fr } from '@/lib/i18n/fr';
import { toastUnexpectedError } from '@/lib/http-error-toast';

/*
 * Écran `/connexion` (F-AUTH-01, 03-APPFLOW §2). Livré avant le backend à la demande du Directeur :
 * les appels passent par le bouchon `VITE_API_STUB` tant que l'étape 0.9 n'est pas faite.
 * L'écran ne décide d'aucune règle : le blocage après 5 échecs et le refus d'un accès inactif
 * viennent du serveur (02-TRD §6.1), il ne fait que traduire la réponse en message.
 */
const loginSchema = z.object({
  identifier: z.string().trim().min(1, fr.auth.login.required.identifier),
  password: z.string().min(1, fr.auth.login.required.password),
});

type LoginForm = z.infer<typeof loginSchema>;

/** Échecs affichés sous le formulaire ; l'imprévu passe par un message éphémère (03-APPFLOW §7). */
type ShownFailure = Exclude<LoginFailure, 'unexpected'>;

export function LoginPage() {
  const { api, setSession } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [failure, setFailure] = useState<ShownFailure | null>(null);

  const returnParam = searchParams.get(RETURN_PARAM);
  const sessionExpired = returnParam !== null;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });

  const submit = handleSubmit(async (values) => {
    setFailure(null);

    try {
      const session = await api.login(values);

      setSession(session);
      // Plusieurs espaces : le sélecteur d'abord. Le retour demandé (03-APPFLOW §7) ne vaut que
      // pour une connexion qui mène directement dans un espace.
      const destination = loginDestination(session);
      const back = safeReturnPath(returnParam);

      await navigate(back !== null && destination !== authRoutes.chooseSpace ? back : destination, {
        replace: true,
      });
    } catch (error) {
      const reason = error instanceof LoginError ? error.reason : 'unexpected';

      if (reason === 'unexpected') {
        toastUnexpectedError(error);

        return;
      }

      setFailure(reason);
    }
  });

  return (
    <PublicLayout title={fr.auth.login.title}>
      {sessionExpired ? (
        <Banner tone="warning" className="mb-4">
          {fr.auth.login.sessionExpired}
        </Banner>
      ) : null}

      <form noValidate onSubmit={submit} className="grid gap-4">
        <FormField
          id="identifier"
          label={fr.auth.login.identifier}
          required
          error={errors.identifier?.message}
        >
          <Input
            id="identifier"
            type="text"
            autoComplete="username"
            aria-invalid={errors.identifier !== undefined}
            aria-describedby={errors.identifier !== undefined ? 'identifier-error' : undefined}
            {...register('identifier')}
          />
        </FormField>

        <FormField
          id="password"
          label={fr.auth.login.password}
          required
          error={errors.password?.message}
        >
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={errors.password !== undefined}
            aria-describedby={errors.password !== undefined ? 'password-error' : undefined}
            {...register('password')}
          />
        </FormField>

        <Button type="submit" loading={isSubmitting} className="w-full">
          {fr.auth.login.submit}
        </Button>
      </form>

      {failure !== null ? (
        <Banner tone="danger" role="alert" className="mt-4">
          {fr.auth.login.failures[failure]}
        </Banner>
      ) : null}

      <p className="mt-4 text-center">
        <Button variant="link" asChild>
          <Link to={authRoutes.forgottenPassword}>{fr.auth.login.forgotten}</Link>
        </Button>
      </p>
    </PublicLayout>
  );
}
