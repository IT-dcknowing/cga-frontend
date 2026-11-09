import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Send } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ActionMenu } from '@/components/shared/action-menu';
import { EmptyState } from '@/components/shared/empty-state';
import { FormDialog } from '@/components/shared/form-dialog';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardActions, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import { Textarea } from '@/components/ui/textarea';
import {
  MESSAGING_CHANNELS,
  messagingApi,
  messagingKeys,
  type MessagingChannel,
  type MessagingDriver,
  type MessagingProvider,
  type TestResult,
} from '@/features/platform/api/messaging-api';
import { ApiBusinessError, ApiValidationError } from '@/lib/api-errors';
import { formatTimestamp } from '@/lib/format';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';
import { cn } from '@/lib/utils';

/*
 * Onglet « Envois » de `/plateforme` (03-APPFLOW §6, F-ADM-06, RG-NOT-05) : un bloc par canal (SMS,
 * WhatsApp, e-mail), ses comptes avec fournisseur, paramètres et identifiants masqués (« ••••4F2A »),
 * état actif, dernier test ; « Ajouter un compte », « Modifier », « Activer » (un seul compte actif par
 * canal), « Envoyer un test » avec le résultat brut du fournisseur. Aucun identifiant dans le code.
 */
const labels = fr.messaging;

/** Paramètre « templates » de WhatsApp : un modèle par ligne, « type=nom_du_modèle ». */
const TEMPLATES = 'templates';

function templatesText(value: unknown): string {
  return value !== null && typeof value === 'object'
    ? Object.entries(value as Record<string, unknown>)
        .map(([type, name]) => `${type}=${String(name)}`)
        .join('\n')
    : '';
}

function templatesValue(text: string): Record<string, string> {
  return Object.fromEntries(
    text
      .split('\n')
      .map((line) => line.split('=').map((part) => part.trim()))
      .filter((parts) => parts.length === 2 && parts[0] !== '' && parts[1] !== ''),
  );
}

function fieldLabel(key: string): string {
  return labels.fields[key] ?? key;
}

type Editing = { channel: MessagingChannel; provider: MessagingProvider | null };

function ProviderDialog({
  editing,
  drivers,
  onClose,
}: {
  editing: Editing;
  drivers: Record<string, MessagingDriver>;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { channel, provider } = editing;
  const choices = Object.entries(drivers).filter(([, driver]) => driver.channels.includes(channel));
  const [driver, setDriver] = useState(provider?.driver ?? choices.at(0)?.[0] ?? '');
  const [label, setLabel] = useState(provider?.label ?? '');
  const [settings, setSettings] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(provider?.settings ?? {}).map(([key, value]) => [
        key,
        key === TEMPLATES ? templatesText(value) : value === null ? '' : String(value),
      ]),
    ),
  );
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const definition = drivers[driver] as MessagingDriver | undefined;
  const sameDriver = provider !== null && provider.driver === driver;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});
    setConflict(null);

    try {
      await messagingApi.save(provider?.id ?? null, {
        channel,
        driver,
        label: label.trim(),
        settings: Object.fromEntries(
          (definition?.settings ?? []).map((key) => [
            key,
            key === TEMPLATES ? templatesValue(settings[key] ?? '') : (settings[key] ?? '').trim(),
          ]),
        ),
        secrets: Object.fromEntries(
          Object.entries(secrets).filter(
            ([key, value]) => definition?.secrets.includes(key) && value !== '',
          ),
        ),
      });
      await queryClient.invalidateQueries({ queryKey: messagingKeys.all });
      toast.success(labels.form.saved);
      onClose();
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setErrors(error.fields);
      } else if (error instanceof ApiBusinessError) {
        setConflict(error.message);
      } else {
        toastUnexpectedError(error);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={
        provider === null
          ? labels.form.addTitle(labels.channels[channel])
          : labels.form.editTitle(provider.label)
      }
      submitLabel={labels.form.save}
      submitting={submitting}
      conflict={conflict}
      onSubmit={(event) => void submit(event)}
    >
      <FormField id="messaging-driver" label={labels.form.driver} required error={errors.driver}>
        <Select
          id="messaging-driver"
          value={driver}
          onChange={(event) => {
            setDriver(event.target.value);
          }}
        >
          {choices.map(([key]) => (
            <option key={key} value={key}>
              {labels.drivers[key] ?? key}
            </option>
          ))}
        </Select>
      </FormField>
      <TextField
        id="messaging-label"
        label={labels.form.label}
        required
        value={label}
        error={errors.label}
        onChange={(event) => {
          setLabel(event.target.value);
        }}
      />
      {(definition?.settings ?? []).map((key) =>
        key === TEMPLATES ? (
          <FormField
            key={key}
            id={`messaging-setting-${key}`}
            label={fieldLabel(key)}
            error={errors[`settings.${key}`]}
          >
            <Textarea
              id={`messaging-setting-${key}`}
              rows={3}
              value={settings[key] ?? ''}
              onChange={(event) => {
                setSettings((previous) => ({ ...previous, [key]: event.target.value }));
              }}
            />
          </FormField>
        ) : (
          <TextField
            key={key}
            id={`messaging-setting-${key}`}
            label={fieldLabel(key)}
            value={settings[key] ?? ''}
            error={errors[`settings.${key}`]}
            onChange={(event) => {
              setSettings((previous) => ({ ...previous, [key]: event.target.value }));
            }}
          />
        ),
      )}
      {(definition?.secrets.length ?? 0) > 0 ? (
        <fieldset className="grid gap-3">
          <legend className="text-label font-semibold">{labels.form.secretsTitle}</legend>
          {definition?.secrets.map((key) => {
            const masked = sameDriver ? provider.secrets[key] : null;

            return (
              <TextField
                key={key}
                id={`messaging-secret-${key}`}
                label={fieldLabel(key)}
                type="password"
                autoComplete="off"
                value={secrets[key] ?? ''}
                hint={
                  masked === null || masked === undefined
                    ? undefined
                    : labels.form.secretKept(masked)
                }
                error={errors[`secrets.${key}`]}
                onChange={(event) => {
                  setSecrets((previous) => ({ ...previous, [key]: event.target.value }));
                }}
              />
            );
          })}
        </fieldset>
      ) : null}
    </FormDialog>
  );
}

