import type {
  Brochure,
  CgaDashboard,
  CgaPosition,
  NationalStatistics,
  NetworkDashboard,
  StatPeriod,
  Variation,
} from '@/features/statistics/api/statistics-api';
import { forbidden, invalid, notFound, ok, type ApiReply } from './api-replies';

/*
 * Tableaux de bord et statistiques simulés, d'après `NetworkStatisticsController`,
 * `CgaStatisticsController` et leurs ressources (PRD M15) : indicateurs selon les droits, alertes,
 * cotisations par mois, statistiques nationales (macro, graphiques, Directions régionales, communes),
 * position du CGA, plaquettes, « Actualiser » (202). La période est rendue telle que demandée.
 */
type Context = {
  allows: (permission: string) => boolean;
  organizationId: string | null;
  memberId: string | null;
};

const CNCGA = '01org0000000000000000cncga';

export const demoDirectorateIds = {
  abidjan1: '01drg000000000000000000001',
  abidjan2: '01drg000000000000000000002',
  bouake: '01drg000000000000000000003',
  korhogo: '01drg000000000000000000004',
  unmapped: '01drg000000000000000000005',
};

/** Période rendue par le serveur pour la demande (`StatPeriod::toArray`), au 10/03/2026. */
function periodOf(query: URLSearchParams): StatPeriod {
  const type = (query.get('period') ?? 'month') as StatPeriod['type'];
  const ranges: Record<string, [string, string]> = {
    day: ['2026-03-10', '2026-03-10'],
    month: ['2026-03-01', '2026-03-31'],
    year: ['2026-01-01', '2026-12-31'],
    custom: [query.get('from') ?? '', query.get('to') ?? ''],
  };
  const [from, to] = ranges[type] ?? ranges.month;

  return {
    type,
    from,
    to,
    previous: { from: from.replace('2026', '2025'), to: to.replace('2026', '2025') },
  };
}

function variation(value: number, previous: number): Variation {
  const change = value - previous;

  return {
    value,
    previous,
    change,
    change_pct: previous === 0 ? null : Math.round((1000 * change) / previous) / 10,
  };
}

const COVERAGE = {
  subscribed_cgas: 18,
  total_cgas: 111,
  label: 'Sur la base de 18 CGA abonnés sur 111.',
};

function alert(code: string, count: number, label: string) {
  return { code, count, label };
}

