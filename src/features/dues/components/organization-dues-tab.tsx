import { useQuery } from '@tanstack/react-query';
import { Banner } from '@/components/ui/banner';
import { Card, CardContent } from '@/components/ui/card';
import { duesApi, duesKeys } from '@/features/dues/api/dues-api';
import { DuesListSkeleton, NetworkDuesList } from '@/features/dues/components/network-dues-list';
import { fr } from '@/lib/i18n/fr';

/*
 * Onglet « Cotisations » de `/cncga/membres/:id` (F-ORG-04, 03-APPFLOW §3.2) : les cotisations du CGA,
 * année par année, avec les mêmes actions que `/cncga/cotisations`.
 */
export function OrganizationDuesTab({ organizationId }: { organizationId: string }) {
  const query = useQuery({
    queryKey: duesKeys.ofCga(organizationId),
    queryFn: () => duesApi.network({ cga: organizationId }),
  });

  return (
    <Card>
      <CardContent>
        {query.isPending ? (
          <DuesListSkeleton />
        ) : query.isError ? (
          <Banner tone="danger" role="alert">
            {fr.dues.loadError}
          </Banner>
        ) : (
          <NetworkDuesList dues={query.data.dues} showCga={false} />
        )}
      </CardContent>
    </Card>
  );
}
