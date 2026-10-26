import { withApiErrors } from '@/lib/api-errors';
import { config } from '@/lib/config';
import { fileNameOf } from '@/lib/download';
import { toFormData } from '@/lib/form-data';
import { http } from '@/lib/http';
import { pageOf, type ApiItem, type ApiPage, type ListPage } from '@/lib/query';
import type { components } from '@/types/api';

/*
 * Import d'un portefeuille existant par le gérant (F-IMP-02, RG-IMP-01 à 03), sur
 * `/api/v1/cga/imports` : modèle Excel, analyse sans écriture (aperçu ligne à ligne, ancien n° →
 * n° CGA Connect), dépôt traité en file « imports » (202), avancement et rapport.
 */
export type ImportBatch = components['schemas']['ImportBatchResource'];

/** Ligne de l'aperçu (`PreviewMemberImport`). */
export type ImportPreviewRow = {
  row: number;
  label: string | null;
  legacy_number: string | null;
  portfolio: string | null;
  status: string;
  status_label: string;
  messages: string[];
  number: string | null;
};

export type ImportPreview = {
  total: number;
  importable: number;
  drafts: number;
  rejected: number;
  proposed_start_number: number;
  start_number: number;
  rows: ImportPreviewRow[];
};

/** Fichier attendu : classeur Excel (le serveur le vérifie par son contenu). */
export const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type MemberImportsApi = {
  template: () => Promise<{ blob: Blob; fileName: string }>;
  /** 422 `start_number` (numéro déjà attribué) ou `file` (fichier illisible) ; 409 `abbreviation_missing`. */
  preview: (file: File, startNumber: number | null) => Promise<ImportPreview>;
  start: (file: File, startNumber: number | null) => Promise<ImportBatch>;
  get: (id: string) => Promise<ImportBatch>;
  list: () => Promise<ListPage<ImportBatch>>;
};

function upload(file: File, startNumber: number | null): FormData {
  return toFormData({ file, start_number: startNumber ?? undefined });
}

export const httpMemberImportsApi: MemberImportsApi = {
  async template() {
    const response = await http.get<Blob>('/cga/imports/members/template', {
      responseType: 'blob',
    });

    return {
      blob: response.data,
      fileName: fileNameOf(response.headers['content-disposition'], 'modele-adherents.xlsx'),
    };
  },

  preview: (file, startNumber) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<ImportPreview>>(
        '/cga/imports/members/preview',
        upload(file, startNumber),
      );

      return data.data;
    }),

  start: (file, startNumber) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<ImportBatch>>(
        '/cga/imports/members',
        upload(file, startNumber),
      );

      return data.data;
    }),

  async get(id) {
    const { data } = await http.get<ApiItem<ImportBatch>>(`/cga/imports/${encodeURIComponent(id)}`);

    return data.data;
  },

  async list() {
    const { data } = await http.get<ApiPage<ImportBatch>>('/cga/imports', {
      params: { sort: '-created_at', per_page: config.pageSize },
    });

    return pageOf(data);
  },
};
