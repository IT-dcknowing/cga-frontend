import type {
  PeopleTaxes,
  QuarterlyReport,
  ReportDetail,
  ReportStates,
  ReportVersion,
} from '@/features/reports/api/reports-api';
import {
  conflict,
  forbidden,
  invalid,
  notFound,
  ok,
  text,
  type ApiReply,
  type Input,
} from './api-replies';
import { formInput } from './api-member-records';
import { demoMemberIds } from './demo-members';

/*
 * Rapports trimestriels simulés, d'après `QuarterlyReportController` (`QuarterlyReportResource`,
 * `QuarterlyReportVersionResource`, états, aperçu) et les règles de 0007 : complétude par section
 * (« Néant » et 0 sont des réponses), génération à 100 % (409 `report_incomplete`), transmission d'un
 * rapport généré, accusé d'un rapport transmis, correction → nouvelle version en brouillon. Droits :
 * `reports.prepare` (préparer, générer), `reports.transmit` (transmettre, accusé, corriger).
 */
type Context = { allows: (permission: string) => boolean };

export const demoReportIds = {
  q3: '01rpt000000000000000002603',
  q2: '01rpt000000000000000002602',
  q1: '01rpt000000000000000002601',
  director: '01cgp00000000000000000dir1',
};

const SECTION_4 = [
  'trainings',
  'assistance_nature',
  'assistance_beneficiaries',
  'assistance_frequency',
  'tools',
  'prevention',
  'smt_established',
  'smt_transmitted',
  'balance_sheets_established',
  'balance_sheets_transmitted',
  'meetings_dgi',
  'meetings_partners',
  'promotion',
];
const SECTION_6 = ['difficulties_internal', 'difficulties_partners', 'suggestions', 'forecasts'];

type Stored = Omit<ReportDetail, 'completeness' | 'completeness_overall' | 'can'> & {
  versions: ReportVersion[];
};

function filledContent(): Record<string, string | number | null> {
  return {
    trainings: 'Deux sessions sur la TEE',
    assistance_nature: 'Tenue de la comptabilité',
    assistance_beneficiaries: '45 adhérents',
    assistance_frequency: 'Mensuelle',
    tools: 'Néant',
    prevention: 'Rappels des échéances',
    smt_established: 3,
    smt_transmitted: 2,
    balance_sheets_established: 1,
    balance_sheets_transmitted: 0,
    meetings_dgi: 'Une réunion avec le CDI',
    meetings_partners: 'Néant',
    promotion: 'Néant',
    difficulties_internal: 'Néant',
    difficulties_partners: 'Retards de paiement',
    suggestions: 'Néant',
    forecasts: 'Campagne d’adhésion',
    needs: null,
  };
}

function versionOf(
  version: number,
  at: string,
  reason: string | null,
  transmitted: string | null,
): ReportVersion {
  const document = (number: string, files: Record<string, string | null>) => ({
    id: `01doc0000000000000000${number.slice(-5)}`,
    number,
    version: 1,
    status: 'valid',
    status_label: 'Valide',
    files,
  });

  return {
    id: `01rpv00000000000000000000${version}`,
    version,
    reason,
    generated_at: at,
    generated_by: 'Koffi Gérant',
    transmitted_at: transmitted,
    documents: {
      report: document(`RPT-DCK-2026-0000${version}`, {
        pdf: `https://files.test/rapport-v${version}.pdf`,
        docx: `https://files.test/rapport-v${version}.docx`,
      }),
      workbook: document(`CLS-DCK-2026-0000${version}`, {
        xlsx: `https://files.test/classeur-v${version}.xlsx`,
      }),
      slip:
        transmitted === null
          ? null
          : document(`BRD-DCK-2026-0000${version}`, {
              pdf: `https://files.test/bordereau-v${version}.pdf`,
            }),
    },
  };
}

