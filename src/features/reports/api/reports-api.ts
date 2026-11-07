import { withApiErrors } from '@/lib/api-errors';
import { toFormData } from '@/lib/form-data';
import { http } from '@/lib/http';
import type { ApiItem } from '@/lib/query';

/*
 * Rapports trimestriels du centre (F-RPT-02 à 07), d'après `QuarterlyReportController`
 * (`QuarterlyReportResource`, `QuarterlyReportVersionResource`, états `PortfolioStates`, aperçu
 * `QuarterlyReportCalculator`) : liste et trimestres à préparer, rapport détaillé avec complétude par
 * section, enregistrement des champs, états du portefeuille CGA, aperçu, génération, versions,
 * transmission, accusé de réception, correction.
 */
export const REPORT_SECTIONS = [
  'section_1',
  'section_2',
  'section_3',
  'section_4',
  'section_5',
  'section_6',
] as const;

export type ReportSection = (typeof REPORT_SECTIONS)[number];

export type ReportStatus = 'draft' | 'generated' | 'transmitted' | 'acknowledged';

export type QuarterlyReport = {
  id: string;
  year: number;
  quarter: number;
  label: string;
  period: { start: string; end: string };
  status: ReportStatus;
  status_label: string;
  deadline: string;
  legal_deadline: string;
  is_late: boolean;
  is_legally_late: boolean;
  current_version: number;
  completeness: Partial<Record<ReportSection, number>>;
  completeness_overall: number;
  transmitted_at: string | null;
  acknowledged_at: string | null;
};

export type PeopleTaxes = {
  person_id: string;
  its: number | null;
  igr: number | null;
  cnps: number | null;
};

export type ReportDetail = QuarterlyReport & {
  report_date: string | null;
  regional_directorate_label: string | null;
  content: Record<string, string | number | null>;
  people_taxes: PeopleTaxes[];
  qualitative_analysis: Record<string, string | null>;
  directors: { id: string; full_name: string; function_in_cga: string | null }[];
  /** Nombres proposés par la campagne de clôture (RG-OBL-12). */
  closing_proposals: {
    smt_established: number;
    smt_transmitted: number;
    balance_sheets_established: number;
    balance_sheets_transmitted: number;
    fiscal_year: number;
  } | null;
  transmission: {
    transmitted_at: string;
    mode: string | null;
    mode_label: string | null;
    reference: string | null;
    by: string | null;
  } | null;
  acknowledgement: {
    date: string;
    reference: string | null;
    file: { id: string; name: string; url: string } | null;
  } | null;
  can: {
    update: boolean;
    generate: boolean;
    transmit: boolean;
    acknowledge: boolean;
    correct: boolean;
  };
};

export type ReportDocument = {
  id: string;
  number: string | null;
  version: number;
  status: string;
  status_label: string;
  files: Record<string, string | null>;
} | null;

export type ReportVersion = {
  id: string;
  version: number;
  reason: string | null;
  generated_at: string | null;
  generated_by: string | null;
  transmitted_at: string | null;
  documents: { report: ReportDocument; workbook: ReportDocument; slip: ReportDocument };
};

export type TaxOfficeRef = { id: string; name: string } | null;

export type StateGroup = {
  tax_office: TaxOfficeRef;
  rows: Record<string, unknown>[];
  totals: Record<string, number>;
};

export type SummaryRow = {
  tax_office: TaxOfficeRef;
  active_tee: number;
  active_rme: number;
  active_total: number;
  new_tee: number;
  new_rme: number;
  new_total: number;
  terminated_tee: number;
  terminated_rme: number;
  terminated_total: number;
};

/** Feuille « Résumé » : totaux par CDI. */
export type SummarySheet = { rows: SummaryRow[]; totals: Omit<SummaryRow, 'tax_office'> };

/** États du portefeuille CGA (section 5, RG-RPT-01, RG-RPT-11). */
export type ReportStates = {
  period: { year: number; quarter: number; start: string; end: string };
  sheets: { summary: SummarySheet; [sheet: string]: StateGroup[] | SummarySheet };
  anomalies: { code: string; label: string; members: { id: string; name: string }[] }[];
  sources: { revenues: Record<string, number>; payments: Record<string, number> };
};

