import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ListX, Plus } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ActionMenu, type ActionMenuItem } from '@/components/shared/action-menu';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { FormDialog } from '@/components/shared/form-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox, CheckboxField } from '@/components/ui/checkbox';
import { fieldProps } from '@/components/ui/field-props';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import {
  referentialCrud,
  type ReferentialItem,
} from '@/features/referentials/api/referential-crud';
import {
  referentialKeys,
  useActiveDirectorates,
} from '@/features/referentials/api/referentials-api';
import { ApiBusinessError } from '@/lib/api-errors';
import { config } from '@/lib/config';
import { formatNumber } from '@/lib/format';
import { showValidationErrors } from '@/lib/form-errors';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';

/*
 * Un référentiel national géré par le CNCGA (F-REF-01 à 04, 03-APPFLOW §3.2) : liste paginée avec
 * recherche, ajout, modification, suppression d'une valeur jamais utilisée, fusion dans une autre
 * valeur (RG-DATA-05), badge « Provisoire » (RG-DATA-01). Chaque référentiel ne fournit que sa
 * définition (champs, lignes) ; le bloc `can` du serveur décide des actions de chaque ligne.
 */
const labels = fr.referentials;

export type FieldDef = {
  name: string;
  label: string;
  type?: 'text' | 'integer' | 'date' | 'directorate' | 'checkbox';
  required?: boolean;
  hint?: string;
};

export type ReferentialDef<T extends ReferentialItem> = {
  /** Segment de l'API : `/referentials/{uri}`. */
  uri: string;
  title: string;
  /** Nom d'une valeur dans les messages (« le secteur »…). */
  noun: string;
  sort: string;
  searchable: boolean;
  mergeable: boolean;
  fields: FieldDef[];
  primary: (item: T) => string;
  secondary: (item: T) => (string | null)[];
  badges?: (item: T) => ReactNode;
  /** Fusion permise depuis cette valeur (un secteur proposé, une valeur active…). */
  canMerge?: (item: T) => boolean;
  /** Valeurs cibles d'une fusion : même référentiel, et le filtre propre au référentiel. */
  mergeTargets?: (item: T, candidates: T[]) => T[];
  formOf: (item: T | null) => Record<string, string | boolean>;
};

type FormValues = Record<string, string | boolean>;

/** Saisie convertie pour l'API : texte vide → `null`, entier, booléen. */
function inputOf(fields: FieldDef[], values: FormValues): Record<string, unknown> {
  return Object.fromEntries(
    fields.map(({ name, type = 'text' }) => {
      const value = values[name];

      if (type === 'checkbox') {
        return [name, value === true];
      }

      const text = String(value).trim();

      if (text === '') {
        return [name, null];
      }

      return [name, type === 'integer' ? Number.parseInt(text, 10) : text];
    }),
  );
}

