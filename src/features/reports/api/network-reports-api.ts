import { http } from '@/lib/http';
import type { ApiItem } from '@/lib/query';
import type { SummarySheet } from './reports-api';

/*
 * Rapports trimestriels vus du réseau (RG-RPT-04, `/cncga/rapports`, étape 5.9), d'après
 * `NetworkReportController` : état de transmission de chaque CGA pour un trimestre (transmis, accusé
 * reçu, en retard, hors délai réglementaire, non transmis), et tableau de synthèse agrégé d'un rapport
 * transmis (feuille Résumé, sans aucun nom d'adhérent).
 */
export type NetworkReportStatus =
  'acknowledged' | 'transmitted' | 'legally_late' | 'late' | 'not_transmitted';

export type NetworkReportRow = {
  cga: { id: string; name: string; sigle: string | null };
  status: NetworkReportStatus;
  status_label: string;
  version: number | null;
  transmitted_at: string | null;
  acknowledged_at: string | null;
};

export type NetworkQuarter = {
  rows: NetworkReportRow[];
  year: number;
  quarter: number;
  deadline: string;
  legal_deadline: string;
  counts: Partial<Record<NetworkReportStatus, number>>;
};

export type NetworkSummary = {
  cga: { id: string; name: string };
  year: number;
  quarter: number;
  transmitted_at: string | null;
  summary: SummarySheet;
};

export const QUARTERS = [1, 2, 3, 4] as const;

export const networkReportKeys = {
  quarter: (year: number, quarter: number) => ['reports', 'network', year, quarter] as const,
  summary: (cgaId: string, year: number, quarter: number) =>
    ['reports', 'network', 'summary', cgaId, year, quarter] as const,
};

export const networkReportsApi = {
  async quarter(year: number, quarter: number): Promise<NetworkQuarter> {
    const { data } = await http.get<{
      data: NetworkReportRow[];
      meta: Omit<NetworkQuarter, 'rows'>;
    }>('/network/quarterly-reports', { params: { year, quarter } });

    return { rows: data.data, ...data.meta };
  },

  async summary(cgaId: string, year: number, quarter: number): Promise<NetworkSummary> {
    const { data } = await http.get<ApiItem<NetworkSummary>>(
      `/network/quarterly-reports/${encodeURIComponent(cgaId)}/summary`,
      { params: { year, quarter } },
    );

    return data.data;
  },
};
