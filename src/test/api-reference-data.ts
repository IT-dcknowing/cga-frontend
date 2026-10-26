import type {
  ImportPreview,
  ReferenceDataset,
} from '@/features/reference-data/api/reference-data-api';
import { formInput } from './api-member-records';
import { forbidden, invalid, ok, type ApiReply, type Input } from './api-replies';

/*
 * Données de référence simulées, d'après `ReferenceDataController` : état des jeux, modèle Excel,
 * aperçu d'un fichier (mode « update » ou « replace »), application du fichier analysé, validation.
 * Droit : `referentials.manage` (`organizations.manage` pour le registre des CGA).
 */
type Context = { allows: (permission: string) => boolean };

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function dataset(id: string, label: string, count: number, provisional: number): ReferenceDataset {
  return {
    dataset: id,
    label,
    count,
    provisional_count: provisional,
    status: provisional > 0 ? 'provisional' : 'validated',
    can: { manage: true },
  };
}

/** Aperçu renvoyé pour tout fichier : un ajout, une modification, une ligne rejetée. */
function plan(id: string, mode: string): ImportPreview {
  return {
    dataset: id,
    mode: mode as ImportPreview['mode'],
    summary: {
      creates: 1,
      updates: 1,
      unchanged: 3,
      deletes: 0,
      deactivates: mode === 'replace' ? 1 : 0,
      kept: 0,
      rejected: 1,
    },
    creates: [{ row: 2, key: 'DR-SPD', label: 'DR San Pedro' }],
    updates: [
      {
        row: 3,
        key: 'DEMO-ABJ',
        label: 'DR Abidjan (démonstration)',
        changes: { name: { before: 'DR Abidjan (démonstration)', after: 'DR Abidjan Nord' } },
      },
    ],
    removals:
      mode === 'replace'
        ? [
            {
              id: '01dr0000000000000000000002',
              label: 'DR Bouaké (démonstration)',
              action: 'deactivate',
              action_label: 'Désactivée (utilisée)',
            },
          ]
        : [],
    rejected: [{ row: 5, label: 'Ligne sans code', messages: ['Le code est obligatoire.'] }],
    warnings: [{ row: 4, label: 'DR Korhogo', messages: ['Nom proche d’une DR existante.'] }],
  };
}

export function createReferenceDataBackend() {
  let datasets: ReferenceDataset[] = [
    dataset('cgas', 'Registre des CGA', 111, 4),
    dataset('regional-directorates', 'Directions régionales', 2, 2),
    dataset('tax-offices', 'Centres des impôts', 2, 0),
  ];
  const files = new Map<string, string>();
  let nextId = 0;

  function manage(id: string, context: Context): boolean {
    return context.allows(id === 'cgas' ? 'organizations.manage' : 'referentials.manage');
  }

  /** Routes `/reference-data…` ; `undefined` pour une autre route. */
  function route(
    method: string,
    path: string,
    body: unknown,
    context: Context,
  ): ApiReply | undefined {
    if (path === '/reference-data' && method === 'GET') {
      return context.allows('referentials.manage') || context.allows('organizations.manage')
        ? {
            status: 200,
            data: {
              data: datasets,
              meta: {
                provisional_count: datasets.reduce((sum, item) => sum + item.provisional_count, 0),
              },
            },
          }
        : forbidden;
    }

    const match = /^\/reference-data\/([a-z-]+)\/(template|preview|apply|validate)$/.exec(path);

    if (match === null) {
      return undefined;
    }

    const [, id, action] = match;

    if (!manage(id, context)) {
      return forbidden;
    }

    const input: Input = formInput(body);

    if (action === 'template' && method === 'GET') {
      return {
        status: 200,
        data: new Blob(['modele'], { type: XLSX }),
        headers: { 'content-disposition': `attachment; filename="modele-${id}.xlsx"` },
      };
    }

    if (action === 'preview' && method === 'POST') {
      const file = input.file;

      if (!(file instanceof File) || !file.name.endsWith('.xlsx')) {
        return invalid({ file: 'Le fichier doit être un classeur Excel (.xlsx).' });
      }

      const fileId = `01fil9${String(++nextId).padStart(20, '0')}`;

      files.set(fileId, id);

      return ok({ file_id: fileId, ...plan(id, String(input.mode)) });
    }

    if (action === 'apply' && method === 'POST') {
      if (files.get(String(input.file_id)) !== id) {
        return invalid({ file_id: 'Le fichier analysé est introuvable.' });
      }

      datasets = datasets.map((item) =>
        item.dataset === id ? { ...item, count: item.count + 1 } : item,
      );

      return ok(plan(id, String(input.mode)));
    }

    if (action === 'validate' && method === 'POST') {
      const current = datasets.find((item) => item.dataset === id);

      datasets = datasets.map((item) =>
        item.dataset === id ? { ...item, provisional_count: 0, status: 'validated' } : item,
      );

      return ok({ dataset: id, validated: current?.provisional_count ?? 0 });
    }

    return undefined;
  }

  return { route };
}
