import type { ExportRecord, ExportStatus } from '@/features/exports/api/exports-api';
import { forbidden, invalid, notFound, ok, type ApiReply, type Input } from './api-replies';

/*
 * Exports Excel simulés (F-EXP-01, RG-SEC-06, décision 0017), d'après `ExportController`,
 * `StoreExportRequest`, `ExportType::permissionIn` et `ExportResource` : `exports.run` et le droit de la
 * liste exigés (403), liste de l'espace (422), export créé « en attente » (202), avancement relu par
 * `GET …/exports/{id}` (en cours, puis prêt ou en échec), exports de la seule personne qui les a
 * demandés (403 pour une autre, 404 inconnu).
 */
type Space = 'network' | 'cga';

type Context = {
  allows: (permission: string) => boolean;
  membershipId: string | null;
};

/** Droit de chaque liste par espace (`ExportType::permissionIn`). */
const LISTS: Record<Space, Record<string, string>> = {
  cga: {
    members: 'members.view',
    concerns: 'concerns.reply',
    obligations: 'obligations.manage',
    training_registrations: 'trainings.cga.manage',
  },
  network: {
    training_registrations: 'trainings.network.manage',
    network_concerns: 'network_concerns.view',
    dues: 'dues.view',
    statistics: 'statistics.national.view',
  },
};

const LABELS: Record<string, string> = {
  members: 'Adhérents',
  concerns: 'Préoccupations',
  network_concerns: 'Demandes des CGA',
  training_registrations: 'Inscrits aux formations',
  obligations: 'Échéances',
  dues: 'Cotisations',
  statistics: 'Statistiques nationales',
};

const STATUS_LABELS: Record<ExportStatus, string> = {
  queued: 'En attente',
  processing: 'En cours',
  done: 'Prêt',
  failed: 'En échec',
};

/** Lignes du fichier prêt. */
export const EXPORT_ROWS = 42;

type Stored = { record: ExportRecord; membershipId: string; space: Space; reads: number };

function lastDayOf(month: string): string {
  const [year, index] = month.split('-').map(Number);

  return `${month}-${String(new Date(Date.UTC(year, index, 0)).getUTCDate()).padStart(2, '0')}`;
}

/** Période enregistrée (`StatPeriod`) : mois et année entiers, ou les deux dates. */
function periodOf(body: Input): ExportRecord['period'] {
  const date = typeof body.date === 'string' ? body.date : '';

  switch (body.period) {
    case 'month':
      return { type: 'month', from: date, to: lastDayOf(date.slice(0, 7)) };
    case 'year':
      return { type: 'year', from: `${date.slice(0, 4)}-01-01`, to: `${date.slice(0, 4)}-12-31` };
    case 'custom':
      return { type: 'custom', from: String(body.from), to: String(body.to) };
    default:
      return null;
  }
}

function withStatus(record: ExportRecord, status: ExportStatus): ExportRecord {
  const done = status === 'done';

  return {
    ...record,
    status,
    status_label: STATUS_LABELS[status],
    rows_count: done ? EXPORT_ROWS : 0,
    finished_at: done || status === 'failed' ? '2026-03-10T18:00:30+00:00' : null,
    file: done
      ? {
          name: `${record.type}-20260310-1800.xlsx`,
          size_bytes: 18_432,
          url: `https://api.test/api/v1/files/${record.id}/download?signature=test`,
        }
      : null,
  };
}

/**
 * `readsBeforeEnd` : relectures « en cours » avant la fin ; `outcome` : fin de l'export.
 */
export function createExportsBackend({
  readsBeforeEnd = 0,
  outcome = 'done',
}: { readsBeforeEnd?: number; outcome?: 'done' | 'failed' } = {}) {
  const stored: Stored[] = [];
  let sequence = 0;

  function create(space: Space, body: Input, context: Context): ApiReply {
    const type = typeof body.type === 'string' ? body.type : '';

    if (!context.allows('exports.run')) {
      return forbidden;
    }
    if (!(type in LISTS[space])) {
      return invalid({ type: 'La liste choisie est invalide.' });
    }
    if (!context.allows(LISTS[space][type])) {
      return forbidden;
    }
    sequence += 1;
    const record: ExportRecord = withStatus(
      {
        id: `01exp${String(sequence).padStart(21, '0')}`,
        type: type as ExportRecord['type'],
        type_label: LABELS[type],
        status: 'queued',
        status_label: '',
        period: periodOf(body),
        filters: (body.filters ?? {}) as Record<string, unknown>,
        rows_count: 0,
        requested_at: '2026-03-10T18:00:00+00:00',
        finished_at: null,
        file: null,
      },
      'queued',
    );

    stored.unshift({ record, membershipId: context.membershipId ?? '', space, reads: 0 });

    return ok(record, 202);
  }

  function show(space: Space, id: string, context: Context): ApiReply {
    const found = stored.find((item) => item.record.id === id && item.space === space);

    if (found === undefined) {
      return notFound;
    }
    if (found.membershipId !== context.membershipId) {
      return forbidden;
    }
    if (found.record.status === 'queued' || found.record.status === 'processing') {
      found.reads += 1;
      found.record = withStatus(
        found.record,
        found.reads > readsBeforeEnd ? outcome : 'processing',
      );
    }

    return ok(found.record);
  }

  return {
    /** Exports déjà demandés, du plus récent au plus ancien. */
    records: () => stored.map((item) => item.record),
    /** Ajoute un export d'une personne, dans son état (export d'un autre agent, déjà prêt…). */
    seed(space: Space, membershipId: string, record: ExportRecord) {
      stored.unshift({ record, membershipId, space, reads: 0 });
    },
    route(method: string, path: string, body: Input, context: Context): ApiReply | undefined {
      const match = /^\/(network|cga)\/exports(?:\/([^/]+))?$/.exec(path);

      if (match === null) {
        return undefined;
      }
      const space = match[1] as Space;
      const id = match[2] as string | undefined;

      if (!context.allows('exports.run')) {
        return forbidden;
      }
      if (id === undefined && method === 'POST') {
        return create(space, body, context);
      }
      if (id === undefined && method === 'GET') {
        return ok(
          stored
            .filter((item) => item.space === space && item.membershipId === context.membershipId)
            .map((item) => item.record),
        );
      }
      if (id !== undefined && method === 'GET') {
        return show(space, decodeURIComponent(id), context);
      }

      return undefined;
    },
  };
}
