import { withApiErrors } from '@/lib/api-errors';
import { toFormData } from '@/lib/form-data';
import { http } from '@/lib/http';
import type { ApiItem } from '@/lib/query';

/*
 * Catalogue national des obligations (RG-DATA-04, étape 4.9, `/network/obligation-catalog`) : versions
 * chargées (nombre d'obligations, provisoire ou validée, en vigueur) ; import d'une nouvelle version
 * en deux temps — aperçu des effets sur les dossiers de tous les centres (en nombres), puis
 * application du fichier analysé ; validation d'une version provisoire (RG-DATA-01).
 */
export type CatalogVersion = {
  version: string;
  count: number;
  provisional_count: number;
  status: 'provisional' | 'validated';
  in_force: boolean;
  loaded_at: string | null;
  validated_at: string | null;
};

export type CatalogImpact = {
  file_id: string;
  version: string;
  types: {
    added: string[];
    removed: string[];
    changed: { code: string; fields: string[] }[];
    unchanged: number;
  };
  members: {
    suggested: number;
    withdrawn: number;
    ended: number;
    rescheduled: number;
    members: number;
    organizations: number;
  };
};

export type CatalogApplied = {
  version: string;
  loaded: number;
  suggested: number;
  withdrawn: number;
  ended: number;
  rescheduled: number;
};

export const catalogKeys = {
  versions: ['obligation-catalog', 'versions'] as const,
};

export const catalogApi = {
  async versions(): Promise<CatalogVersion[]> {
    const { data } = await http.get<{ data: CatalogVersion[] }>('/network/obligation-catalog');

    return data.data;
  },

  /** Aperçu : le fichier est contrôlé et gardé ; rien n'est encore appliqué. */
  preview: (file: File) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<CatalogImpact>>(
        '/network/obligation-catalog/preview',
        toFormData({ file }),
      );

      return data.data;
    }),

  apply: (fileId: string) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<CatalogApplied>>(
        '/network/obligation-catalog/apply',
        { file_id: fileId },
      );

      return data.data;
    }),

  validate: (version: string) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<{ version: string; validated: number }>>(
        `/network/obligation-catalog/${encodeURIComponent(version)}/validate`,
      );

      return data.data;
    }),
};