function report(overrides: Partial<Stored> & Pick<Stored, 'id' | 'year' | 'quarter'>): Stored {
  const { quarter, year } = overrides;

  return {
    label: `Rapport du ${quarter}e trimestre ${year}`,
    period: { start: `${year}-0${(quarter - 1) * 3 + 1}-01`, end: `${year}-0${quarter * 3}-30` },
    status: 'draft',
    status_label: 'Brouillon',
    deadline: '2026-10-31',
    legal_deadline: '2026-11-15',
    is_late: false,
    is_legally_late: false,
    current_version: 0,
    transmitted_at: null,
    acknowledged_at: null,
    report_date: '2026-10-20',
    regional_directorate_label: 'DR Abidjan Nord',
    content: filledContent(),
    people_taxes: [{ person_id: demoReportIds.director, its: 120000, igr: 0, cnps: 45000 }],
    qualitative_analysis: {
      synthesis: 'Le portefeuille progresse de 3 adhérents.',
      highlights: null,
      outlook: null,
    },
    directors: [
      { id: demoReportIds.director, full_name: 'Koffi Gérant', function_in_cga: 'Gérant' },
    ],
    closing_proposals: {
      smt_established: 4,
      smt_transmitted: 2,
      balance_sheets_established: 1,
      balance_sheets_transmitted: 0,
      fiscal_year: 2025,
    },
    transmission: null,
    acknowledgement: null,
    versions: [],
    ...overrides,
  };
}

export const demoReportStates: ReportStates = {
  period: { year: 2026, quarter: 3, start: '2026-07-01', end: '2026-09-30' },
  sheets: {
    tee_follow_up: [
      {
        tax_office: { id: '01cdi000000000000000000001', name: 'CDI Plateau' },
        rows: [],
        totals: { count: 3 },
      },
    ],
    rme_follow_up: [
      {
        tax_office: { id: '01cdi000000000000000000001', name: 'CDI Plateau' },
        rows: [],
        totals: { count: 1 },
      },
    ],
    new_tee: [
      {
        tax_office: { id: '01cdi000000000000000000001', name: 'CDI Plateau' },
        rows: [],
        totals: { count: 1 },
      },
    ],
    terminations_tee: [],
    summary: {
      rows: [
        {
          tax_office: { id: '01cdi000000000000000000001', name: 'CDI Plateau' },
          active_tee: 3,
          active_rme: 1,
          active_total: 4,
          new_tee: 1,
          new_rme: 0,
          new_total: 1,
          terminated_tee: 0,
          terminated_rme: 0,
          terminated_total: 0,
        },
        {
          tax_office: null,
          active_tee: 1,
          active_rme: 0,
          active_total: 1,
          new_tee: 0,
          new_rme: 0,
          new_total: 0,
          terminated_tee: 0,
          terminated_rme: 0,
          terminated_total: 0,
        },
      ],
      totals: {
        active_tee: 4,
        active_rme: 1,
        active_total: 5,
        new_tee: 1,
        new_rme: 0,
        new_total: 1,
        terminated_tee: 0,
        terminated_rme: 0,
        terminated_total: 0,
      },
    },
  },
  anomalies: [
    {
      code: 'missing_tax_office',
      label: '1 adhérent sans CDI',
      members: [{ id: demoMemberIds.bamba, name: 'QUINCAILLERIE BAMBA' }],
    },
  ],
  sources: { revenues: { manual: 4 }, payments: { manual: 6 } },
};

/** CGA du registre simulé et état de transmission de leurs rapports 2026 (RG-RPT-04, RG-RPT-07). */
export const demoNetworkReports = {
  cgas: [
    { id: '01cga000000000000000000001', name: 'DC-KNOWING CGA', sigle: 'DCK' },
    { id: '01cga000000000000000000002', name: 'CGA Démo Bouaké', sigle: 'DEMOB' },
    { id: '01cga000000000000000000003', name: 'CGA Démo Suspendu', sigle: 'DEMOS' },
  ],
  statuses: {
    '01cga000000000000000000001': ['transmitted', 'legally_late', 'late', 'not_transmitted'],
    '01cga000000000000000000002': ['acknowledged', 'transmitted', 'transmitted', 'not_transmitted'],
    '01cga000000000000000000003': [
      'not_transmitted',
      'not_transmitted',
      'not_transmitted',
      'not_transmitted',
    ],
  } as Record<string, string[]>,
};

const NETWORK_LABELS: Record<string, string> = {
  acknowledged: 'Accusé reçu',
  transmitted: 'Transmis',
  legally_late: 'Hors délai réglementaire',
  late: 'En retard',
  not_transmitted: 'Non transmis',
};

