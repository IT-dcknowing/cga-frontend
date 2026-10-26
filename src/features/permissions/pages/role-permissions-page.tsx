import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import { UnsavedChangesGuard } from '@/components/shared/unsaved-changes-guard';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  permissionKeys,
  permissionsApi,
  type PermissionLevel,
  type RoleImpact,
  type RolePermissions,
} from '@/features/permissions/api/permissions-api';
import { PermissionModules } from '@/features/permissions/components/permission-modules';
import { ApiBusinessError } from '@/lib/api-errors';
import { formatNumber } from '@/lib/format';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';
import { isScreenError, retryUnlessScreenError } from '@/lib/query';

/*
 * Interface dédiée d'un rôle (03-APPFLOW §4.3 `/cga/parametres/droits/:role`, §6
 * `/plateforme/droits/:role`) : droits par module, écarts marqués « personnalisé » (par rapport au
 * réseau pour un CGA, aux valeurs par défaut pour le réseau), verrous grisés, utilisateurs du rôle
 * (CGA). « Enregistrer » montre d'abord l'impact (« n utilisateurs ; +x, −y ») ; « Revenir aux
 * droits du réseau » (ou aux valeurs par défaut) efface la personnalisation du rôle.
 */
const labels = fr.permissions;

function grantedOf(role: RolePermissions): Set<string> {
  return new Set(
    role.modules.flatMap((module) =>
      module.permissions.filter((permission) => permission.granted).map((item) => item.code),
    ),
  );
}

function RoleEditor({
  level,
  role,
  back,
  userPath,
}: {
  level: PermissionLevel;
  role: RolePermissions;
  back: string;
  userPath?: (id: string) => string;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(() => grantedOf(role));
  const [impact, setImpact] = useState<RoleImpact | null>(null);
  const [resetting, setResetting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const initial = grantedOf(role);
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

  async function saved(updated: RolePermissions, message: string) {
    queryClient.setQueryData(permissionKeys.role(level, role.role), updated);
    setSelected(grantedOf(updated));
    toast.success(message);
    await queryClient.invalidateQueries({ queryKey: permissionKeys.roles(level) });
  }

  async function preview() {
    setBusy(true);

    try {
      setConflict(null);
      setImpact(await permissionsApi.impact(level, role.role, [...selected]));
    } catch (error) {
      toastUnexpectedError(error);
    } finally {
      setBusy(false);
    }
  }

  async function run(call: () => Promise<RolePermissions>, message: string, close: () => void) {
    setBusy(true);
    setConflict(null);

    try {
      await saved(await call(), message);
      close();
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

  const customized = role.modules.some((module) =>
    module.permissions.some((permission) => permission.customized),
  );

  return (
    <>
      <UnsavedChangesGuard when={dirty} />
      <PageHeader
        title={role.label}
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
          {labels.usersCount(formatNumber(role.users_count))} ·{' '}
          {level === 'cga' ? labels.referenceCga : labels.referenceNetwork}
        </p>

        <PermissionModules
          modules={role.modules}
          selected={selected}
          onChange={change}
          marker={(permission, granted) =>
            granted !== permission.reference ? labels.customized : null
          }
        />

        <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
          {customized ? (
            <Button
              variant="secondary"
              onClick={() => {
                setConflict(null);
                setResetting(true);
              }}
            >
              <RotateCcw aria-hidden="true" />
              {level === 'cga' ? labels.resetCga : labels.resetNetwork}
            </Button>
          ) : null}
          <Button
            loading={busy && impact === null}
            disabled={!dirty}
            onClick={() => void preview()}
          >
            {labels.save}
          </Button>
        </div>

        {role.users !== null ? (
          <Card>
            <CardHeader>
              <CardTitle>{labels.holders}</CardTitle>
            </CardHeader>
            <CardContent>
              {role.users.length === 0 ? (
                <p className="text-note text-muted">{labels.noHolders}</p>
              ) : (
                <ul aria-label={labels.holders} className="divide-y divide-border">
                  {role.users.map((holder) => (
                    <li key={holder.id} className="flex items-center justify-between gap-3 py-2">
                      {userPath === undefined ? (
                        <span className="font-semibold">{holder.name}</span>
                      ) : (
                        <Link
                          className="font-semibold text-primary underline"
                          to={userPath(holder.id)}
                        >
                          {holder.name}
                        </Link>
                      )}
                      <StatusBadge domain="access" status={holder.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>

      {impact !== null ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setImpact(null);
            }
          }}
          title={labels.impact.title}
          description={labels.impact.summary(
            formatNumber(impact.users_count),
            formatNumber(impact.added.length),
            formatNumber(impact.removed.length),
          )}
          submitLabel={labels.impact.submit}
          submitting={busy}
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              () => permissionsApi.saveRole(level, role.role, [...selected]),
              labels.saved,
              () => {
                setImpact(null);
              },
            );
          }}
          conflict={conflict}
          effects={[
            ...impact.added.map((item) => labels.impact.added(item.label)),
            ...impact.removed.map((item) => labels.impact.removed(item.label)),
          ]}
        >
          {null}
        </ConfirmDialog>
      ) : null}

      {resetting ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setResetting(false);
            }
          }}
          title={level === 'cga' ? labels.resetCga : labels.resetNetwork}
          description={role.label}
          submitLabel={labels.resetSubmit}
          submitting={busy}
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              () => permissionsApi.resetRole(level, role.role),
              labels.resetDone,
              () => {
                setResetting(false);
              },
            );
          }}
          conflict={conflict}
          effects={level === 'cga' ? labels.resetCgaEffects : labels.resetNetworkEffects}
        >
          {null}
        </ConfirmDialog>
      ) : null}
    </>
  );
}

export function RolePermissionsPage({
  level,
  back,
  userPath,
}: {
  level: PermissionLevel;
  back: string;
  userPath?: (id: string) => string;
}) {
  const { role = '' } = useParams();
  const query = useQuery({
    queryKey: permissionKeys.role(level, role),
    queryFn: () => permissionsApi.role(level, role),
    // Rôle inconnu ou hors de ce niveau : écran commun « Élément introuvable » (03-APPFLOW §7).
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
        {labels.loadError}
      </Banner>
    );
  }

  return <RoleEditor key={role} level={level} role={query.data} back={back} userPath={userPath} />;
}
