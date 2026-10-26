import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Users } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { permissionKeys, permissionsApi } from '@/features/permissions/api/permissions-api';
import { platformRoutes } from '@/features/platform/lib/routes';
import { fr } from '@/lib/i18n/fr';

/*
 * Onglet « Utilisateurs CNCGA » de `/plateforme` (03-APPFLOW §6) : les utilisateurs du CNCGA et
 * leurs profils ; chacun ouvre ses habilitations (même « nuage » que côté CGA, RG-ROLE-07).
 */
const labels = fr.platform.users;

export function NetworkUsersList() {
  const query = useQuery({
    queryKey: permissionKeys.networkUsers,
    queryFn: () => permissionsApi.networkUsers(),
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
    body = <EmptyState icon={Users}>{labels.empty}</EmptyState>;
  } else {
    body = (
      <ul aria-label={labels.caption} className="divide-y divide-border">
        {query.data.map((agent) => (
          <li key={agent.id}>
            <Link
              to={platformRoutes.user(agent.id)}
              className="flex flex-wrap items-center justify-between gap-3 py-3 hover:bg-primary-soft/40"
            >
              <span className="grid gap-0.5">
                <span className="font-semibold">{agent.name}</span>
                <span className="text-note text-muted">
                  {agent.roles.map((role) => role.role_label).join(', ')}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <StatusBadge domain="access" status={agent.status} />
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
        <CardTitle>{labels.caption}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-note text-muted">{labels.intro}</p>
        {body}
      </CardContent>
    </Card>
  );
}
