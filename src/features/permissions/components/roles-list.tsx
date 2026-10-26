import { useQuery } from '@tanstack/react-query';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/shared/empty-state';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  permissionKeys,
  permissionsApi,
  type PermissionLevel,
} from '@/features/permissions/api/permissions-api';
import { formatNumber } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';

/*
 * Rôles d'un niveau (03-APPFLOW §4.3 « Droits par rôle », §6 « Droits du réseau ») : libellé, nombre
 * d'utilisateurs, droits accordés, badge « personnalisé » ; chaque rôle ouvre son interface dédiée.
 */
const labels = fr.permissions;

export function RolesList({
  level,
  detailPath,
}: {
  level: PermissionLevel;
  detailPath: (role: string) => string;
}) {
  const query = useQuery({
    queryKey: permissionKeys.roles(level),
    queryFn: () => permissionsApi.roles(level),
  });

  let body;

  if (query.isPending) {
    body = <Skeleton className="h-24 w-full" />;
  } else if (query.isError) {
    body = (
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
  } else if (query.data.length === 0) {
    body = <EmptyState icon={ShieldCheck}>{labels.noRoles}</EmptyState>;
  } else {
    body = (
      <ul aria-label={labels.rolesCaption} className="divide-y divide-border">
        {query.data.map((role) => (
          <li key={role.role}>
            <Link
              to={detailPath(role.role)}
              className="flex flex-wrap items-center justify-between gap-3 py-3 hover:bg-primary-soft/40"
            >
              <span className="grid gap-0.5">
                <span className="font-semibold">{role.label}</span>
                <span className="text-note text-muted">
                  {labels.usersCount(formatNumber(role.users_count))} ·{' '}
                  {labels.grantedCount(
                    formatNumber(role.granted_count),
                    formatNumber(role.permissions_count),
                  )}
                </span>
              </span>
              <span className="flex items-center gap-2">
                {role.customized ? (
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-note text-accent-text">
                    {labels.customized}
                  </span>
                ) : null}
                <ChevronRight className="size-4 text-muted" aria-hidden="true" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{level === 'cga' ? labels.cgaTitle : labels.networkTitle}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-note text-muted">
          {level === 'cga' ? labels.cgaIntro : labels.networkIntro}
        </p>
        {body}
      </CardContent>
    </Card>
  );
}