/** `/network/quarterly-reports` : état par CGA pour un trimestre, et tableau de synthèse d'un rapport transmis. */
function networkRoute(
  method: string,
  path: string,
  query: URLSearchParams,
  context: Context,
): ApiReply | undefined {
  if (!path.startsWith('/network/quarterly-reports') || method !== 'GET') {
    return undefined;
  }
  if (!context.allows('reports.network.view')) {
    return forbidden;
  }
  const year = Number(query.get('year'));
  const quarter = Number(query.get('quarter'));
  const status = (cgaId: string) =>
    year === 2026
      ? (demoNetworkReports.statuses[cgaId]?.[quarter - 1] ?? 'not_transmitted')
      : 'not_transmitted';
  const summary = /^\/network\/quarterly-reports\/([^/]+)\/summary$/.exec(path);

  if (summary !== null) {
    const cga = demoNetworkReports.cgas.find((candidate) => candidate.id === summary[1]);

    if (cga === undefined || !['transmitted', 'acknowledged'].includes(status(cga.id))) {
      return notFound;
    }

    return ok({
      cga: { id: cga.id, name: cga.name },
      year,
      quarter,
      transmitted_at: `${year}-0${quarter * 3}-28T09:00:00Z`,
      summary: demoReportStates.sheets.summary,
    });
  }

  const rows = demoNetworkReports.cgas.map((cga) => {
    const value = status(cga.id);
    const sent = value === 'transmitted' || value === 'acknowledged';

    return {
      cga,
      status: value,
      status_label: NETWORK_LABELS[value],
      version: sent ? 1 : null,
      transmitted_at: sent ? `${year}-0${quarter * 3}-28T09:00:00Z` : null,
      acknowledged_at: value === 'acknowledged' ? `${year}-0${quarter * 3}-30` : null,
    };
  });
  const deadlines: Record<number, [string, string]> = {
    1: [`${year}-04-30`, `${year}-05-15`],
    2: [`${year}-07-31`, `${year}-08-15`],
    3: [`${year}-10-31`, `${year}-11-15`],
    4: [`${year + 1}-01-31`, `${year + 1}-02-15`],
  };

  return {
    status: 200,
    data: {
      data: rows,
      meta: {
        year,
        quarter,
        deadline: deadlines[quarter][0],
        legal_deadline: deadlines[quarter][1],
        counts: rows.reduce<Record<string, number>>(
          (counts, row) => ({ ...counts, [row.status]: (counts[row.status] ?? 0) + 1 }),
          {},
        ),
      },
    },
  };
}

