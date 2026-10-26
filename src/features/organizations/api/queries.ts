import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { isScreenError, retryUnlessScreenError } from '@/lib/query';
import { organizationsApi } from './index';
import type { Organization, OrganizationFilters } from './organizations-api';

export const organizationKeys = {
  all: ['organizations'] as const,
  lists: ['organizations', 'list'] as const,
  list: (filters: OrganizationFilters) => ['organizations', 'list', filters] as const,
  detail: (id: string) => ['organizations', 'detail', id] as const,
  regionalDirectorates: ['referentials', 'regional-directorates'] as const,
};

export function useOrganizations(filters: OrganizationFilters) {
  return useQuery({
    queryKey: organizationKeys.list(filters),
    queryFn: () => organizationsApi.list(filters),
    // Changer de page ou de filtre garde les lignes affichées jusqu'à la réponse.
    placeholderData: keepPreviousData,
    throwOnError: isScreenError,
    retry: retryUnlessScreenError,
  });
}

export function useOrganization(id: string) {
  return useQuery({
    queryKey: organizationKeys.detail(id),
    queryFn: () => organizationsApi.get(id),
    throwOnError: isScreenError,
    retry: retryUnlessScreenError,
  });
}

/** Directions régionales actives, pour le filtre du registre : un référentiel lu une fois. */
export function useRegionalDirectorates() {
  return useQuery({
    queryKey: organizationKeys.regionalDirectorates,
    queryFn: () => organizationsApi.regionalDirectorates(),
    staleTime: Infinity,
  });
}

/** Après une écriture : la fiche prend la réponse du serveur, les listes se rechargent. */
export function useOrganizationSaved(): (organization: Organization) => void {
  const queryClient = useQueryClient();

  return (organization) => {
    queryClient.setQueryData(organizationKeys.detail(organization.id), organization);
    void queryClient.invalidateQueries({ queryKey: organizationKeys.lists });
  };
}
