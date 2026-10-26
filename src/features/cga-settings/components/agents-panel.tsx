import { useQueryClient } from '@tanstack/react-query';
import { UserPlus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ActionMenu, type ActionMenuItem } from '@/components/shared/action-menu';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { FormDialog } from '@/components/shared/form-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { fieldProps } from '@/components/ui/field-props';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import {
  ASSIGNABLE_ROLES,
  cgaApi,
  INVITATION_CHANNELS,
  type Agent,
  type AgentScope,
} from '@/features/cga-settings/api/cga-api';
import { useAuth } from '@/features/auth/session/auth-context';
import { cgaKeys, useAgents } from '@/features/cga-settings/api/queries';
import { cgaPermissionRoutes } from '@/features/cga-settings/lib/routes';
import { ApiBusinessError } from '@/lib/api-errors';
import { config } from '@/lib/config';
import { formatTimestampDate } from '@/lib/format';
import { showValidationErrors } from '@/lib/form-errors';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';
import { permissionCodes } from '@/lib/reference/permissions';
import { roleLabel } from '@/lib/reference/roles';

/*
 * Utilisateurs d'une organisation (F-ORG-09, 10, 03-APPFLOW §3.2 et §4.3) : ceux du centre pour son
 * gérant (`/cga/users`), ceux du CNCGA pour la Présidente (`/network/users`). Inviter (un ou plusieurs
 * profils), modifier les profils, désactiver, réactiver, renvoyer l'invitation ; chaque action suit
 * le bloc `can` du serveur, qui refait le contrôle.
 */
const labels = fr.cgaSettings.users;
const required = fr.members.create.errors.required;

function useRefresh(scope: AgentScope) {
  const queryClient = useQueryClient();

  return () => queryClient.invalidateQueries({ queryKey: cgaKeys.agents(scope) });
}