function TestDialog({ provider, onClose }: { provider: MessagingProvider; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [to, setTo] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<TestResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const email = provider.channel === 'email';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    setResult(null);

    try {
      setResult(await messagingApi.test(provider.id, to.trim()));
      await queryClient.invalidateQueries({ queryKey: messagingKeys.all });
    } catch (caught) {
      if (caught instanceof ApiValidationError) {
        setError(caught.fields.to ?? Object.values(caught.fields).at(0));
      } else {
        toastUnexpectedError(caught);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={labels.testDialog.title(provider.label)}
      submitLabel={labels.testDialog.send}
      submitting={submitting}
      onSubmit={(event) => void submit(event)}
    >
      <TextField
        id="messaging-test-to"
        label={email ? labels.testDialog.email : labels.testDialog.phone}
        type={email ? 'email' : 'tel'}
        required
        value={to}
        error={error}
        onChange={(event) => {
          setTo(event.target.value);
        }}
      />
      {result === null ? null : result.ok ? (
        <Banner tone="success" role="status">
          {labels.testOk}
        </Banner>
      ) : (
        <Banner tone="danger" role="alert">
          {labels.testDialog.failed} {result.provider_response}
        </Banner>
      )}
    </FormDialog>
  );
}

function ProviderRow({
  provider,
  onEdit,
  onTest,
}: {
  provider: MessagingProvider;
  onEdit: () => void;
  onTest: () => void;
}) {
  const queryClient = useQueryClient();

  async function toggle() {
    try {
      const updated = await messagingApi.setActive(provider.id, !provider.is_active);

      await queryClient.invalidateQueries({ queryKey: messagingKeys.all });
      toast.success(
        updated.is_active ? labels.activated(updated.label) : labels.deactivated(updated.label),
      );
    } catch (error) {
      toastUnexpectedError(error);
    }
  }

  const secrets = Object.entries(provider.secrets).filter(([, value]) => value !== null);

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div className="grid gap-0.5">
        <p className="text-table font-semibold">
          {provider.label}{' '}
          <span
            className={cn(
              'ml-1 inline-flex rounded-badge px-2 py-0.5 text-badge font-bold',
              provider.is_active
                ? 'bg-primary-soft text-primary-dark'
                : 'bg-neutral-soft text-muted',
            )}
          >
            {provider.is_active ? labels.active : labels.inactive}
          </span>
        </p>
        <p className="text-note text-muted">{labels.drivers[provider.driver] ?? provider.driver}</p>
        {secrets.length > 0 ? (
          <p className="text-note text-muted">
            {secrets.map(([key, value]) => `${fieldLabel(key)} ${String(value)}`).join(' · ')}
          </p>
        ) : null}
        {provider.last_test_at === null ? null : (
          <p className="text-note text-muted">
            {labels.lastTest(
              formatTimestamp(provider.last_test_at),
              provider.last_test_result === 'ok'
                ? labels.testOk
                : (provider.last_test_result ?? ''),
            )}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={onTest}>
          <Send aria-hidden="true" />
          {labels.test}
        </Button>
        <ActionMenu
          label={labels.actions(provider.label)}
          items={[
            { label: labels.edit, onSelect: onEdit },
            {
              label: provider.is_active ? labels.deactivate : labels.activate,
              onSelect: () => void toggle(),
            },
          ]}
        />
      </div>
    </li>
  );
}

export function MessagingPanel() {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [testing, setTesting] = useState<MessagingProvider | null>(null);
  const query = useQuery({ queryKey: messagingKeys.all, queryFn: () => messagingApi.overview() });

  if (query.isPending) {
    return <Skeleton className="h-40" />;
  }

  if (query.isError) {
    return (
      <Banner tone="danger" role="alert">
        {labels.loadError}
      </Banner>
    );
  }

  const { providers, drivers } = query.data;

  return (
    <div className="grid gap-4">
      <p className="text-table text-muted">{labels.intro}</p>
      {MESSAGING_CHANNELS.map((channel) => {
        const accounts = providers.filter((provider) => provider.channel === channel);

        return (
          <Card key={channel} aria-label={labels.channels[channel]}>
            <CardHeader>
              <CardTitle>{labels.channels[channel]}</CardTitle>
              <CardActions>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEditing({ channel, provider: null });
                  }}
                >
                  <Plus aria-hidden="true" />
                  {labels.add}
                </Button>
              </CardActions>
            </CardHeader>
            <CardContent>
              {accounts.length === 0 ? (
                <EmptyState icon={Send}>{labels.empty}</EmptyState>
              ) : (
                <ul className="divide-y divide-border">
                  {accounts.map((provider) => (
                    <ProviderRow
                      key={provider.id}
                      provider={provider}
                      onEdit={() => {
                        setEditing({ channel, provider });
                      }}
                      onTest={() => {
                        setTesting(provider);
                      }}
                    />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })}
      {editing === null ? null : (
        <ProviderDialog
          editing={editing}
          drivers={drivers}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
      {testing === null ? null : (
        <TestDialog
          provider={testing}
          onClose={() => {
            setTesting(null);
          }}
        />
      )}
    </div>
  );
}
