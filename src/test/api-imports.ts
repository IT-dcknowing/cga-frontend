import type { ImportBatch, ImportPreview } from '@/features/members/api/imports-api';
import { forbidden, invalid, notFound, ok, paginated, type ApiReply } from './api-replies';

/*
 * Import de portefeuille simulé, d'après `MemberImportController` et `ImportController` : modèle
 * Excel, aperçu sans écriture (ancien n° → n° CGA Connect à partir du numéro de départ), dépôt en
 * file (202) puis avancement : « en cours » à la première lecture, « terminé » avec rapport ensuite.
 */
type Context = { allows: (permission: string) => boolean };

/** Dernier numéro d'adhésion déjà attribué dans le centre de démonstration. */
const LAST_NUMBER = 2;

function batch(overrides: Partial<ImportBatch>): ImportBatch {
  return {
    id: '01imp000000000000000000001',
    type: 'members',
    type_label: 'Adhérents',
    status: 'done',
    status_label: 'Terminé',
    file_name: 'portefeuille-2025.xlsx',
    total_rows: 12,
    processed_rows: 12,
    imported_rows: 10,
    draft_rows: 1,
    rejected_rows: 1,
    report: {
      id: '01fil-rapport-1',
      name: 'rapport-import.xlsx',
      url: 'https://files.test/rapport-1.xlsx',
    },
    created_by: { id: '01usr00000000000000000002', name: 'Koffi Gérant' },
    created_at: '2026-09-15T10:00:00Z',
    finished_at: '2026-09-15T10:01:00Z',
    ...overrides,
  };
}

/** Aperçu de l'analyse : une ligne importée, une à compléter, une rejetée (RG-IMP-02). */
export function demoPreview(start: number): ImportPreview {
  return {
    total: 3,
    importable: 1,
    drafts: 1,
    rejected: 1,
    proposed_start_number: LAST_NUMBER + 1,
    start_number: start,
    rows: [
      {
        row: 2,
        label: 'PRESSING KONAN',
        legacy_number: 'DCK-OLD-41',
        portfolio: 'cga',
        status: 'imported',
        status_label: 'Importée',
        messages: [],
        number: `2026-DCK-${String(start).padStart(4, '0')}`,
      },
      {
        row: 3,
        label: 'SALON AMANI',
        legacy_number: 'DCK-OLD-42',
        portfolio: 'cabinet',
        status: 'draft',
        status_label: 'À compléter',
        messages: ['Date de signature du contrat CGA non renseignée.'],
        number: null,
      },
      {
        row: 4,
        label: null,
        legacy_number: null,
        portfolio: null,
        status: 'rejected',
        status_label: 'Rejetée',
        messages: ['NCC mal formé : 12AB.'],
        number: null,
      },
    ],
  };
}

export function createImportsBackend() {
  let batches: ImportBatch[] = [batch({})];
  const reads = new Map<string, number>();

  function file(body: unknown): File | null {
    const value = body instanceof FormData ? body.get('file') : null;

    return value instanceof File ? value : null;
  }

  function startNumber(body: unknown): { start: number } | ApiReply {
    const raw = body instanceof FormData ? body.get('start_number') : null;

    if (raw === null || raw === '') {
      return { start: LAST_NUMBER + 1 };
    }

    const start = Number(raw);

    return start <= LAST_NUMBER
      ? invalid({
          start_number: `Ce numéro est déjà attribué : partez de ${String(LAST_NUMBER + 1)} au moins.`,
        })
      : { start };
  }

  function route(
    method: string,
    path: string,
    body: unknown,
    context: Context,
  ): ApiReply | undefined {
    if (!path.startsWith('/cga/imports')) {
      return undefined;
    }

    if (!context.allows('members.import')) {
      return forbidden;
    }

    if (method === 'GET' && path === '/cga/imports/members/template') {
      return {
        status: 200,
        data: new Blob(['modele'], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        headers: { 'content-disposition': 'attachment; filename=modele-adherents-dck.xlsx' },
      };
    }

    if (
      method === 'POST' &&
      (path === '/cga/imports/members/preview' || path === '/cga/imports/members')
    ) {
      const upload = file(body);

      if (upload === null) {
        return invalid({ file: 'Le champ fichier est obligatoire.' });
      }

      const start = startNumber(body);

      if (typeof start === 'string' || !('start' in start)) {
        return start;
      }

      if (path.endsWith('/preview')) {
        return ok(demoPreview(start.start));
      }

      const queued = batch({
        id: `01imp9${String(batches.length + 1).padStart(20, '0')}`,
        status: 'queued',
        status_label: 'En attente',
        file_name: upload.name,
        total_rows: 3,
        processed_rows: 0,
        imported_rows: 0,
        draft_rows: 0,
        rejected_rows: 0,
        report: null,
        created_at: '2026-10-26T09:00:00Z',
        finished_at: null,
      });

      batches = [queued, ...batches];

      return { status: 202, data: { data: queued } };
    }

    if (method === 'GET' && path === '/cga/imports') {
      return paginated(batches, new URLSearchParams());
    }

    const match = /^\/cga\/imports\/([^/]+)$/.exec(path);

    if (method === 'GET' && match !== null) {
      const found = batches.find((candidate) => candidate.id === match[1]);

      if (found === undefined) {
        return notFound;
      }

      // Première lecture : en cours ; ensuite : terminé, rapport disponible.
      const count = (reads.get(found.id) ?? 0) + 1;

      reads.set(found.id, count);

      const progressed =
        found.status === 'done' || found.status === 'failed'
          ? found
          : count === 1
            ? { ...found, status: 'processing', status_label: 'En cours', processed_rows: 1 }
            : {
                ...found,
                status: 'done',
                status_label: 'Terminé',
                processed_rows: 3,
                imported_rows: 1,
                draft_rows: 1,
                rejected_rows: 1,
                report: {
                  id: '01fil-rapport-2',
                  name: 'rapport-import.xlsx',
                  url: 'https://files.test/rapport-2.xlsx',
                },
                finished_at: '2026-10-26T09:01:00Z',
              };

      batches = batches.map((candidate) => (candidate.id === found.id ? progressed : candidate));

      return ok(progressed);
    }

    return undefined;
  }

  return {
    route,
    /** Imports simulés, dans leur état courant. */
    batches: () => batches,
  };
}
