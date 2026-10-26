import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { isScreenError, retryUnlessScreenError } from '@/lib/query';
import {
  httpMembersApi as membersApi,
  type Member,
  type MemberFilters,
  type Sector,
} from './members-api';

export const memberKeys = {
  all: ['members'] as const,
  lists: ['members', 'list'] as const,
  list: (filters: MemberFilters) => ['members', 'list', filters] as const,
  detail: (id: string) => ['members', 'detail', id] as const,
  pieces: (id: string) => ['members', 'detail', id, 'pieces'] as const,
  accesses: (id: string) => ['members', 'detail', id, 'accesses'] as const,
  history: (id: string, page: number) => ['members', 'detail', id, 'history', page] as const,
  radiationOptions: ['members', 'radiation-options'] as const,
  referrers: ['members', 'referrers'] as const,
  feeSchedule: ['members', 'fee-schedule'] as const,
  taxOffices: ['referentials', 'tax-offices'] as const,
  communes: ['referentials', 'communes'] as const,
  sectors: ['referentials', 'sectors'] as const,
};

/** Honoraires, paiements et documents d'un dossier (étape 3.8), relus avec lui. */
export const dossierKeys = {
  all: (id: string) => ['members', 'detail', id, 'dossier'] as const,
  charges: (id: string) => ['members', 'detail', id, 'dossier', 'charges'] as const,
  payments: (id: string) => ['members', 'detail', id, 'dossier', 'payments'] as const,
  documents: (id: string) => ['members', 'detail', id, 'dossier', 'documents'] as const,
};

export function useMembers(filters: MemberFilters) {
  return useQuery({
    queryKey: memberKeys.list(filters),
    queryFn: () => membersApi.list(filters),
    // Changer de page, d'onglet ou de filtre garde les lignes affichées jusqu'à la réponse.
    placeholderData: keepPreviousData,
    throwOnError: isScreenError,
    retry: retryUnlessScreenError,
  });
}

export function useMember(id: string) {
  return useQuery({
    queryKey: memberKeys.detail(id),
    queryFn: () => membersApi.get(id),
    throwOnError: isScreenError,
    retry: retryUnlessScreenError,
  });
}

export function usePieces(id: string) {
  return useQuery({ queryKey: memberKeys.pieces(id), queryFn: () => membersApi.pieces(id) });
}

export function useAccesses(id: string) {
  return useQuery({ queryKey: memberKeys.accesses(id), queryFn: () => membersApi.accesses(id) });
}

export function useHistory(id: string, page: number) {
  return useQuery({
    queryKey: memberKeys.history(id, page),
    queryFn: () => membersApi.history(id, page),
    placeholderData: keepPreviousData,
  });
}

/** Initiateurs, motifs et issues d'une radiation : un référentiel du serveur, lu une fois. */
export function useRadiationOptions(enabled: boolean) {
  return useQuery({
    queryKey: memberKeys.radiationOptions,
    queryFn: () => membersApi.radiationOptions(),
    staleTime: Infinity,
    enabled,
  });
}

/** Apporteurs du centre (RG-PTF-06) : lus seulement avec le droit de les voir. */
export function useReferrers(enabled: boolean) {
  return useQuery({
    queryKey: memberKeys.referrers,
    queryFn: () => membersApi.referrers(),
    enabled,
  });
}

/** Référentiels des listes de la saisie : lus une fois. */
export function useTaxOffices() {
  return useQuery({
    queryKey: memberKeys.taxOffices,
    queryFn: () => membersApi.taxOffices(),
    staleTime: Infinity,
  });
}

export function useCommunes() {
  return useQuery({
    queryKey: memberKeys.communes,
    queryFn: () => membersApi.communes(),
    staleTime: Infinity,
  });
}

export function useSectors() {
  return useQuery({
    queryKey: memberKeys.sectors,
    queryFn: () => membersApi.sectors(),
    staleTime: Infinity,
  });
}

/** Barème du centre, pour pré-remplir droit d'adhésion et honoraires (F-PAY-01). */
export function useFeeSchedule() {
  return useQuery({
    queryKey: memberKeys.feeSchedule,
    queryFn: () => membersApi.feeSchedule(),
    retry: false,
  });
}

/** Secteur proposé (RG-REF-01) : ajouté à la liste sans la relire. */
export function useSectorProposed(): (sector: Sector) => void {
  const queryClient = useQueryClient();

  return (sector) => {
    queryClient.setQueryData<Sector[]>(memberKeys.sectors, (current = []) =>
      [...current, sector].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    );
  };
}

/** Après une écriture : le dossier prend la réponse du serveur, les listes se rechargent. */
export function useMemberSaved(): (member: Member) => void {
  const queryClient = useQueryClient();

  return (member) => {
    queryClient.setQueryData(memberKeys.detail(member.id), member);
    void queryClient.invalidateQueries({ queryKey: memberKeys.lists });
    // Pièces, accès et historique du dossier suivent l'écriture.
    void queryClient.invalidateQueries({
      predicate: ({ queryKey }) =>
        queryKey[0] === 'members' &&
        queryKey[1] === 'detail' &&
        queryKey[2] === member.id &&
        queryKey.length > 3,
    });
  };
}
