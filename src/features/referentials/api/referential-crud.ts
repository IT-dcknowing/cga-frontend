import { withApiErrors } from '@/lib/api-errors';
import { config } from '@/lib/config';
import { http } from '@/lib/http';
import type { ApiItem, ApiPage } from '@/lib/query';
import type { components } from '@/types/api';

/*
 * Gestion d'un référentiel national par le CNCGA (F-REF-01 à 04, `/api/v1/referentials/{uri}`) :
 * liste paginée avec recherche, création, modification (PUT, la fiche entière), suppression d'une
 * valeur jamais utilisée (409 `referential_in_use` sinon), fusion d'une valeur dans une autre du même
 * référentiel (RG-DATA-05). Le serveur contrôle chaque saisie et chaque droit.
 */
export type Sector = components['schemas']['SectorResource'];

export type Holiday = components['schemas']['HolidayResource'];

export type NationalReference = components['schemas']['NationalReferenceResource'];

/** Valeur d'un référentiel : un identifiant et le bloc `can` du serveur. */
export type ReferentialItem = {
  id: string | number;
  can: { update: boolean; delete: boolean };
};

export type ReferentialQuery = {
  search: string;
  page: number;
  sort: string;
  params?: Record<string, string | number>;
};

function itemPath(uri: string, id?: string | number, action?: string): string {
  return [`/referentials/${uri}`, id === undefined ? null : encodeURIComponent(String(id)), action]
    .filter((part) => part !== null && part !== undefined)
    .join('/');
}

export const referentialCrud = {
  async list<T>(uri: string, query: ReferentialQuery): Promise<ApiPage<T>> {
    const { data } = await http.get<ApiPage<T>>(itemPath(uri), {
      params: {
        'filter[search]': query.search === '' ? undefined : query.search,
        sort: query.sort,
        page: query.page,
        per_page: config.pageSize,
        ...query.params,
      },
    });

    return data;
  },

  /** Valeurs cibles d'une fusion ou d'une liste de choix : la plus grande page permise. */
  async options<T>(uri: string, search: string, sort: string): Promise<T[]> {
    const { data } = await http.get<ApiPage<T>>(itemPath(uri), {
      params: {
        'filter[search]': search === '' ? undefined : search,
        sort,
        per_page: config.pageSizeMax,
      },
    });

    return data.data;
  },

  save: <T>(uri: string, id: string | number | null, input: Record<string, unknown>) =>
    withApiErrors(async () => {
      const { data } =
        id === null
          ? await http.post<ApiItem<T>>(itemPath(uri), input)
          : await http.put<ApiItem<T>>(itemPath(uri, id), input);

      return data.data;
    }),

  remove: (uri: string, id: string | number) =>
    withApiErrors(async () => {
      await http.delete(itemPath(uri, id));
    }),

  merge: (uri: string, id: string | number, intoId: string | number) =>
    withApiErrors(async () => {
      await http.post(itemPath(uri, id, 'merge'), { into_id: intoId });
    }),
};
