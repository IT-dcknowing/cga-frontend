import { withApiErrors } from '@/lib/api-errors';
import { http } from '@/lib/http';

export type PermanentPersonKind = 'director' | 'employee' | 'occasional';
export type PermanentPerson = {
  id: string;
  kind: PermanentPersonKind;
  kind_label: string;
  full_name: string;
  nationality: string | null;
  profession: string | null;
  diplomas: string | null;
  function_in_cga: string | null;
  start_date: string | null;
  practice_structure: string | null;
  practice_function: string | null;
  practice_years: number | null;
  cnps_declared: boolean | null;
  active: boolean;
  end_date: string | null;
};
export type PermanentPersonInput = Omit<PermanentPerson, 'id' | 'kind_label'>;
export type PermanentResource = {
  id: string;
  category: string;
  category_label: string;
  quantity: number;
  description: string | null;
  need: string | null;
};
export type PermanentProfile = {
  presentation: {
    name: string;
    sigle: string | null;
    legal_form: string | null;
    share_capital: number | null;
    ncc: string;
    agreement_number: string | null;
    agreement_date: string | null;
    regional_directorate: { id: string; name: string } | null;
    said: string | null;
    address: string | null;
    city: string | null;
    manager_name: string | null;
    expert_name: string | null;
    history_text: string | null;
    previous_year_revenue: number | null;
  };
  people: PermanentPerson[];
  resources: Array<{
    category: string;
    category_label: string;
    entry: PermanentResource | null;
  }>;
  can: { manage: boolean };
};

type Item<T> = { data: T };

export const permanentProfileKeys = {
  all: ['permanent-profile'] as const,
};

export const permanentProfileApi = {
  async get(): Promise<PermanentProfile> {
    const { data } = await http.get<Item<PermanentProfile>>('/cga/permanent-profile');
    return data.data;
  },
  savePresentation(input: { history_text: string | null; previous_year_revenue: number | null }) {
    return withApiErrors(async () => {
      const { data } = await http.put<Item<PermanentProfile['presentation']>>(
        '/cga/permanent-profile/presentation',
        input,
      );
      return data.data;
    });
  },
  savePerson(input: PermanentPersonInput, id?: string) {
    return withApiErrors(async () => {
      const { data } = id === undefined
        ? await http.post<Item<PermanentPerson>>('/cga/permanent-profile/people', input)
        : await http.put<Item<PermanentPerson>>(`/cga/permanent-profile/people/${encodeURIComponent(id)}`, input);
      return data.data;
    });
  },
  saveResource(category: string, input: { quantity: number; description: string | null; need: string | null }) {
    return withApiErrors(async () => {
      const { data } = await http.put<Item<PermanentResource>>(
        `/cga/permanent-profile/resources/${encodeURIComponent(category)}`,
        input,
      );
      return data.data;
    });
  },
};
