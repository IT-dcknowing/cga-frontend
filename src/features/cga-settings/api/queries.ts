import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cgaApi, type AgentFilters, type AgentScope, type CgaProfile } from './cga-api';

/** Clés React Query de la fiche du centre et des agents. */
export const cgaKeys = {
  profile: ['cga', 'profile'] as const,
  agents: (scope: AgentScope) => ['agents', scope] as const,
  agentList: (scope: AgentScope, filters: AgentFilters) => ['agents', scope, filters] as const,
};

/** Fiche du centre ; `enabled` faux pour un agent sans le droit de la voir. */
export function useCgaProfile(enabled = true) {
  return useQuery({
    queryKey: cgaKeys.profile,
    queryFn: cgaApi.profile,
    enabled,
    retry: false,
  });
}

/** Après une écriture : la fiche prend la réponse du serveur (bandeaux compris). */
export function useCgaProfileSaved(): (profile: CgaProfile) => void {
  const queryClient = useQueryClient();

  return (profile) => {
    queryClient.setQueryData(cgaKeys.profile, profile);
  };
}

export function useAgents(scope: AgentScope, filters: AgentFilters) {
  return useQuery({
    queryKey: cgaKeys.agentList(scope, filters),
    queryFn: () => cgaApi.agents(scope, filters),
  });
}
