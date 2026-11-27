import { withApiErrors } from '@/lib/api-errors';
import { http } from '@/lib/http';
import { SHOWN_BY_SCREEN, type ApiItem } from '@/lib/query';
import { permissionCodes } from '@/lib/reference/permissions';

/*
 * Exports Excel en tâche de fond (PRD M17, F-EXP-01, RG-SEC-06, étape 8.6), d'après `ExportController`
 * et `ExportResource` (décision 0017) : `POST /{network|cga}/exports` (202, file « imports »),
 * `GET /{network|cga}/exports` (derniers exports de la personne), `GET /{network|cga}/exports/{id}`
 * (avancement et lien de téléchargement temporaire signé). Le serveur fixe le périmètre : il refait le
 * contrôle des droits, des filtres et de la période.
 */
export type ExportSpace = 'network' | 'cga';

export type ExportType =
  | 'members'
  | 'concerns'
  | 'network_concerns'
  | 'training_registrations'
  | 'obligations'
  | 'dues'
  | 'statistics';

export type ExportStatus = 'queued' | 'processing' | 'done' | 'failed';

/** Période demandée (`StatPeriod`) : `date` pour un mois ou une année, `from` / `to` sinon. */
export type ExportPeriodQuery =
  { period: 'month' | 'year'; date: string } | { period: 'custom'; from: string; to: string };

/** Filtres propres à la liste exportée (décision 0017 §2) ; une clé inconnue est refusée (422). */
export type ExportFilters = Record<string, string | string[]>;

export type ExportRequest = {
  type: ExportType;
  period: ExportPeriodQuery | null;
  filters: ExportFilters;
};

export type ExportRecord = {
  id: string;
  type: ExportType;
  type_label: string;
  status: ExportStatus;
  status_label: string;
  period: { type: string; from: string; to: string | null } | null;
  filters: Record<string, unknown>;
  rows_count: number;
  requested_at: string;
  finished_at: string | null;
  /** Fichier prêt, avec son lien de téléchargement temporaire signé ; `null` avant la fin. */
  file: { name: string; size_bytes: number; url: string } | null;
};

/**
 * Droit de la liste exportée dans un espace (`ExportType::permissionIn`), exigé en plus de
 * `exports.run` ; `null` quand la liste n'existe pas dans cet espace.
 */
export function listPermission(space: ExportSpace, type: ExportType): string | null {
  const cncga = permissionCodes.cncga;
  const cga = permissionCodes.cga;
  const rights: Record<ExportSpace, Partial<Record<ExportType, string>>> = {
    network: {
      training_registrations: cncga.trainings,
      network_concerns: cncga.concerns,
      dues: cncga.dues,
      statistics: cncga.statistics,
    },
    cga: {
      members: cga.members,
      concerns: cga.concerns,
      obligations: cga.obligations,
      training_registrations: cga.trainings,
    },
  };

  return rights[space][type] ?? null;
}

/** Un export n'avance plus : fichier prêt ou échec. */
export function isFinished(record: Pick<ExportRecord, 'status'> | undefined): boolean {
  return record?.status === 'done' || record?.status === 'failed';
}

export const exportKeys = {
  all: ['exports'] as const,
  list: (space: ExportSpace) => ['exports', space, 'list'] as const,
  detail: (space: ExportSpace, id: string) => ['exports', space, 'detail', id] as const,
};

function body({ type, period, filters }: ExportRequest) {
  return {
    type,
    ...(period ?? {}),
    ...(Object.keys(filters).length === 0 ? {} : { filters }),
  };
}

export const exportsApi = {
  /** « Exporter » : l'export part en file d'attente (202) ; 403 sans le droit, 422 sur un champ. */
  request: (space: ExportSpace, request: ExportRequest) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<ExportRecord>>(`/${space}/exports`, body(request));

      return data.data;
    }),

  async show(space: ExportSpace, id: string): Promise<ExportRecord> {
    const { data } = await http.get<ApiItem<ExportRecord>>(
      `/${space}/exports/${encodeURIComponent(id)}`,
      { skipErrorToast: SHOWN_BY_SCREEN },
    );

    return data.data;
  },

  async list(space: ExportSpace): Promise<ExportRecord[]> {
    const { data } = await http.get<{ data: ExportRecord[] }>(`/${space}/exports`);

    return data.data;
  },
};