function EditDialog<T extends ReferentialItem>({
  def,
  item,
  onClose,
}: {
  def: ReferentialDef<T>;
  item: T | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const directorates = useActiveDirectorates();
  const [conflict, setConflict] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: def.formOf(item) });
  const required = fr.members.create.errors.required;

  const submit = handleSubmit(async (values) => {
    let invalid = false;

    for (const { name, type = 'text', required: needed } of def.fields) {
      const text = String(values[name]).trim();

      if (needed === true && type !== 'checkbox' && text === '') {
        setError(name, { message: required });
        invalid = true;
      } else if (type === 'integer' && text !== '' && !/^\d+$/.test(text)) {
        setError(name, { message: labels.integer });
        invalid = true;
      }
    }

    if (invalid) {
      return;
    }

    setConflict(null);

    try {
      await referentialCrud.save(def.uri, item?.id ?? null, inputOf(def.fields, values));
      toast.success(item === null ? labels.created : labels.saved);
      await queryClient.invalidateQueries({ queryKey: referentialKeys.all });
      onClose();
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        setConflict(error.message);
      } else if (
        !showValidationErrors(
          error,
          setError,
          Object.fromEntries(def.fields.map(({ name }) => [name, name])),
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
      title={item === null ? labels.createTitle(def.noun) : labels.editTitle(def.noun)}
      submitLabel={labels.submit}
      submitting={isSubmitting}
      onSubmit={submit}
      conflict={conflict}
    >
      {def.fields.map(({ name, label, type = 'text', required: needed, hint }) => {
        const id = `referential-${name}`;
        const error = errors[name]?.message;

        if (type === 'checkbox') {
          return (
            <CheckboxField key={name} id={id} label={label} error={error}>
              <Checkbox id={id} {...register(name)} />
            </CheckboxField>
          );
        }

        if (type === 'directorate') {
          return (
            <FormField key={name} id={id} label={label} required={needed} error={error}>
              <Select {...fieldProps(id, error)} aria-required={needed} {...register(name)}>
                <option value="">{labels.none}</option>
                {(directorates.data ?? []).map((directorate) => (
                  <option key={directorate.id} value={directorate.id}>
                    {directorate.name}
                  </option>
                ))}
              </Select>
            </FormField>
          );
        }

        return (
          <TextField
            key={name}
            id={id}
            type={type === 'date' ? 'date' : 'text'}
            inputMode={type === 'integer' ? 'numeric' : undefined}
            label={label}
            required={needed}
            hint={hint}
            error={error}
            {...register(name)}
          />
        );
      })}
    </FormDialog>
  );
}

function MergeDialog<T extends ReferentialItem>({
  def,
  item,
  onClose,
}: {
  def: ReferentialDef<T>;
  item: T;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [conflict, setConflict] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const candidates = useQuery({
    queryKey: [...referentialKeys.all, def.uri, 'merge', search],
    queryFn: () => referentialCrud.options<T>(def.uri, search, def.sort),
  });
  const targets = (def.mergeTargets ?? ((_, list: T[]) => list))(
    item,
    (candidates.data ?? []).filter((candidate) => candidate.id !== item.id),
  );
  const text = labels.merge;

  async function submit() {
    if (target === '') {
      setError(fr.members.create.errors.required);

      return;
    }

    setSubmitting(true);
    setConflict(null);

    try {
      await referentialCrud.merge(def.uri, item.id, target);
      toast.success(text.done);
      await queryClient.invalidateQueries({ queryKey: referentialKeys.all });
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
          { into_id: 'into_id' },
        )
      ) {
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
      description={def.primary(item)}
      submitLabel={text.submit}
      submitting={submitting}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      conflict={conflict}
      effects={text.effects}
    >
      {def.searchable ? (
        <FormField id="merge-search" label={text.search}>
          <Input
            id="merge-search"
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
        </FormField>
      ) : null}
      <FormField id="merge-target" label={text.target} required error={error}>
        <Select
          {...fieldProps('merge-target', error)}
          aria-required
          value={target}
          onChange={(event) => {
            setTarget(event.target.value);
            setError(undefined);
          }}
        >
          <option value="">{labels.none}</option>
          {targets.map((candidate) => (
            <option key={candidate.id} value={String(candidate.id)}>
              {def.primary(candidate)}
            </option>
          ))}
        </Select>
      </FormField>
    </ConfirmDialog>
  );
}

function DeleteDialog<T extends ReferentialItem>({
  def,
  item,
  onClose,
}: {
  def: ReferentialDef<T>;
  item: T;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [conflict, setConflict] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    setConflict(null);

    try {
      await referentialCrud.remove(def.uri, item.id);
      toast.success(labels.remove.done);
      await queryClient.invalidateQueries({ queryKey: referentialKeys.all });
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
      title={labels.remove.title}
      description={def.primary(item)}
      submitLabel={labels.remove.submit}
      submitting={submitting}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      conflict={conflict}
      effects={labels.remove.effects}
    >
      {null}
    </ConfirmDialog>
  );
}

type Dialog<T> = { name: 'create' } | { name: 'edit' | 'merge' | 'delete'; item: T };

export function ReferentialPanel<T extends ReferentialItem>({
  def,
  canManage,
}: {
  def: ReferentialDef<T>;
  canManage: boolean;
}) {
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog<T> | null>(null);
  const query = useQuery({
    queryKey: [...referentialKeys.all, def.uri, 'manage', search, page],
    queryFn: () => referentialCrud.list<T>(def.uri, { search, page, sort: def.sort }),
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(typed.trim());
      setPage(1);
    }, config.searchDebounceMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [typed]);

  function actions(item: T): ActionMenuItem[] {
    const items: ActionMenuItem[] = [];

    if (item.can.update) {
      items.push({
        label: labels.edit,
        onSelect: () => {
          setDialog({ name: 'edit', item });
        },
      });
    }

    if (def.mergeable && canManage && (def.canMerge?.(item) ?? true)) {
      items.push({
        label: labels.merge.action,
        onSelect: () => {
          setDialog({ name: 'merge', item });
        },
      });
    }

    if (item.can.delete) {
      items.push({
        label: labels.remove.action,
        danger: true,
        onSelect: () => {
          setDialog({ name: 'delete', item });
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
  } else if (query.data.data.length === 0) {
    body = <EmptyState icon={ListX}>{labels.empty}</EmptyState>;
  } else {
    const { current_page: current, last_page: last, total } = query.data.meta;

    body = (
      <>
        <ul aria-label={def.title} className="divide-y divide-border">
          {query.data.data.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <span className="grid gap-0.5">
                <span className="font-semibold">{def.primary(item)}</span>
                <span className="text-note text-muted">
                  {def.secondary(item).filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {def.badges?.(item)}
                <ActionMenu label={labels.rowActions(def.primary(item))} items={actions(item)} />
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 text-note text-muted">
          <span>{labels.count(formatNumber(total))}</span>
          {last > 1 ? (
            <span className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={current <= 1}
                aria-label={labels.previous}
                onClick={() => {
                  setPage(current - 1);
                }}
              >
                <ChevronLeft aria-hidden="true" />
              </Button>
              {labels.page(String(current), String(last))}
              <Button
                variant="secondary"
                size="sm"
                disabled={current >= last}
                aria-label={labels.next}
                onClick={() => {
                  setPage(current + 1);
                }}
              >
                <ChevronRight aria-hidden="true" />
              </Button>
            </span>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{def.title}</CardTitle>
        {canManage ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setDialog({ name: 'create' });
            }}
          >
            <Plus aria-hidden="true" />
            {labels.add}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-3">
        {def.searchable ? (
          <FormField id={`search-${def.uri}`} label={labels.search(def.title)}>
            <Input
              id={`search-${def.uri}`}
              type="search"
              value={typed}
              onChange={(event) => {
                setTyped(event.target.value);
              }}
            />
          </FormField>
        ) : null}
        {body}
      </CardContent>
      {dialog?.name === 'create' || dialog?.name === 'edit' ? (
        <EditDialog
          def={def}
          item={dialog.name === 'edit' ? dialog.item : null}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.name === 'merge' ? (
        <MergeDialog
          def={def}
          item={dialog.item}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.name === 'delete' ? (
        <DeleteDialog
          def={def}
          item={dialog.item}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
    </Card>
  );
}

/** Badge « Provisoire » d'une donnée de référence non encore validée (RG-DATA-01). */
export function DataStatusBadge({ status }: { status: string }) {
  return status === 'validated' ? null : <StatusBadge domain="dataStatus" status={status} />;
}