export function createStatisticsBackend() {
  const brochures: Brochure[] = [
    {
      id: '01brc000000000000000000001',
      title: 'Plaquette statistique 2025',
      year: 2025,
      status: 'valid',
      status_label: 'Valide',
      issued_at: '2026-01-15T10:00:00+00:00',
      pdf: { name: 'plaquette-2025.pdf', size_bytes: 120_000, url: '/fichiers/plaquette-2025.pdf' },
    },
  ];
  const refreshes: string[] = [];

  function networkDashboard(query: URLSearchParams, context: Context): NetworkDashboard {
    const indicators: NetworkDashboard['indicators'] = { cgas: COVERAGE };

    if (context.allows('dues.view')) {
      indicators.dues = {
        collected: variation(4_800_000, 4_000_000),
        year: 2026,
        expected: 10_000_000,
        collected_year_to_date: 5_800_000,
        rate: 0.58,
      };
    }
    if (context.allows('network_concerns.view')) {
      indicators.concerns = { open: 3, submitted: variation(5, 4) };
    }
    if (context.allows('statistics.national.view')) {
      indicators.members = variation(1_240, 1_100);
    }

    return {
      period: periodOf(query),
      coverage: COVERAGE,
      computed_at: '2026-03-10T06:00:00+00:00',
      indicators,
      dues_chart: context.allows('dues.view')
        ? [
            {
              month: '2026-01-01',
              collected: 1_800_000,
              collected_year_to_date: 1_800_000,
              expected: 10_000_000,
            },
            {
              month: '2026-02-01',
              collected: 2_100_000,
              collected_year_to_date: 3_900_000,
              expected: 10_000_000,
            },
            {
              month: '2026-03-01',
              collected: 1_900_000,
              collected_year_to_date: 5_800_000,
              expected: 10_000_000,
            },
          ]
        : null,
      alerts: [
        alert('reports_late', 2, '2 rapports en retard'),
        alert('dues_unpaid', 1, '1 CGA impayé'),
        alert('agreements_expiring', 0, 'Aucun agrément à échéance'),
        alert('trainings_almost_full', 1, '1 formation presque complète'),
      ],
    };
  }

  function cgaDashboard(query: URLSearchParams): CgaDashboard {
    return {
      period: periodOf(query),
      computed_at: null,
      indicators: {
        members: {
          active: variation(142, 130),
          new: variation(6, 4),
          radiations: variation(1, 2),
          to_complete: 2,
        },
        fees: {
          due: variation(4_800_000, 4_100_000),
          paid: variation(3_900_000, 3_500_000),
          unpaid: 900_000,
        },
        upcoming: { days: 15, count: 5, members: 4 },
        report: {
          id: '01rpt000000000000000000001',
          year: 2026,
          quarter: 1,
          status: 'draft',
          completeness: 79,
        },
      },
      alerts: [
        alert('rsi_active', 3, '3 adhérents reclassés au réel'),
        alert('members_to_complete', 2, '2 dossiers à compléter'),
        alert('pieces_pending', 0, 'Aucune pièce en attente'),
        alert('concerns_unanswered', 1, '1 préoccupation sans réponse'),
      ],
    };
  }

  function national(query: URLSearchParams): NationalStatistics {
    return {
      period: periodOf(query),
      coverage: COVERAGE,
      computed_at: '2026-03-10T06:00:00+00:00',
      macro: {
        year: 2026,
        tax_revenue: 15_300_000_000,
        member_revenue: 120_000_000_000,
        budget_contribution: { available: true, rate: 0.012, label: null },
        gdp_contribution: {
          available: false,
          rate: null,
          label: 'Non disponible — saisir les références 2026',
        },
      },
      tax_revenue: { total: 14_000_000, by_nature: { Patente: 5_000_000, TVA: 9_000_000 } },
      by_cga: [
        {
          id: '01cga000000000000000000001',
          name: 'DC-KNOWING CGA',
          sigle: 'DCK',
          tax_paid_total: 9_000_000,
          active_members: 142,
          declared_revenue: 80_000_000,
        },
        {
          id: '01cga000000000000000000002',
          name: 'CGA Démo Bouaké',
          sigle: null,
          tax_paid_total: 5_000_000,
          active_members: 60,
          declared_revenue: 40_000_000,
        },
      ],
      by_regime: { RME: 210, TEE: 118, RSI: 74 },
      by_sector: [
        { id: '01sec000000000000000000001', name: 'Commerce général', members: 150 },
        { id: null, name: null, members: 12 },
      ],
      by_directorate: [
        {
          id: demoDirectorateIds.abidjan1,
          code: 'DRAN-1',
          name: 'Abidjan Nord 1',
          geo_key: 'abidjan',
          cgas: 6,
          members: 300,
          revenue: 5_000_000_000,
        },
        {
          id: demoDirectorateIds.abidjan2,
          code: 'DRAN-2',
          name: 'Abidjan Nord 2',
          geo_key: 'abidjan',
          cgas: 6,
          members: 280,
          revenue: 3_200_000_000,
        },
        {
          id: demoDirectorateIds.bouake,
          code: 'DR-BKE',
          name: 'Bouaké',
          geo_key: 'bouake',
          cgas: 5,
          members: 120,
          revenue: 2_100_000_000,
        },
        {
          id: demoDirectorateIds.korhogo,
          code: 'DR-KHO',
          name: 'Korhogo',
          geo_key: 'korhogo',
          cgas: 2,
          members: 40,
          revenue: 900_000_000,
        },
        {
          id: demoDirectorateIds.unmapped,
          code: 'DR-MAN',
          name: 'Man',
          geo_key: null,
          cgas: 1,
          members: 10,
          revenue: 100_000_000,
        },
        { id: null, code: null, name: null, geo_key: null, cgas: 1, members: 5, revenue: 0 },
      ],
    };
  }

  function position(query: URLSearchParams, sufficient: boolean): CgaPosition {
    return {
      period: periodOf(query),
      computed_at: '2026-03-10T06:00:00+00:00',
      network: {
        contributors: sufficient ? 18 : 3,
        minimum: 5,
        sufficient,
        label: sufficient ? null : 'Données insuffisantes',
      },
      indicators: {
        active_members: { own: 142, network_average: sufficient ? 96.4 : null },
        new_members: { own: 6, network_average: sufficient ? 4 : null },
        radiations: { own: 1, network_average: sufficient ? 2 : null },
        fees_paid: { own: 3_900_000, network_average: sufficient ? 2_800_000 : null },
        tax_paid_total: { own: 9_000_000, network_average: sufficient ? 6_500_000 : null },
        declared_revenue: { own: 80_000_000, network_average: sufficient ? 52_000_000 : null },
        concerns_avg_response_hours: { own: 30.4, network_average: sufficient ? 41 : null },
      },
    };
  }

  let sufficient = true;

  return {
    brochures: () => brochures,
    refreshes: () => refreshes,
    /** Moyenne du réseau masquée (sous le minimum de contributeurs). */
    hideAverages() {
      sufficient = false;
    },
    route(
      method: string,
      path: string,
      query: URLSearchParams,
      body: unknown,
      context: Context,
    ): ApiReply | undefined {
      const network = context.organizationId === CNCGA && context.memberId === null;
      const cga =
        context.organizationId !== CNCGA &&
        context.organizationId !== null &&
        context.memberId === null;

      switch (`${method} ${path}`) {
        case 'GET /network/dashboard':
          return network ? ok(networkDashboard(query, context)) : forbidden;
        case 'GET /cga/dashboard':
          return cga ? ok(cgaDashboard(query)) : forbidden;
        case 'GET /network/statistics':
          return network && context.allows('statistics.national.view')
            ? ok(national(query))
            : forbidden;
        case 'GET /cga/statistics':
          return cga && context.allows('statistics.position.view')
            ? ok(position(query, sufficient))
            : forbidden;
        case 'POST /network/statistics/refresh':
        case 'POST /cga/statistics/refresh':
          refreshes.push(path);

          return { status: 202, data: { data: { scope: network ? 'network' : 'organization' } } };
        case 'GET /network/statistics/brochures':
          return network ? ok(brochures) : forbidden;
        case 'POST /network/statistics/brochures': {
          const year = Number((body as { year?: unknown } | null)?.year);

          if (!(year >= 2020 && year <= 2026)) {
            return invalid({ year: 'L’année doit être comprise entre 2020 et 2026.' });
          }
          const brochure: Brochure = {
            id: `01brc00000000000000000000${String(brochures.length + 1)}`,
            title: `Plaquette statistique ${String(year)}`,
            year,
            status: 'generating',
            status_label: 'En production',
            issued_at: null,
            pdf: null,
          };

          brochures.unshift(brochure);

          return ok(brochure, 202);
        }
        default:
          break;
      }

      const communes = /^\/network\/statistics\/map\/([^/]+)$/.exec(path);

      if (communes !== null && method === 'GET') {
        const directorate = national(query).by_directorate.find((item) => item.id === communes[1]);

        if (!network || directorate === undefined || directorate.id === null) {
          return notFound;
        }

        return ok({
          period: periodOf(query),
          directorate: {
            id: directorate.id,
            code: directorate.code,
            name: directorate.name,
            geo_key: directorate.geo_key,
          },
          communes:
            directorate.code === 'DR-BKE'
              ? [
                  { id: '01com000000000000000000001', name: 'Bouaké', members: 110 },
                  { id: '01com000000000000000000002', name: 'Béoumi', members: 10 },
                ]
              : [],
        });
      }

      return undefined;
    },
  };
}
