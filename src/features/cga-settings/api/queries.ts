import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cgaApi,
  type AgentFilters,
  type AgentScope,
  type CgaProfile,
  type ProfileScope,
} from './cga-api';

/** Clés React Query de la fiche du centre et des agents. */
export const cgaKeys = {
  profile: ['cga', 'profile'] as const,
  /** Fiche du CNCGA (étape 6.9). */
  networkProfile: ['network', 'profile'] as const,
  agents: (scope: AgentScope) => ['agents', scope] as const,
  agentList: (scope: AgentScope, filters: AgentFilters) => ['agents', scope, filters] as const,
};

/** Fiche du centre ; `enabled` faux pour un agent sans le droit de la voir. */
function profileKey(scope: ProfileScope) {
  return scope === 'network' ? cgaKeys.networkProfile : cgaKeys.profile;
}

export function useCgaProfile(enabled = true, scope: ProfileScope = 'cga') {
  return useQuery({
    queryKey: profileKey(scope),
    queryFn: () => cgaApi.profile(scope),
    enabled,
    retry: false,
  });
}

/** Après une écriture : la fiche prend la réponse du serveur (bandeaux compris). */
export function useCgaProfileSaved(scope: ProfileScope = 'cga'): (profile: CgaProfile) => void {
  const queryClient = useQueryClient();

  return (profile) => {
    queryClient.setQueryData(profileKey(scope), profile);
  };
}

export function useAgents(scope: AgentScope, filters: AgentFilters) {
  return useQuery({
    queryKey: cgaKeys.agentList(scope, filters),
    queryFn: () => cgaApi.agents(scope, filters),
  });
}
