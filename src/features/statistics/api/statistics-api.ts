import { withApiErrors } from '@/lib/api-errors';
import { http } from '@/lib/http';
import type { ApiItem } from '@/lib/query';

/*
 * Tableaux de bord et statistiques (PRD M15, F-DSH-01, 02, 04, F-STA-01, 02, étapes 8.4 et 8.5), d'après
 * `NetworkStatisticsController` (`/network/dashboard`, `/network/statistics`, `/map`, brochures) et
 * `CgaStatisticsController` (`/cga/dashboard`, `/cga/statistics`). La période (jour, mois, année ou
 * période choisie) est interprétée par le serveur (`StatPeriod`), qui compare à l'année précédente.
 */
export const PERIOD_TYPES = ['day', 'month', 'year', 'custom'] as const;

export type PeriodType = (typeof PERIOD_TYPES)[number];

/** Période demandée : `custom` exige `from` et `to` (aaaa-mm-jj). */
export type PeriodQuery = { period: PeriodType; date?: string; from?: string; to?: string };

export type StatPeriod = {
  type: PeriodType;
  from: string;
  to: string;
  previous: { from: string; to: string };
};

/** Valeur de la période et de la même période l'année précédente (`Variation`). */
export type Variation = {
  value: number | null;
  previous: number | null;
  change: number | null;
  change_pct: number | null;
};

export type DashboardAlert = {
  code: string;
  count: number;
  label: string;
  /** Éléments concernés (agréments à échéance, formations presque complètes). */
  items?: Record<string, unknown>[];
  /** RSI au-delà du délai, honoraires en retard : part déjà hors délai. */
  overdue?: number;
};

export type Coverage = { subscribed_cgas: number; total_cgas: number; label: string };

export type NetworkDashboard = {
  period: StatPeriod;
  coverage: Coverage;
  computed_at: string | null;
  indicators: {
    cgas: Coverage;
    dues?: {
      collected: Variation;
      year: number;
      expected: number;
      collected_year_to_date: number;
      rate: number | null;
    };
    concerns?: { open: number; submitted: Variation };
    members?: Variation;
  };
  dues_chart:
    { month: string; collected: number; collected_year_to_date: number; expected: number }[] | null;
  alerts: DashboardAlert[];
};

export type CgaDashboard = {
  period: StatPeriod;
  computed_at: string | null;
  indicators: {
    members?: { active: Variation; new: Variation; radiations: Variation; to_complete: number };
    fees?: { due: Variation; paid: Variation; unpaid: number };
    upcoming?: { days: number; count: number; members: number };
    report?: {
      id: string;
      year: number;
      quarter: number;
      status: string;
      completeness: number;
    } | null;
  };
  alerts: DashboardAlert[];
};

export type MacroRate = { available: boolean; rate: number | null; label: string | null };

export type Directorate = {
  id: string | null;
  code: string | null;
  name: string | null;
  geo_key: string | null;
  cgas: number;
  members: number;
  revenue: number;
};

export type NationalStatistics = {
  period: StatPeriod;
  coverage: Coverage;
  computed_at: string | null;
  macro: {
    year: number;
    tax_revenue: number;
    member_revenue: number;
    budget_contribution: MacroRate;
    gdp_contribution: MacroRate;
  };
  tax_revenue: { total: number; by_nature: Record<string, number> };
  by_cga: {
    id: string;
    name: string | null;
    sigle: string | null;
    tax_paid_total: number;
    active_members: number;
    declared_revenue: number;
  }[];
  by_regime: Record<string, number>;
  by_sector: { id: string | null; name: string | null; members: number }[];
  by_directorate: Directorate[];
};

export type DirectorateCommunes = {
  period: StatPeriod;
  directorate: { id: string; code: string; name: string; geo_key: string | null };
  communes: { id: string; name: string; members: number }[];
};

export const POSITION_METRICS = [
  'active_members',
  'new_members',
  'radiations',
  'fees_paid',
  'tax_paid_total',
  'declared_revenue',
  'concerns_avg_response_hours',
] as const;

export type CgaPosition = {
  period: StatPeriod;
  computed_at: string | null;
  network: { contributors: number; minimum: number; sufficient: boolean; label: string | null };
  indicators: Record<string, { own: number | null; network_average: number | null }>;
};

export type Brochure = {
  id: string;
  title: string;
  year: number;
  status: string;
  status_label: string;
  issued_at: string | null;
  pdf: { name: string; size_bytes: number; url: string } | null;
};

export const statisticsKeys = {
  all: ['statistics'] as const,
  networkDashboard: (query: PeriodQuery) => ['statistics', 'network', 'dashboard', query] as const,
  cgaDashboard: (query: PeriodQuery) => ['statistics', 'cga', 'dashboard', query] as const,
  national: (query: PeriodQuery) => ['statistics', 'network', 'national', query] as const,
  communes: (id: string, query: PeriodQuery) =>
    ['statistics', 'network', 'communes', id, query] as const,
  position: (query: PeriodQuery) => ['statistics', 'cga', 'position', query] as const,
  brochures: ['statistics', 'network', 'brochures'] as const,
};

function params(query: PeriodQuery) {
  return query.period === 'custom'
    ? { period: query.period, from: query.from, to: query.to }
    : { period: query.period, date: query.date };
}

async function get<T>(path: string, query: PeriodQuery): Promise<T> {
  const { data } = await http.get<ApiItem<T>>(path, { params: params(query) });

  return data.data;
}

export const statisticsApi = {
  networkDashboard: (query: PeriodQuery) => get<NetworkDashboard>('/network/dashboard', query),
  cgaDashboard: (query: PeriodQuery) => get<CgaDashboard>('/cga/dashboard', query),
  national: (query: PeriodQuery) => get<NationalStatistics>('/network/statistics', query),
  communes: (id: string, query: PeriodQuery) =>
    get<DirectorateCommunes>(`/network/statistics/map/${encodeURIComponent(id)}`, query),
  position: (query: PeriodQuery) => get<CgaPosition>('/cga/statistics', query),

  /** « Actualiser » : recalcul en file d'attente (202), limité par le serveur. */
  refresh: (space: 'network' | 'cga') =>
    withApiErrors(async () => {
      await http.post(`/${space}/statistics/refresh`);
    }),

  async brochures(): Promise<Brochure[]> {
    const { data } = await http.get<{ data: Brochure[] }>('/network/statistics/brochures');

    return data.data;
  },

  /** « Exporter la plaquette PDF » de l'année : produite en file d'attente (202). */
  produceBrochure: (year: number) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<Brochure>>('/network/statistics/brochures', {
        year,
      });

      return data.data;
    }),
};
