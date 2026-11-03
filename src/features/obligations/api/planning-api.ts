import { withApiErrors } from '@/lib/api-errors';
import { http } from '@/lib/http';
import type { ApiItem } from '@/lib/query';
import type { ObligationCategory } from './obligations-api';

/*
 * Planning des échéances du portefeuille (F-OBL-06, `/cga/obligation-planning`) : lignes regroupées
 * par date et par obligation (adhérents, faites, à faire), indicateur « échéances sous n jours »,
 * adhérents d'une ligne ; obligations du centre lui-même (F-OBL-07, `/cga/center-obligations`).
 */
export type PlanningLine = {
  due_date: string;
  obligation_type_id: string | null;
  label: string;
  category: ObligationCategory;
  category_label: string;
  kind: 'declaration' | 'payment' | 'diligence';
  kind_label: string;
  platform: string | null;
  members: number;
  done: number;
  open: number;
};

export type Planning = {
  lines: PlanningLine[];
  from: string;
  to: string;
  upcoming: { days: number; count: number; members: number };
};

export type PlanningFilters = {
  from: string;
  to: string;
  obligation_type_id: string;
  progress: '' | 'open' | 'done';
};

export type PlanningMember = {
  instance_id: string;
  status: string;
  status_label: string;
  member_declared_status: string | null;
  amount_due: number | null;
  balance: number | null;
  member: {
    id: string;
    company_name: string;
    membership_number: string | null;
    client_number: string | null;
  };
};

export const CENTER_OBLIGATION_KINDS = [
  'tax',
  'cnps',
  'cmu',
  'agreement_renewal',
  'smt',
  'other',
] as const;

export const CENTER_OBLIGATION_STATUSES = ['todo', 'done', 'to_pay', 'paid'] as const;

export type CenterObligation = {
  id: string;
  label: string;
  kind: (typeof CENTER_OBLIGATION_KINDS)[number];
  kind_label: string;
  due_date: string;
  overdue: boolean;
  amount: number | null;
  status: (typeof CENTER_OBLIGATION_STATUSES)[number];
  status_label: string;
  notes: string | null;
  reminder_sent_at: string | null;
};

export type CenterObligationInput = {
  label: string;
  kind: string;
  due_date: string;
  amount: number | null;
  status: string;
  notes: string;
};

export const planningKeys = {
  all: ['planning'] as const,
  lines: (filters: PlanningFilters) => ['planning', 'lines', filters] as const,
  members: (line: PlanningLine) =>
    ['planning', 'members', line.due_date, line.kind, line.obligation_type_id, line.label] as const,
  center: ['planning', 'center'] as const,
};

function blank(value: string): string | undefined {
  return value === '' ? undefined : value;
}

export const planningApi = {
  async lines(filters: PlanningFilters): Promise<Planning> {
    const { data } = await http.get<{ data: PlanningLine[]; meta: Omit<Planning, 'lines'> }>(
      '/cga/obligation-planning',
      {
        params: {
          from: blank(filters.from),
          to: blank(filters.to),
          obligation_type_id: blank(filters.obligation_type_id),
          progress: blank(filters.progress),
        },
      },
    );

    return { lines: data.data, ...data.meta };
  },

  async members(line: PlanningLine): Promise<PlanningMember[]> {
    const { data } = await http.get<{ data: PlanningMember[] }>(
      '/cga/obligation-planning/members',
      {
        params: {
          due_date: line.due_date,
          kind: line.kind,
          obligation_type_id: line.obligation_type_id ?? undefined,
          label: line.label,
        },
      },
    );

    return data.data;
  },

  async center(): Promise<CenterObligation[]> {
    const { data } = await http.get<{ data: CenterObligation[] }>('/cga/center-obligations');

    return data.data;
  },

  saveCenter: (input: CenterObligationInput, id?: string) =>
    withApiErrors(async () => {
      const body = { ...input, notes: input.notes.trim() === '' ? null : input.notes.trim() };
      const { data } =
        id === undefined
          ? await http.post<ApiItem<CenterObligation>>('/cga/center-obligations', body)
          : await http.put<ApiItem<CenterObligation>>(
              `/cga/center-obligations/${encodeURIComponent(id)}`,
              body,
            );

      return data.data;
    }),
};
