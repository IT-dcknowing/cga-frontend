import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { UnsavedChangesGuard } from '@/components/shared/unsaved-changes-guard';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { fieldProps } from '@/components/ui/field-props';
import { FormField } from '@/components/ui/form-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  permissionKeys,
  permissionsApi,
  type UserPermissions,
  type UserScope,
} from '@/features/permissions/api/permissions-api';
import { PermissionModules } from '@/features/permissions/components/permission-modules';
import { ApiBusinessError } from '@/lib/api-errors';
import { formatNumber } from '@/lib/format';
import { showValidationErrors } from '@/lib/form-errors';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';
import { isScreenError, retryUnlessScreenError } from '@/lib/query';

/*
 * Habilitations d'un utilisateur, le « nuage » (RG-ROLE-07, 03-APPFLOW §4.3 et §6) : droits regroupés
 * par module, pré-cochés selon le profil ; chaque case différente du profil porte « ajusté pour cet
 * utilisateur » et un lien « Revenir au profil » ; droits verrouillés grisés. Le serveur enregistre
 * les écarts au profil et les trace (motif facultatif) ; le menu suit les droits effectifs de `/me`.
 */
const labels = fr.permissions.user;

function grantedOf(cloud: UserPermissions): Set<string> {
  return new Set(
    cloud.modules.flatMap((module) =>
      module.permissions.filter((permission) => permission.granted).map((item) => item.code),
    ),
  );
}

function CloudEditor({
  scope,
  cloud,
  back,
}: {
  scope: UserScope;
  cloud: UserPermissions;
  back: string;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(() => grantedOf(cloud));
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const initial = grantedOf(cloud);
  const dirty = selected.size !== initial.size || [...selected].some((code) => !initial.has(code));

  function change(codes: string[], granted: boolean) {
    setSelected((current) => {
      const next = new Set(current);

      for (const code of codes) {
        if (granted) {
          next.add(code);
        } else {
          next.delete(code);
        }
      }

      return next;
    });
  }

  async function saved(updated: UserPermissions, message: string) {
    queryClient.setQueryData(permissionKeys.user(scope, cloud.user.id), updated);
    setSelected(grantedOf(updated));
    setReason('');
    toast.success(message);
  }

  async function save() {
    setBusy(true);
    setConflict(null);
    setReasonError(undefined);

    try {
      await saved(
        await permissionsApi.saveUser(
          scope,
          cloud.user.id,
          [...selected],
          reason.trim() === '' ? null : reason.trim(),
        ),
        labels.saved(cloud.user.name),
      );
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        toast.error(error.message);
      } else if (
        !showValidationErrors(
          error,
          (_field, fieldError) => {
            setReasonError(fieldError.message);
          },
          { reason: 'reason' },
        )
      ) {
        toastUnexpectedError(error);
      }
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    setConflict(null);

    try {
      await saved(await permissionsApi.resetUser(scope, cloud.user.id), labels.resetDone);
      setResetting(false);
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        setConflict(error.message);
      } else {
        toastUnexpectedError(error);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <UnsavedChangesGuard when={dirty && !busy} />
      <PageHeader
        title={labels.title(cloud.user.name)}
        actions={
          <Button variant="secondary" asChild>
            <Link to={back}>
              <ArrowLeft aria-hidden="true" />
              {labels.back}
            </Link>
          </Button>
        }
      />
      <div className="grid gap-4">
        <p className="text-note text-muted">
          {labels.profiles(cloud.roles.map((role) => role.role_label).join(', '))} ·{' '}
          {labels.adjustedCount(formatNumber(cloud.adjusted_count))}
        </p>
        <p className="text-note text-muted">{labels.intro}</p>

        <PermissionModules
          modules={cloud.modules}
          selected={selected}
          onChange={change}
          marker={(permission, granted) =>
            granted !== permission.profile ? labels.adjusted : null
          }
          rowAction={(permission) =>
            !permission.locked && selected.has(permission.code) !== permission.profile ? (
              <Button
                variant="link"
                size="sm"
                aria-label={labels.backToProfileLabel(permission.label)}
                onClick={() => {
                  change([permission.code], permission.profile);
                }}
              >
                {labels.backToProfile}
              </Button>
            ) : null
          }
        />

        <FormField id="cloud-reason" label={labels.reason} error={reasonError}>
          <Textarea
            {...fieldProps('cloud-reason', reasonError)}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
        </FormField>

        <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
          {cloud.adjusted_count > 0 ? (
            <Button
              variant="secondary"
              onClick={() => {
                setConflict(null);
                setResetting(true);
              }}
            >
              <RotateCcw aria-hidden="true" />
              {labels.resetAll}
            </Button>
          ) : null}
          <Button loading={busy && !resetting} disabled={!dirty} onClick={() => void save()}>
            {labels.save}
          </Button>
        </div>
      </div>

      {resetting ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setResetting(false);
            }
          }}
          title={labels.resetAll}
          description={cloud.user.name}
          submitLabel={fr.permissions.resetSubmit}
          submitting={busy}
          onSubmit={(event) => {
            event.preventDefault();
            void reset();
          }}
          conflict={conflict}
          effects={labels.resetEffects}
        >
          {null}
        </ConfirmDialog>
      ) : null}
    </>
  );
}

export function UserPermissionsPage({ scope, back }: { scope: UserScope; back: string }) {
  const { id = '' } = useParams();
  const query = useQuery({
    queryKey: permissionKeys.user(scope, id),
    queryFn: () => permissionsApi.user(scope, id),
    // Agent inconnu, ou gérant (ses droits ne s'ajustent pas) : écran commun (03-APPFLOW §7).
    throwOnError: isScreenError,
    retry: retryUnlessScreenError,
  });

  if (query.isPending) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (query.isError) {
    return (
      <Banner
        tone="danger"
        action={
          <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
            {fr.common.retry}
          </Button>
        }
      >
        {fr.permissions.loadError}
      </Banner>
    );
  }

  return <CloudEditor key={id} scope={scope} cloud={query.data} back={back} />;
}
