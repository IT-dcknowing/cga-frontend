import { useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { FormDialog } from '@/components/shared/form-dialog';
import { Button } from '@/components/ui/button';
import { fieldProps } from '@/components/ui/field-props';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/session/auth-context';
import {
  exportKeys,
  exportsApi,
  isFinished,
  listPermission,
  type ExportFilters,
  type ExportPeriodQuery,
  type ExportRecord,
  type ExportSpace,
  type ExportType,
} from '@/features/exports/api/exports-api';
import { todayIso, type ExportPeriodDefault } from '@/features/exports/lib/period';
import { ApiBusinessError, ApiValidationError } from '@/lib/api-errors';
import { config } from '@/lib/config';
import { startDownload } from '@/lib/download';
import { formatNumber } from '@/lib/format';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';
import { permissionCodes } from '@/lib/reference/permissions';

/*
 * Bouton « Exporter » d'une liste (F-EXP-01, RG-GEN-03, étape 8.6, 04-UX-UI §6 « DataTable ») :
 * - visible avec `exports.run` et le droit de la liste exportée (RG-SEC-06) ; le serveur refait le
 *   contrôle et ne lit que les filtres connus de la liste ;
 * - modale : filtres de la liste repris, période facultative (un mois, une année, deux dates) ;
 * - export en tâche de fond (03-APPFLOW §7) : bouton désactivé avec indicateur, relecture de
 *   l'avancement, téléchargement et toast à la fin ; si la personne quitte la page, la notification
 *   « Export prêt » de la cloche prend le relais.
 */
const text = fr.exports;

type Choice = 'whole' | ExportPeriodDefault['kind'];

const MONTH = /^\d{4}-\d{2}$/;
const YEAR = /^\d{4}$/;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

type ExportDialogProps = {
  space: ExportSpace;
  type: ExportType;
  filters: ExportFilters;
  summary: string[];
  ignored: string[];
  defaultPeriod?: ExportPeriodDefault;
  onClose: () => void;
  onRequested: (created: ExportRecord) => void;
};

function ExportDialog({
  space,
  type,
  filters,
  summary,
  ignored,
  defaultPeriod,
  onClose,
  onRequested,
}: ExportDialogProps) {
  const list = text.lists[type];
  const today = todayIso();
  const [choice, setChoice] = useState<Choice>(defaultPeriod?.kind ?? 'whole');
  const [month, setMonth] = useState(
    defaultPeriod?.kind === 'month' ? defaultPeriod.month : today.slice(0, 7),
  );
  const [year, setYear] = useState(
    defaultPeriod?.kind === 'year' ? defaultPeriod.year : today.slice(0, 4),
  );
  const [from, setFrom] = useState(defaultPeriod?.kind === 'custom' ? defaultPeriod.from : '');
  const [to, setTo] = useState(defaultPeriod?.kind === 'custom' ? defaultPeriod.to : '');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [conflict, setConflict] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function period(): ExportPeriodQuery | null {
    switch (choice) {
      case 'month':
        return { period: 'month', date: `${month}-01` };
      case 'year':
        return { period: 'year', date: `${year}-01-01` };
      case 'custom':
        return { period: 'custom', from, to };
      default:
        return null;
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConflict(null);
    // Contrôle de confort : le serveur refait toute la validation de la période.
    if (choice === 'month' && !MONTH.test(month)) {
      setErrors({ date: text.dialog.monthInvalid });

      return;
    }
    if (choice === 'year' && !YEAR.test(year)) {
      setErrors({ date: text.dialog.yearInvalid });

      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      onRequested(await exportsApi.request(space, { type, period: period(), filters }));
    } catch (caught) {
      if (caught instanceof ApiValidationError) {
        const {
          period: periodError,
          date,
          from: fromError,
          to: toError,
          ...others
        } = caught.fields;

        setErrors({ period: periodError, date, from: fromError, to: toError });
        setConflict(Object.values(others).at(0) ?? null);
      } else if (caught instanceof ApiBusinessError) {
        setConflict(caught.message);
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
      title={text.dialog.title(list.label)}
      description={text.dialog.description}
      submitLabel={text.dialog.submit}
      submitting={submitting}
      onSubmit={(event) => void submit(event)}
      conflict={conflict}
    >
      {summary.length > 0 ? (
        <div className="grid gap-1">
          <p className="text-label font-semibold text-muted">{text.dialog.filters}</p>
          <p>{summary.join(' · ')}</p>
        </div>
      ) : null}
      {ignored.length > 0 ? (
        <p className="text-note text-muted">{text.dialog.ignored(ignored.join(', '))}</p>
      ) : null}
      <FormField
        id="export-period"
        label={text.dialog.period}
        hint={list.periodOn}
        error={errors.period}
      >
        <Select
          {...fieldProps('export-period', errors.period, true)}
          value={choice}
          onChange={(event) => {
            setChoice(event.target.value as Choice);
            setErrors({});
          }}
        >
          <option value="whole">{list.whole}</option>
          <option value="month">{text.dialog.choices.month}</option>
          <option value="year">{text.dialog.choices.year}</option>
          <option value="custom">{text.dialog.choices.custom}</option>
        </Select>
      </FormField>
      {choice === 'month' ? (
        <TextField
          id="export-month"
          type="month"
          label={text.dialog.month}
          required
          max={today.slice(0, 7)}
          value={month}
          error={errors.date}
          onChange={(event) => {
            setMonth(event.target.value);
          }}
        />
      ) : null}
      {choice === 'year' ? (
        <TextField
          id="export-year"
          label={text.dialog.year}
          required
          inputMode="numeric"
          maxLength={4}
          value={year}
          error={errors.date}
          onChange={(event) => {
            setYear(event.target.value);
          }}
        />
      ) : null}
      {choice === 'custom' ? (
        <div className="flex flex-wrap gap-3">
          <TextField
            id="export-from"
            type="date"
            label={text.dialog.from}
            required
            className="w-44"
            max={today}
            value={from}
            error={errors.from}
            onChange={(event) => {
              setFrom(event.target.value);
            }}
          />
          <TextField
            id="export-to"
            type="date"
            label={text.dialog.to}
            required
            className="w-44"
            min={from === '' ? undefined : from}
            value={to}
            error={errors.to}
            onChange={(event) => {
              setTo(event.target.value);
            }}
          />
        </div>
      ) : null}
    </FormDialog>
  );
}

type ExportButtonProps = {
  space: ExportSpace;
  type: ExportType;
  /** Filtres de la liste affichée que le serveur sait appliquer à l'export (décision 0017 §2). */
  filters?: ExportFilters;
  /** Les mêmes filtres en clair, rappelés dans la modale. */
  summary?: string[];
  /**
   * Filtres actifs à l'écran que l'export ne sait pas appliquer : signalés dans la modale, l'export
   * portant alors sur une liste plus large que l'écran.
   */
  ignored?: string[];
  defaultPeriod?: ExportPeriodDefault;
  /** Libellé du bouton, « Exporter » par défaut. */
  label?: string;
};

export function ExportButton({
  space,
  type,
  filters = {},
  summary = [],
  ignored = [],
  defaultPeriod,
  label = text.action,
}: ExportButtonProps) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  // Plus de toast ni de téléchargement une fois la page quittée : la cloche prévient.
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;

    return () => {
      alive.current = false;
    };
  }, []);

  const permission = listPermission(space, type);

  if (permission === null || !can(permissionCodes.cga.exports) || !can(permission)) {
    return null;
  }

  async function follow(created: ExportRecord) {
    setRunning(true);
    let current = created;

    try {
      while (!isFinished(current)) {
        await wait(config.exportPollMs);
        if (!alive.current) {
          return;
        }
        current = await exportsApi.show(space, current.id);
      }
      if (!alive.current) {
        return;
      }
      void queryClient.invalidateQueries({ queryKey: exportKeys.all });
      const file = current.file;

      if (current.status === 'done' && file !== null) {
        startDownload(file.url);
        toast.success(
          text.ready(file.name, text.rows(current.rows_count, formatNumber(current.rows_count))),
          {
            action: {
              label: text.download,
              onClick: () => {
                startDownload(file.url);
              },
            },
          },
        );
      } else {
        toast.error(text.failed);
      }
    } catch (error) {
      if (alive.current) {
        toastUnexpectedError(error);
      }
    } finally {
      if (alive.current) {
        setRunning(false);
      }
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        loading={running}
        onClick={() => {
          setOpen(true);
        }}
      >
        {running ? null : <FileSpreadsheet aria-hidden="true" />}
        {running ? text.running : label}
      </Button>
      {open ? (
        <ExportDialog
          space={space}
          type={type}
          filters={filters}
          summary={summary}
          ignored={ignored}
          defaultPeriod={defaultPeriod}
          onClose={() => {
            setOpen(false);
          }}
          onRequested={(created) => {
            setOpen(false);
            void follow(created);
          }}
        />
      ) : null}
    </>
  );
}
