import { withApiErrors } from '@/lib/api-errors';
import { fileNameOf } from '@/lib/download';
import { toFormData } from '@/lib/form-data';
import { http } from '@/lib/http';

/*
 * Données de référence remplaçables sans développement (RG-DATA-01, 02, `/api/v1/reference-data`) :
 * état de chaque jeu (nombre, provisoires), modèle Excel, aperçu d'un fichier (rien n'est écrit),
 * application du fichier déjà analysé, validation des valeurs provisoires.
 */
export type ReferenceDataset = {
  dataset: string;
  label: string;
  count: number;
  provisional_count: number;
  status: string;
  can: { manage: boolean };
};

export const IMPORT_MODES = ['update', 'replace'] as const;

export type ImportMode = (typeof IMPORT_MODES)[number];

export type ImportPreview = {
  dataset: string;
  mode: ImportMode;
  /** Fichier déposé, réutilisé par l'application (aperçu seulement). */
  file_id?: string;
  summary: {
    creates: number;
    updates: number;
    unchanged: number;
    deletes: number;
    deactivates: number;
    kept: number;
    rejected: number;
  };
  creates: { row: number; key: string; label: string }[];
  updates: {
    row: number;
    key: string;
    label: string;
    changes: Record<string, { before: unknown; after: unknown }>;
  }[];
  removals: { id: string; label: string; action: string; action_label: string }[];
  rejected: { row: number; label: string; messages: string[] }[];
  warnings: { row: number; label: string; messages: string[] }[];
};

export const referenceDataKeys = { all: ['reference-data'] as const };

function datasetPath(dataset: string, action: string): string {
  return `/reference-data/${encodeURIComponent(dataset)}/${action}`;
}

export const referenceDataApi = {
  async datasets(): Promise<ReferenceDataset[]> {
    const { data } = await http.get<{ data: ReferenceDataset[] }>('/reference-data');

    return data.data;
  },

  async template(dataset: string): Promise<{ blob: Blob; fileName: string }> {
    const response = await http.get<Blob>(datasetPath(dataset, 'template'), {
      responseType: 'blob',
    });

    return {
      blob: response.data,
      fileName: fileNameOf(response.headers['content-disposition'], `modele-${dataset}.xlsx`),
    };
  },

  preview: (dataset: string, file: File, mode: ImportMode) =>
    withApiErrors(async () => {
      const { data } = await http.post<{ data: ImportPreview }>(
        datasetPath(dataset, 'preview'),
        toFormData({ file, mode }),
      );

      return data.data;
    }),

  apply: (dataset: string, fileId: string, mode: ImportMode) =>
    withApiErrors(async () => {
      const { data } = await http.post<{ data: ImportPreview }>(datasetPath(dataset, 'apply'), {
        file_id: fileId,
        mode,
      });

      return data.data;
    }),

  validate: (dataset: string) =>
    withApiErrors(async () => {
      const { data } = await http.post<{ data: { dataset: string; validated: number } }>(
        datasetPath(dataset, 'validate'),
      );

      return data.data.validated;
    }),
};