function RoleChoices({
  scope,
  selected,
  error,
  onChange,
}: {
  scope: AgentScope;
  selected: string[];
  error?: string;
  onChange: (roles: string[]) => void;
}) {
  return (
    <fieldset className="grid gap-2" aria-describedby={error ? 'agent-roles-error' : undefined}>
      <legend className="mb-1.5 text-label font-semibold text-muted">
        {labels.inviteDialog.roles}
      </legend>
      {ASSIGNABLE_ROLES[scope].map((role) => (
        <label key={role} className="flex items-start gap-2 text-body">
          <Checkbox
            checked={selected.includes(role)}
            onChange={(event) => {
              onChange(
                event.target.checked
                  ? [...selected, role]
                  : selected.filter((item) => item !== role),
              );
            }}
          />
          {roleLabel(role)}
        </label>
      ))}
      {error !== undefined ? (
        <p id="agent-roles-error" className="text-note text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

type InviteForm = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  channel: string;
  roles: string[];
};

function InviteDialog({ scope, onClose }: { scope: AgentScope; onClose: () => void }) {
  const refresh = useRefresh(scope);
  const [conflict, setConflict] = useState<string | null>(null);
  // Les profils ne sont pas un champ enregistré : leur erreur vit hors du formulaire, sans quoi
  // elle bloquerait les envois suivants.
  const [rolesError, setRolesError] = useState<string | undefined>();
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<InviteForm>({
    defaultValues: {
      first_name: '',
      last_name: '',
      phone: '',
      email: '',
      channel: 'sms',
      roles: [],
    },
  });
  const roles = useWatch({ control, name: 'roles' });
  const text = labels.inviteDialog;

  const submit = handleSubmit(async (values) => {
    let invalid = false;

    for (const name of ['first_name', 'last_name', 'phone'] as const) {
      if (values[name].trim() === '') {
        setError(name, { message: required });
        invalid = true;
      }
    }

    if (values.channel !== 'sms' && values.email.trim() === '') {
      setError('email', { message: required });
      invalid = true;
    }

    setRolesError(values.roles.length === 0 ? text.rolesRequired : undefined);

    if (values.roles.length === 0) {
      invalid = true;
    }

    if (invalid) {
      return;
    }

    setConflict(null);

    try {
      await cgaApi.invite(scope, {
        first_name: values.first_name.trim(),
        last_name: values.last_name.trim(),
        phone: values.phone.trim(),
        email: values.email.trim() === '' ? null : values.email.trim(),
        channel: values.channel,
        roles: values.roles,
      });
      toast.success(text.done);
      await refresh();
      onClose();
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        setConflict(error.message);
      } else if (
        !showValidationErrors(
          error,
          (name, fieldError) => {
            if (name === 'roles') {
              setRolesError(fieldError.message);
            } else {
              setError(name as Exclude<keyof InviteForm, 'roles'>, fieldError);
            }
          },
          {
            first_name: 'first_name',
            last_name: 'last_name',
            phone: 'phone',
            email: 'email',
            channel: 'channel',
            roles: 'roles',
            'roles.0': 'roles',
          },
        )
      ) {
        toastUnexpectedError(error);
      }
    }
  });

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={text.title}
      description={text.description}
      submitLabel={text.submit}
      submitting={isSubmitting}
      onSubmit={submit}
      conflict={conflict}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <TextField
          id="agent-first-name"
          label={text.firstName}
          required
          error={errors.first_name?.message}
          {...register('first_name')}
        />
        <TextField
          id="agent-last-name"
          label={text.lastName}
          required
          error={errors.last_name?.message}
          {...register('last_name')}
        />
        <TextField
          id="agent-phone"
          type="tel"
          label={text.phone}
          required
          error={errors.phone?.message}
          {...register('phone')}
        />
        <TextField
          id="agent-email"
          type="email"
          label={text.email}
          hint={text.emailHint}
          error={errors.email?.message}
          {...register('email')}
        />
      </div>
      <FormField id="agent-channel" label={text.channel} error={errors.channel?.message}>
        <Select {...fieldProps('agent-channel', errors.channel?.message)} {...register('channel')}>
          {INVITATION_CHANNELS.map((channel) => (
            <option key={channel} value={channel}>
              {text.channels[channel]}
            </option>
          ))}
        </Select>
      </FormField>
      <RoleChoices
        scope={scope}
        selected={roles}
        error={rolesError}
        onChange={(next) => {
          setValue('roles', next);
          setRolesError(undefined);
        }}
      />
    </FormDialog>
  );
}

function RolesDialog({
  scope,
  agent,
  onClose,
}: {
  scope: AgentScope;
  agent: Agent;
  onClose: () => void;
}) {
  const refresh = useRefresh(scope);
  const assignable = ASSIGNABLE_ROLES[scope];
  const [roles, setRoles] = useState(
    agent.roles
      .filter((item) => item.status !== 'disabled' && assignable.includes(item.role))
      .map((item) => item.role),
  );
  const [error, setError] = useState<string | undefined>();
  const [conflict, setConflict] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const text = labels.rolesDialog;

  async function submit() {
    if (roles.length === 0) {
      setError(labels.inviteDialog.rolesRequired);

      return;
    }

    setSubmitting(true);
    setConflict(null);

    try {
      await cgaApi.updateRoles(scope, agent.id, roles);
      toast.success(text.done);
      await refresh();
      onClose();
    } catch (failure) {
      setSubmitting(false);

      if (failure instanceof ApiBusinessError) {
        setConflict(failure.message);
      } else if (
        !showValidationErrors(
          failure,
          (_field, fieldError) => {
            setError(fieldError.message);
          },
          { roles: 'roles', 'roles.0': 'roles' },
        )
      ) {
        toastUnexpectedError(failure);
      }
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
      title={text.title}
      description={text.description(agent.name)}
      submitLabel={text.submit}
      submitting={submitting}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      conflict={conflict}
    >
      <RoleChoices scope={scope} selected={roles} error={error} onChange={setRoles} />
    </FormDialog>
  );
}

function DisableDialog({
  scope,
  agent,
  onClose,
}: {
  scope: AgentScope;
  agent: Agent;
  onClose: () => void;
}) {
  const refresh = useRefresh(scope);
  const [conflict, setConflict] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const text = labels.disableDialog;

  async function submit() {
    setSubmitting(true);
    setConflict(null);

    try {
      await cgaApi.setActive(scope, agent.id, false);
      toast.success(text.done(agent.name));
      await refresh();
      onClose();
    } catch (failure) {
      setSubmitting(false);

      if (failure instanceof ApiBusinessError) {
        setConflict(failure.message);
      } else {
        toastUnexpectedError(failure);
      }
    }
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={text.title}
      description={agent.name}
      submitLabel={text.submit}
      submitting={submitting}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      conflict={conflict}
      effects={text.effects}
    >
      {null}
    </ConfirmDialog>
  );
}

type Dialog = { name: 'invite' } | { name: 'roles' | 'disable'; agent: Agent };

export function AgentsPanel({ scope }: { scope: AgentScope }) {
  const refresh = useRefresh(scope);
  const navigate = useNavigate();
  const { can } = useAuth();
  // Habilitations d'un agent du centre (RG-ROLE-07) ; celles du CNCGA se règlent dans /plateforme.
  const adjusts = scope === 'cga' && can(permissionCodes.cga.userPermissions);
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const query = useAgents(scope, { search, status });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(typed.trim());
    }, config.searchDebounceMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [typed]);

  async function act(call: () => Promise<unknown>, done: string) {
    try {
      await call();
      toast.success(done);
      await refresh();
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        toast.error(error.message);
      } else {
        toastUnexpectedError(error);
      }
    }
  }

  function actions(agent: Agent): ActionMenuItem[] {
    const items: ActionMenuItem[] = [];

    if (agent.can.update_roles) {
      items.push({
        label: labels.editRoles,
        onSelect: () => {
          setDialog({ name: 'roles', agent });
        },
      });
    }

    // Le gérant garde tous ses droits : il n'a pas d'habilitations à ajuster.
    if (adjusts && !agent.roles.some((item) => item.role === 'cga_manager')) {
      items.push({
        label: fr.permissions.user.action,
        onSelect: () => {
          void navigate(cgaPermissionRoutes.user(agent.id));
        },
      });
    }

    if (agent.can.resend_invitation) {
      items.push({
        label: labels.resend,
        onSelect: () => void act(() => cgaApi.resendInvitation(scope, agent.id), labels.resent),
      });
    }

    if (agent.can.enable) {
      items.push({
        label: labels.enable,
        onSelect: () =>
          void act(() => cgaApi.setActive(scope, agent.id, true), labels.enabled(agent.name)),
      });
    }

    if (agent.can.disable) {
      items.push({
        label: labels.disable,
        danger: true,
        onSelect: () => {
          setDialog({ name: 'disable', agent });
        },
      });
    }

    return items;
  }

  let body;

  if (query.isPending) {
    body = <Skeleton className="h-24 w-full" />;
  } else if (query.isError) {
    body = (
      <Banner
        tone="danger"
        action={
          <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
            {fr.common.retry}
          </Button>
        }
      >
        {labels.loadError}
      </Banner>
    );
  } else if (query.data.length === 0) {
    body = <EmptyState icon={Users}>{labels.empty}</EmptyState>;
  } else {
    body = (
      <ul aria-label={labels.caption} className="divide-y divide-border">
        {query.data.map((agent) => (
          <li key={agent.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="grid gap-0.5">
              <span className="font-semibold">{agent.name}</span>
              <span className="text-note text-muted">
                {[agent.phone, agent.email].filter(Boolean).join(' · ')}
              </span>
              <span className="text-note">
                {agent.roles
                  .filter((item) => item.status !== 'disabled')
                  .map((item) => item.role_label)
                  .join(', ')}
              </span>
              <span className="text-note text-muted">
                {labels.columns.lastLogin} :{' '}
                {agent.last_login_at === null
                  ? labels.never
                  : formatTimestampDate(agent.last_login_at)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge domain="access" status={agent.status} />
              <ActionMenu label={labels.rowActions(agent.name)} items={actions(agent)} />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.caption}</CardTitle>
        <Button
          size="sm"
          onClick={() => {
            setDialog({ name: 'invite' });
          }}
        >
          <UserPlus aria-hidden="true" />
          {labels.invite}
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-[1fr_200px]">
          <FormField id="agents-search" label={labels.search}>
            <Input
              id="agents-search"
              type="search"
              placeholder={labels.searchPlaceholder}
              value={typed}
              onChange={(event) => {
                setTyped(event.target.value);
              }}
            />
          </FormField>
          <FormField id="agents-status" label={labels.status}>
            <Select
              id="agents-status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
              }}
            >
              {Object.entries(labels.statuses).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        {body}
      </CardContent>
      {dialog?.name === 'invite' ? (
        <InviteDialog
          scope={scope}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.name === 'roles' ? (
        <RolesDialog
          scope={scope}
          agent={dialog.agent}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.name === 'disable' ? (
        <DisableDialog
          scope={scope}
          agent={dialog.agent}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
    </Card>
  );
}