export function createReportsBackend() {
  const reports: Stored[] = [
    report({
      id: demoReportIds.q3,
      year: 2026,
      quarter: 3,
      is_late: true,
      content: { ...filledContent(), promotion: null },
    }),
    report({
      id: demoReportIds.q2,
      year: 2026,
      quarter: 2,
      status: 'generated',
      status_label: 'Généré',
      deadline: '2026-07-31',
      legal_deadline: '2026-08-15',
      current_version: 1,
      versions: [versionOf(1, '2026-07-20T09:00:00Z', null, null)],
    }),
    report({
      id: demoReportIds.q1,
      year: 2026,
      quarter: 1,
      status: 'transmitted',
      status_label: 'Transmis',
      deadline: '2026-04-30',
      legal_deadline: '2026-05-15',
      current_version: 1,
      transmitted_at: '2026-04-25T10:00:00Z',
      transmission: {
        transmitted_at: '2026-04-25T10:00:00Z',
        mode: 'email',
        mode_label: 'E-mail',
        reference: 'ENV-01',
        by: 'Koffi Gérant',
      },
      versions: [versionOf(1, '2026-04-20T09:00:00Z', null, '2026-04-25T10:00:00Z')],
    }),
  ];
  let creatable = [{ year: 2026, quarter: 4 }];

  function completeness(item: Stored): Record<string, number> {
    const filled = (value: unknown) =>
      typeof value === 'number' ? true : typeof value === 'string' && value.trim() !== '';
    const percent = (done: number, total: number) => Math.floor((done / total) * 100);
    const taxes = item.directors.every((director) => {
      const row = item.people_taxes.find((candidate) => candidate.person_id === director.id);

      return row !== undefined && row.its !== null && row.igr !== null && row.cnps !== null;
    });

    return {
      section_1: item.report_date !== null && filled(item.regional_directorate_label) ? 100 : 50,
      section_2: item.directors.length > 0 && taxes ? 100 : 0,
      section_3: 100,
      section_4: percent(
        SECTION_4.filter((key) => filled(item.content[key])).length,
        SECTION_4.length,
      ),
      section_5: 100,
      section_6: percent(
        SECTION_6.filter((key) => filled(item.content[key])).length +
          (filled(item.qualitative_analysis.synthesis) ? 1 : 0),
        SECTION_6.length + 1,
      ),
    };
  }

  function resource(
    item: Stored,
    context: Context,
    detailed = true,
  ): QuarterlyReport | ReportDetail {
    const sections = completeness(item);
    const complete = Object.values(sections).every((value) => value === 100);
    const editable = item.status === 'draft';
    const prepare = context.allows('reports.prepare');
    const transmit = context.allows('reports.transmit');
    const { versions, ...rest } = item;

    void versions;
    const base = {
      ...rest,
      completeness: sections,
      completeness_overall: Math.floor(
        Object.values(sections).reduce((total, value) => total + value, 0) / 6,
      ),
    };

    return detailed
      ? {
          ...base,
          can: {
            update: editable && prepare,
            generate: editable && complete && prepare,
            transmit: item.status === 'generated' && transmit,
            acknowledge: item.status === 'transmitted' && transmit,
            correct: (item.status === 'transmitted' || item.status === 'acknowledged') && transmit,
          },
        }
      : base;
  }

  return {
    reports: () => reports,
    route(
      method: string,
      path: string,
      query: URLSearchParams,
      body: unknown,
      context: Context,
    ): ApiReply | undefined {
      if (path.startsWith('/network/quarterly-reports')) {
        return networkRoute(method, path, query, context);
      }
      if (!path.startsWith('/cga/quarterly-reports')) {
        return undefined;
      }
      if (!context.allows('reports.prepare') && !context.allows('reports.transmit')) {
        return forbidden;
      }

      const [id, action] = path.replace(/^\/cga\/quarterly-reports\/?/, '').split('/');
      const input: Input = formInput(body);

      if (id === undefined || id === '') {
        if (method === 'GET') {
          return {
            status: 200,
            data: {
              data: reports.map((item) => resource(item, context, false)),
              meta: { creatable, can: { prepare: context.allows('reports.prepare') } },
            },
          };
        }
        if (method === 'POST') {
          if (!context.allows('reports.prepare')) {
            return forbidden;
          }
          const year = Number(input.year);
          const quarter = Number(input.quarter);

          if (!creatable.some((period) => period.year === year && period.quarter === quarter)) {
            return conflict('report_exists', 'Ce rapport existe déjà.');
          }
          const created = report({
            id: `01rpt00000000000000000${year}0${quarter}`,
            year,
            quarter,
            report_date: null,
            regional_directorate_label: null,
            content: {},
            people_taxes: [],
            qualitative_analysis: {},
          });

          reports.unshift(created);
          creatable = creatable.filter(
            (period) => !(period.year === year && period.quarter === quarter),
          );

          return ok(resource(created, context), 201);
        }

        return undefined;
      }

      const item = reports.find((candidate) => candidate.id === id);

      if (item === undefined) {
        return notFound;
      }

      if (method === 'GET' && action === undefined) {
        return ok(resource(item, context));
      }
      if (method === 'GET' && action === 'states') {
        return ok(demoReportStates);
      }
      if (method === 'GET' && action === 'preview') {
        return ok({
          report: {
            label: item.label,
            period_start: item.period.start,
            period_end: item.period.end,
            deadline: item.deadline,
            legal_deadline: item.legal_deadline,
          },
          cga: { name: 'DC-KNOWING CGA', sigle: 'DCK' },
          states: demoReportStates,
          synthesis:
            'Au 30/09/2026, le portefeuille compte 5 adhérents actifs (+1 sur le trimestre).',
          qualitative_analysis: item.qualitative_analysis,
        });
      }
      if (method === 'GET' && action === 'versions') {
        return ok([...item.versions].sort((a, b) => b.version - a.version));
      }

      if (method === 'PATCH' && action === undefined) {
        if (!context.allows('reports.prepare')) {
          return forbidden;
        }
        if (item.status !== 'draft' && item.status !== 'generated') {
          return conflict('report_not_editable', 'Ce rapport n’est plus modifiable.');
        }
        const content = (input.content ?? {}) as Record<string, string | number | null>;

        if (Object.values(content).some((value) => typeof value === 'number' && value < 0)) {
          return invalid({ 'content.smt_established': 'Le nombre doit être positif.' });
        }
        item.content = { ...item.content, ...content };
        item.qualitative_analysis = {
          ...item.qualitative_analysis,
          ...((input.qualitative_analysis ?? {}) as Record<string, string | null>),
        };
        if (Array.isArray(input.people_taxes)) {
          item.people_taxes = input.people_taxes as PeopleTaxes[];
        }
        if ('report_date' in input) {
          item.report_date = (input.report_date as string | null) ?? null;
        }
        if ('regional_directorate_label' in input) {
          item.regional_directorate_label =
            (input.regional_directorate_label as string | null) ?? null;
        }
        if (item.status === 'generated') {
          item.status = 'draft';
          item.status_label = 'Brouillon';
        }

        return ok(resource(item, context));
      }

      if (method === 'POST' && action === 'generate') {
        if (!context.allows('reports.prepare')) {
          return forbidden;
        }
        if (!(resource(item, context) as ReportDetail).can.generate) {
          return conflict('report_incomplete', 'Le rapport n’est pas complet.');
        }
        const current = item.versions.find((version) => version.version === item.current_version);
        const number =
          current === undefined || current.generated_at !== null
            ? item.current_version + 1
            : item.current_version;

        item.versions = [
          ...item.versions.filter((version) => version.version !== number),
          { ...versionOf(number, '2026-10-21T08:00:00Z', current?.reason ?? null, null) },
        ];
        item.current_version = number;
        item.status = 'generated';
        item.status_label = 'Généré';

        return ok(resource(item, context), 202);
      }

      if (!context.allows('reports.transmit')) {
        return forbidden;
      }

      if (method === 'POST' && action === 'transmit') {
        if (item.status !== 'generated') {
          return conflict('report_not_generated', 'Le rapport doit d’abord être généré.');
        }
        if (
          text(input, 'transmitted_on') === '' ||
          !['physical', 'email', 'other'].includes(text(input, 'mode'))
        ) {
          return invalid({ mode: 'Le mode de transmission est invalide.' });
        }
        const at = `${text(input, 'transmitted_on')}T09:00:00Z`;

        item.status = 'transmitted';
        item.status_label = 'Transmis';
        item.transmitted_at = at;
        item.transmission = {
          transmitted_at: at,
          mode: text(input, 'mode'),
          mode_label:
            { physical: 'Dépôt physique', email: 'E-mail', other: 'Autre' }[text(input, 'mode')] ??
            null,
          reference: (input.reference as string | null) ?? null,
          by: 'Koffi Gérant',
        };
        item.versions = item.versions.map((version) =>
          version.version === item.current_version
            ? versionOf(version.version, version.generated_at ?? at, version.reason, at)
            : version,
        );

        return ok(resource(item, context));
      }

      if (method === 'POST' && action === 'acknowledge') {
        if (item.status !== 'transmitted') {
          return conflict('report_not_transmitted', 'Le rapport doit d’abord être transmis.');
        }
        if (text(input, 'reference') === '' || !(input.file instanceof File)) {
          return invalid({ file: 'L’accusé scanné est obligatoire.' });
        }
        item.status = 'acknowledged';
        item.status_label = 'Accusé reçu';
        item.acknowledged_at = text(input, 'acknowledged_on');
        item.acknowledgement = {
          date: text(input, 'acknowledged_on'),
          reference: text(input, 'reference'),
          file: {
            id: '01fil00000000000000000ack1',
            name: 'accuse.pdf',
            url: 'https://files.test/accuse-rapport.pdf',
          },
        };

        return ok(resource(item, context));
      }

      if (method === 'POST' && action === 'correct') {
        if (item.status !== 'transmitted' && item.status !== 'acknowledged') {
          return conflict('report_not_transmitted', 'Seul un rapport transmis se corrige.');
        }
        if (text(input, 'reason').length < 3) {
          return invalid({ reason: 'Le motif doit contenir au moins 3 caractères.' });
        }
        const next = item.current_version + 1;

        item.versions = [
          ...item.versions,
          {
            ...versionOf(next, '', text(input, 'reason'), null),
            generated_at: null,
            documents: { report: null, workbook: null, slip: null },
          },
        ];
        item.current_version = next;
        item.status = 'draft';
        item.status_label = 'Brouillon';

        return ok(resource(item, context));
      }

      return undefined;
    },
  };
}
