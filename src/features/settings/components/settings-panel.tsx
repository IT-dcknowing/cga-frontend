import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Settings2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/shared/empty-state';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox, CheckboxField } from '@/components/ui/checkbox';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  settingsApi,
  settingsKeys,
  type Setting,
  type SettingValue,
  type SettingsSpace,
} from '@/features/settings/api/settings-api';
import { ApiBusinessError, ApiValidationError } from '@/lib/api-errors';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';

/*
 * Éditeur générique des paramètres (02-TRD §7.5, étapes 5.6b et 5.13) : un bloc par groupe, une ligne
 * par clé avec le champ adapté à son type (nombre, texte ou liste de choix, oui / non, liste de valeurs
 * séparées par des virgules, valeur structurée champ par champ), « Enregistrer » et « Valeur par
 * défaut ». Le serveur valide la valeur (registre `config/cga.php`) et dit qui peut la modifier.
 */
const labels = fr.settings;

type Draft = string | boolean | Record<string, string>;

function isObject(value: SettingValue): value is { [key: string]: SettingValue } {
  return typeof value === 'object' && !Array.isArray(value);
}

function fieldLabel(key: string, field: string): string {
  return (
    labels.fields[key]?.[field] ??
    (key.startsWith('rate_limit.') ? labels.fields.rateLimit[field] : undefined) ??
    field
  );
}

function display(value: SettingValue): string {
  if (typeof value === 'boolean') {
    return value ? labels.yes : labels.no;
  }
  if (Array.isArray(value)) {
    return value.map(display).join(', ');
  }
  if (isObject(value)) {
    return Object.entries(value)
      .map(([field, item]) => `${field} : ${display(item)}`)
      .join(' · ');
  }

  return String(value);
}

function draftOf(setting: Setting): Draft {
  const { value } = setting;

  if (typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item as string | number)).join(', ');
  }
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([field, item]) => [field, String(item as string | number)]),
    );
  }

  return String(value);
}

/** Valeur à envoyer, typée d'après la valeur par défaut ; `null` si un nombre est mal saisi. */
function valueOf(setting: Setting, draft: Draft): SettingValue | null {
  const reference = setting.default;
  const number = (text: string): number | null =>
    /^-?\d+$/.test(text.trim()) ? Number.parseInt(text.trim(), 10) : null;

  if (typeof draft === 'boolean') {
    return draft;
  }
  if (typeof draft === 'string') {
    if (Array.isArray(reference)) {
      const items = draft
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item !== '');
      const numeric = reference.length > 0 && typeof reference[0] === 'number';

      if (!numeric) {
        return items;
      }
      const numbers = items.map(number);

      return numbers.some((item) => item === null) ? null : (numbers as number[]);
    }

    return setting.type === 'integer' ? number(draft) : draft;
  }

  const fields: Record<string, SettingValue> = {};

  for (const [field, text] of Object.entries(draft)) {
    const sample = isObject(reference) ? reference[field] : undefined;

    if (typeof sample === 'number') {
      const parsed = number(text);

      if (parsed === null) {
        return null;
      }
      fields[field] = parsed;
    } else {
      fields[field] = text;
    }
  }

  return fields;
}

