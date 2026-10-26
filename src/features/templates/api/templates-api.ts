import { withApiErrors } from '@/lib/api-errors';
import { toFormData } from '@/lib/form-data';
import { http } from '@/lib/http';
import type { ApiItem } from '@/lib/query';
import type { components } from '@/types/api';

/*
 * Modèles de documents du réseau (F-ADM-02, RG-DATA-03, `/api/v1/platform/document-templates`) :
 * versions par type, dépôt d'une version (DOCX ou XLSX) avec contrôle des variables, aperçu avec des
 * données de test, activation après validation du CNCGA. Un document émis garde sa version.
 */
export type DocumentTemplate = Omit<
  components['schemas']['DocumentTemplateResource'],
  'check' | 'can'
> & {
  check: { missing: string[]; unknown: string[]; valid: boolean };
  can: { preview: boolean; activate: boolean };
};

export type TemplateUpload = { type: string; version: string; file: File; notes: string | null };

export const templateKeys = { all: ['platform', 'document-templates'] as const };

function templatePath(id: string, action: string): string {
  return `/platform/document-templates/${encodeURIComponent(id)}/${action}`;
}

export const templatesApi = {
  async list(): Promise<DocumentTemplate[]> {
    const { data } = await http.get<{ data: DocumentTemplate[] }>('/platform/document-templates');

    return data.data;
  },

  upload: (input: TemplateUpload) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<DocumentTemplate>>(
        '/platform/document-templates',
        toFormData(input),
      );

      return data.data;
    }),

  /** Aperçu produit avec des données de test : un lien vers le PDF. */
  preview: (id: string) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<{ file: { name: string; url: string } }>>(
        templatePath(id, 'preview'),
      );

      return data.data.file;
    }),

  activate: (id: string, approvedOn: string) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<DocumentTemplate>>(templatePath(id, 'activate'), {
        approved_by_cncga_on: approvedOn,
      });

      return data.data;
    }),
};