/** Graphique préparé par le serveur (`ReportCharts`, 02-TRD §8.4). */
export type ReportChart = {
  type: 'pie' | 'column' | 'bar' | 'line';
  title: string;
  categories: string[];
  series: Record<string, number[]>;
  value_axis: string | null;
};

/** Aperçu du rapport (données du rapport modernisé avant génération). */
export type ReportPreview = {
  report: {
    label: string;
    period_start: string;
    period_end: string;
    deadline: string;
    legal_deadline: string;
  };
  cga: { name: string; sigle: string | null };
  states: ReportStates;
  synthesis: string | null;
  qualitative_analysis: Record<string, string | null>;
  charts: Record<string, ReportChart>;
};

export type ReportChanges = {
  content?: Record<string, string | number | null>;
  qualitative_analysis?: Record<string, string | null>;
  people_taxes?: PeopleTaxes[];
  report_date?: string | null;
  regional_directorate_label?: string | null;
};

export const reportKeys = {
  all: ['reports'] as const,
  list: ['reports', 'list'] as const,
  detail: (id: string) => ['reports', 'detail', id] as const,
  states: (id: string) => ['reports', 'states', id] as const,
  preview: (id: string) => ['reports', 'preview', id] as const,
  versions: (id: string) => ['reports', 'versions', id] as const,
};

function reportPath(id: string, action = ''): string {
  return `/cga/quarterly-reports/${encodeURIComponent(id)}${action === '' ? '' : `/${action}`}`;
}

export const reportsApi = {
  async list(): Promise<{
    reports: QuarterlyReport[];
    creatable: { year: number; quarter: number }[];
    canPrepare: boolean;
  }> {
    const { data } = await http.get<{
      data: QuarterlyReport[];
      meta: { creatable: { year: number; quarter: number }[]; can: { prepare: boolean } };
    }>('/cga/quarterly-reports');

    return {
      reports: data.data,
      creatable: data.meta.creatable,
      canPrepare: data.meta.can.prepare,
    };
  },

  create: (year: number, quarter: number) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<ReportDetail>>('/cga/quarterly-reports', {
        year,
        quarter,
      });

      return data.data;
    }),

  async show(id: string): Promise<ReportDetail> {
    const { data } = await http.get<ApiItem<ReportDetail>>(reportPath(id));

    return data.data;
  },

  save: (id: string, changes: ReportChanges) =>
    withApiErrors(async () => {
      const { data } = await http.patch<ApiItem<ReportDetail>>(reportPath(id), changes);

      return data.data;
    }),

  async states(id: string): Promise<ReportStates> {
    const { data } = await http.get<ApiItem<ReportStates>>(reportPath(id, 'states'));

    return data.data;
  },

  async preview(id: string): Promise<ReportPreview> {
    const { data } = await http.get<ApiItem<ReportPreview>>(reportPath(id, 'preview'));

    return data.data;
  },

  generate: (id: string) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<ReportDetail>>(reportPath(id, 'generate'));

      return data.data;
    }),

  async versions(id: string): Promise<ReportVersion[]> {
    const { data } = await http.get<{ data: ReportVersion[] }>(reportPath(id, 'versions'));

    return data.data;
  },

  transmit: (id: string, input: { transmittedOn: string; mode: string; reference: string }) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<ReportDetail>>(reportPath(id, 'transmit'), {
        transmitted_on: input.transmittedOn,
        mode: input.mode,
        reference: input.reference.trim() === '' ? null : input.reference.trim(),
      });

      return data.data;
    }),

  acknowledge: (id: string, input: { acknowledgedOn: string; reference: string; file: File }) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<ReportDetail>>(
        reportPath(id, 'acknowledge'),
        toFormData({
          acknowledged_on: input.acknowledgedOn,
          reference: input.reference,
          file: input.file,
        }),
      );

      return data.data;
    }),

  correct: (id: string, reason: string) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<ReportDetail>>(reportPath(id, 'correct'), {
        reason,
      });

      return data.data;
    }),
};