function SettingEditor({ space, setting }: { space: SettingsSpace; setting: Setting }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => draftOf(setting));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = `setting-${setting.key.replace(/\./g, '-')}`;
  const readOnly = !setting.can.update;

  async function run(action: () => Promise<Setting>, done: string) {
    setErrors({});
    setConflict(null);
    setBusy(true);
    try {
      await action();
      toast.success(done);
      await queryClient.invalidateQueries({ queryKey: settingsKeys.list(space) });
    } catch (error) {
      if (error instanceof ApiValidationError) {
        // `value.champ` vise un champ d'une valeur structurée ; `value` ou `value.0` (élément d'une
        // liste), le champ principal.
        const fields = typeof draft === 'object' ? Object.keys(draft) : [];

        setErrors(
          Object.fromEntries(
            Object.entries(error.fields).map(([field, message]) => {
              const name = field.replace(/^value\.?/, '');

              return [fields.includes(name) ? name : 'value', message];
            }),
          ),
        );
      } else if (error instanceof ApiBusinessError) {
        setConflict(error.message);
      } else {
        toastUnexpectedError(error);
      }
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = valueOf(setting, draft);

    if (value === null) {
      setErrors({ value: labels.invalidNumber });

      return;
    }
    void run(() => settingsApi.update(space, setting.key, value), labels.saved(setting.label));
  }

  function textField(field: string | null, current: string) {
    const optionKey = field === null ? setting.key : `${setting.key}.${field}`;
    const options = labels.options[optionKey];
    const fieldId = field === null ? id : `${id}-${field}`;
    const error = errors[field ?? 'value'];
    const label = field === null ? setting.label : fieldLabel(setting.key, field);
    const update = (next: string) => {
      setDraft((previous) =>
        field === null || typeof previous !== 'object' ? next : { ...previous, [field]: next },
      );
    };
    const numeric =
      field === null
        ? setting.type === 'integer'
        : isObject(setting.default) && typeof setting.default[field] === 'number';

    return (
      <FormField
        key={fieldId}
        id={fieldId}
        label={label}
        error={error}
        hint={
          field === null && Array.isArray(setting.default)
            ? labels.listHint
            : (setting.help ?? undefined)
        }
        className="min-w-48 flex-1"
      >
        {options === undefined ? (
          <Input
            id={fieldId}
            type={numeric ? 'number' : 'text'}
            value={current}
            disabled={readOnly}
            aria-invalid={error !== undefined || undefined}
            onChange={(event) => {
              update(event.target.value);
            }}
          />
        ) : (
          <Select
            id={fieldId}
            value={current}
            disabled={readOnly}
            onChange={(event) => {
              update(event.target.value);
            }}
          >
            {Object.entries(options).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </Select>
        )}
      </FormField>
    );
  }

  return (
    <form
      aria-label={setting.label}
      className="grid gap-2 border-b border-border py-4 last:border-b-0"
      onSubmit={submit}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{setting.label}</span>
        <span className="text-note text-muted">
          {readOnly ? `${labels.readOnly} · ` : ''}
          {setting.is_default ? labels.isDefault : labels.customized}
        </span>
      </div>
      {conflict === null ? null : (
        <Banner tone="danger" role="alert">
          {conflict}
        </Banner>
      )}
      <div className="flex flex-wrap items-end gap-3">
        {typeof draft === 'boolean' ? (
          <CheckboxField id={id} label={setting.label} error={errors.value}>
            <Checkbox
              id={id}
              checked={draft}
              disabled={readOnly}
              onChange={(event) => {
                setDraft(event.target.checked);
              }}
            />
          </CheckboxField>
        ) : typeof draft === 'string' ? (
          textField(null, draft)
        ) : (
          Object.entries(draft).map(([field, current]) => textField(field, current))
        )}
      </div>
      {isObject(setting.value) && errors.value !== undefined ? (
        <p className="text-note text-danger">{errors.value}</p>
      ) : null}
      {setting.is_default ? null : (
        <p className="text-note text-muted">{labels.defaultValue(display(setting.default))}</p>
      )}
      {readOnly ? null : (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={busy}>
            {labels.save}
          </Button>
          {setting.is_default ? null : (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                void run(
                  () => settingsApi.reset(space, setting.key),
                  labels.resetDone(setting.label),
                );
              }}
            >
              <RotateCcw aria-hidden="true" />
              {labels.reset}
            </Button>
          )}
        </div>
      )}
    </form>
  );
}

export function SettingsPanel({
  space,
  include = () => true,
  intro,
}: {
  space: SettingsSpace;
  include?: (setting: Setting) => boolean;
  intro?: string;
}) {
  const query = useQuery({
    queryKey: settingsKeys.list(space),
    queryFn: () => settingsApi.list(space),
  });

  if (query.isPending) {
    return <Skeleton className="h-32 w-full" />;
  }

  if (query.isError) {
    return (
      <Banner
        tone="danger"
        role="alert"
        action={
          <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
            {fr.common.retry}
          </Button>
        }
      >
        {labels.loadError}
      </Banner>
    );
  }

  const shown = query.data.filter(include);
  const groups = [...new Set(shown.map((setting) => setting.group))];

  return (
    <div className="grid gap-4">
      {intro === undefined ? null : <p className="text-body text-muted">{intro}</p>}
      {shown.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState icon={Settings2}>{labels.empty}</EmptyState>
          </CardContent>
        </Card>
      ) : null}
      {groups.map((group) => {
        const settings = shown.filter((setting) => setting.group === group);

        return (
          <Card key={group}>
            <CardHeader>
              <CardTitle>{settings[0].group_label}</CardTitle>
            </CardHeader>
            <CardContent>
              {settings.map((setting) => (
                <SettingEditor
                  key={`${setting.key}-${JSON.stringify(setting.value)}`}
                  space={space}
                  setting={setting}
                />
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
