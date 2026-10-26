import { useQuery } from '@tanstack/react-query';
import { config } from '@/lib/config';
import { http } from '@/lib/http';
import type { ApiPage } from '@/lib/query';
import type { components } from '@/types/api';

/*
 * Référentiels nationaux (F-REF-01 à 04, `/api/v1/referentials/…`) : lus dans tout espace pour les
 * listes de saisie, gérés par le CNCGA. Les valeurs inactives ne sont pas proposées à la saisie.
 */
export type RegionalDirectorate = components['schemas']['RegionalDirectorateResource'];

export type TaxOffice = components['schemas']['TaxOfficeResource'];

export type Commune = components['schemas']['CommuneResource'];

async function all<T>(path: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const { data } = await http.get<ApiPage<T>>(path, {
    params: { sort: 'name', per_page: config.pageSizeMax, ...params },
  });

  return data.data;
}

export const referentialsApi = {
  regionalDirectorates: () =>
    all<RegionalDirectorate>('/referentials/regional-directorates', { 'filter[active]': 1 }),
  taxOffices: () => all<TaxOffice>('/referentials/tax-offices', { 'filter[active]': 1 }),
  // Les communes n'ont pas d'état actif (`ListCommunesRequest`).
  communes: () => all<Commune>('/referentials/communes'),
};

export const referentialKeys = {
  all: ['referentials'] as const,
  regionalDirectorates: ['referentials', 'regional-directorates', 'active'] as const,
  taxOffices: ['referentials', 'tax-offices', 'active'] as const,
  communes: ['referentials', 'communes', 'active'] as const,
};

/** Listes de saisie : lues une fois par session. */
export function useActiveDirectorates() {
  return useQuery({
    queryKey: referentialKeys.regionalDirectorates,
    queryFn: referentialsApi.regionalDirectorates,
    staleTime: Infinity,
  });
}

export function useActiveTaxOffices() {
  return useQuery({
    queryKey: referentialKeys.taxOffices,
    queryFn: referentialsApi.taxOffices,
    staleTime: Infinity,
  });
}

export function useActiveCommunes() {
  return useQuery({
    queryKey: referentialKeys.communes,
    queryFn: referentialsApi.communes,
    staleTime: Infinity,
  });
}
