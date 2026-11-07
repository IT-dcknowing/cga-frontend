import { withApiErrors } from '@/lib/api-errors';
import { http } from '@/lib/http';
import type { ApiItem } from '@/lib/query';

/*
 * Paramètres du réseau et de la plateforme (02-TRD §7.5, étapes 5.6b et 5.13), d'après
 * `SettingsController` (`SettingResource`) : `/network/settings` (CNCGA) et `/platform/settings`
 * (administrateur), lecture par groupe, modification d'une clé, retour à la valeur par défaut. Le
 * registre du backend valide chaque valeur et dit qui peut la modifier (`can.update`).
 */
export type SettingsSpace = 'network' | 'platform';

export type SettingValue =
  number | string | boolean | SettingValue[] | { [key: string]: SettingValue };

export type Setting = {
  key: string;
  group: string;
  group_label: string;
  label: string;
  help: string | null;
  type: 'integer' | 'string' | 'boolean' | 'array';
  levels: string[];
  value: SettingValue;
  default: SettingValue;
  is_default: boolean;
  can: { update: boolean };
};

export const settingsKeys = {
  all: ['settings'] as const,
  list: (space: SettingsSpace) => ['settings', space] as const,
};

function settingPath(space: SettingsSpace, key: string): string {
  return `/${space}/settings/${encodeURIComponent(key)}`;
}

export const settingsApi = {
  async list(space: SettingsSpace): Promise<Setting[]> {
    const { data } = await http.get<{ data: Setting[] }>(`/${space}/settings`);

    return data.data;
  },

  update: (space: SettingsSpace, key: string, value: SettingValue) =>
    withApiErrors(async () => {
      const { data } = await http.put<ApiItem<Setting>>(settingPath(space, key), { value });

      return data.data;
    }),

  reset: (space: SettingsSpace, key: string) =>
    withApiErrors(async () => {
      const { data } = await http.delete<ApiItem<Setting>>(settingPath(space, key));

      return data.data;
    }),
};
