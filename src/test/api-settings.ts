import type { Setting, SettingValue } from '@/features/settings/api/settings-api';
import { forbidden, invalid, notFound, ok, type ApiReply, type Input } from './api-replies';

/*
 * Paramètres simulés, d'après `SettingsController` (`SettingResource`, méta `groups`) et le registre
 * `config/cga.php` : `/network/settings` (droit `network_settings.manage`) et `/platform/settings`
 * (droit `platform.settings.manage`, qui voit aussi les clés du réseau). Quelques clés de chaque type ;
 * le registre refuse une valeur hors de ses règles (422 sur `value` ou `value.champ`).
 */
type Context = { allows: (permission: string) => boolean };

type Definition = Omit<Setting, 'value' | 'is_default' | 'can'> & { locked?: boolean };

const GROUP_LABELS: Record<string, string> = {
  dues: 'Cotisation CNCGA',
  report: 'Rapport trimestriel',
  closing: 'Clôture annuelle',
  queue: 'Files d’attente',
};

function definition(
  key: string,
  type: Setting['type'],
  levels: string[],
  label: string,
  value: SettingValue,
  extra: Partial<Definition> = {},
): Definition {
  const group = key.split('.')[0];

  return {
    key,
    group,
    group_label: GROUP_LABELS[group] ?? group,
    label,
    help: null,
    type,
    levels,
    default: value,
    ...extra,
  };
}

export const demoSettingDefinitions: Definition[] = [
  definition(
    'closing.calendar',
    'array',
    ['network', 'cga'],
    'Calendrier de la campagne de clôture',
    {
      pieces: '01-30',
      regularisation: '02-28',
      finalisation: '03-31',
    },
  ),
  definition('closing.filing_date', 'string', ['network'], 'Date du dépôt légal (MM-JJ)', '05-30', {
    locked: true,
  }),
  definition('dues.amount', 'integer', ['network'], 'Montant de la cotisation (FCFA)', 750000),
  definition('dues.mode', 'string', ['network'], 'Modalité de paiement', 'free'),
  definition(
    'queue.alert_delay_minutes',
    'integer',
    ['platform'],
    'Alerte d’une file en attente (minutes)',
    15,
  ),
  definition('report.increase_rule', 'array', ['network'], 'Règle « cotisation augmentée »', {
    basis: 'annual_due',
    min_increase_pct: 0,
    amount: 'net',
  }),
  definition(
    'report.legacy_workbook_enabled',
    'boolean',
    ['network'],
    'Export du classeur de compatibilité (14 feuilles)',
    true,
  ),
  definition(
    'report.reminder_offsets',
    'array',
    ['network'],
    'Relances du rapport (jours avant ou après la date limite)',
    [-15, -5, 5],
    {
      help: 'Jours avant (négatif) ou après (positif) la date limite.',
    },
  ),
];

export function createSettingsBackend() {
  const values = new Map<string, SettingValue>();

  function resource(item: Definition, space: string, context: Context): Setting {
    const { locked, ...rest } = item;
    const permission =
      space === 'platform' ? 'platform.settings.manage' : 'network_settings.manage';

    return {
      ...rest,
      value: values.get(item.key) ?? item.default,
      is_default: !values.has(item.key),
      can: { update: context.allows(permission) && locked !== true },
    };
  }

  function visible(space: string): Definition[] {
    return demoSettingDefinitions.filter((item) =>
      space === 'platform' ? true : item.levels.includes('network'),
    );
  }

  /** Règles du registre pour ces clés de démonstration. */
  function errors(item: Definition, value: unknown): Record<string, string> {
    if (item.type === 'integer' && (typeof value !== 'number' || value < 1)) {
      return { value: 'La valeur doit être un entier positif.' };
    }
    if (item.key === 'report.reminder_offsets') {
      return Array.isArray(value) &&
        value.every((offset) => typeof offset === 'number' && Math.abs(offset) <= 60)
        ? {}
        : { 'value.0': 'Chaque décalage est compris entre -60 et 60 jours.' };
    }
    if (item.key === 'report.increase_rule') {
      const rule = (value ?? {}) as Input;

      return typeof rule.min_increase_pct === 'number' &&
        rule.min_increase_pct >= 0 &&
        rule.min_increase_pct <= 100
        ? {}
        : { 'value.min_increase_pct': 'Le seuil est compris entre 0 et 100 %.' };
    }

    return {};
  }

  return {
    value: (key: string) => values.get(key),
    route(method: string, path: string, body: unknown, context: Context): ApiReply | undefined {
      const match = /^\/(network|platform)\/settings(?:\/([a-z0-9_.]+))?$/.exec(path);

      if (match === null) {
        return undefined;
      }
      const [, space, key] = match;
      const permission =
        space === 'platform' ? 'platform.settings.manage' : 'network_settings.manage';

      if (!context.allows(permission)) {
        return forbidden;
      }
      if (key === undefined) {
        return method === 'GET'
          ? {
              status: 200,
              data: {
                data: visible(space).map((item) => resource(item, space, context)),
                meta: { groups: [...new Set(visible(space).map((item) => item.group))] },
              },
            }
          : undefined;
      }

      const item = visible(space).find((candidate) => candidate.key === key);

      if (item === undefined) {
        return notFound;
      }
      if (!resource(item, space, context).can.update) {
        return forbidden;
      }
      if (method === 'DELETE') {
        values.delete(key);

        return ok(resource(item, space, context));
      }
      if (method === 'PUT') {
        const value = ((body ?? {}) as Input).value;
        const refused = errors(item, value);

        if (Object.keys(refused).length > 0) {
          return invalid(refused);
        }
        values.set(key, value as SettingValue);

        return ok(resource(item, space, context));
      }

      return undefined;
    },
  };
}
