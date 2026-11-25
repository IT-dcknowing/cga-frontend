import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { memberRoutes } from '@/features/members/lib/member';
import { ReportCharts } from '@/features/reports/components/report-charts';
import { SourceTag } from '@/features/reports/components/report-indicators';
import {
  reportKeys,
  reportsApi,
  type PeopleTaxes,
  type ReportDetail,
  type ReportDocument,
  type StateGroup,
  type SummarySheet,
} from '@/features/reports/api/reports-api';
import { formatDate, formatTimestampDate } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';
import { cn } from '@/lib/utils';

/*
 * Blocs de `/cga/rapports/:id` (03-APPFLOW §4.3) : section dépliable avec son taux, champ enregistré
 * en quittant la saisie, impôts du trimestre par dirigeant (section 2), états du portefeuille CGA
 * (section 5 : résumé par CDI, adhérents par état, anomalies avec liens vers les dossiers), versions
 * générées et leurs documents.
 */
const labels = fr.reports;

export function Section({
  title,
  percent,
  children,
}: {
  title: string;
  percent: number | undefined;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-card border border-border bg-card" open>
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 font-semibold">
        <span>{title}</span>
        {percent === undefined ? null : (
          <span
            className={cn(
              'text-note',
              percent === 100 ? 'text-primary' : 'font-semibold text-accent-text',
            )}
          >
            {percent} %
          </span>
        )}
      </summary>
      <div className="grid gap-4 border-t border-border px-4 py-4">{children}</div>
    </details>
  );
}

/** Barre d'avancement : une case par section, son taux en clair. */
export function SectionProgress({
  completeness,
}: {
  completeness: Record<string, number | undefined>;
}) {
  return (
    <ol aria-label={labels.progress} className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {Object.entries(labels.sections).map(([key, title]) => {
        const percent = completeness[key] ?? 0;

        return (
          <li
            key={key}
            className="grid gap-1"
            aria-label={labels.sectionProgress(title, String(percent))}
          >
            <span className="truncate text-note text-muted">{title}</span>
            <span className="h-2 overflow-hidden rounded-full bg-neutral-soft" aria-hidden="true">
              <span
                className={cn('block h-full', percent === 100 ? 'bg-primary' : 'bg-accent')}
                style={{ width: `${percent}%` }}
              />
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Champ du rapport enregistré en quittant la saisie, s'il a changé : texte (« Néant » accepté),
 * nombre entier (vide = non renseigné) ou date.
 */
export function ReportField({
  id,
  label,
  value,
  kind = 'text',
  disabled,
  hint,
  required,
  onCommit,
  children,
}: {
  id: string;
  label: string;
  value: string | number | null;
  kind?: 'text' | 'integer' | 'date' | 'line';
  disabled: boolean;
  hint?: string;
  required?: boolean;
  onCommit: (value: string | number | null) => void;
  children?: ReactNode;
}) {
  const initial = value === null ? '' : String(value);
  const [draft, setDraft] = useState(initial);

  function commit() {
    const trimmed = draft.trim();
    const next =
      trimmed === '' ? null : kind === 'integer' ? Number.parseInt(trimmed, 10) : trimmed;

    if ((next === null ? '' : String(next)) !== initial) {
      onCommit(next);
    }
  }

  return (
    <FormField id={id} label={label} hint={hint} required={required}>
      {kind === 'text' ? (
        <Textarea
          id={id}
          rows={2}
          value={draft}
          disabled={disabled}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onBlur={commit}
        />
      ) : (
        <Input
          id={id}
          type={kind === 'integer' ? 'number' : kind === 'date' ? 'date' : 'text'}
          min={kind === 'integer' ? 0 : undefined}
          value={draft}
          disabled={disabled}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onBlur={commit}
        />
      )}
      {children}
    </FormField>
  );
}

const TAXES = ['its', 'igr', 'cnps'] as const;

/** Section 2 : ITS, IGR et CNPS du trimestre pour chaque dirigeant actif. */
export function PeopleTaxesTable({
  report,
  disabled,
  onCommit,
}: {
  report: ReportDetail;
  disabled: boolean;
  onCommit: (rows: PeopleTaxes[]) => void;
}) {
  const text = labels.peopleTaxes;

  if (report.directors.length === 0) {
    return <Banner tone="warning">{text.noDirector}</Banner>;
  }

  const rowOf = (personId: string): PeopleTaxes =>
    report.people_taxes.find((row) => row.person_id === personId) ?? {
      person_id: personId,
      its: null,
      igr: null,
      cnps: null,
    };

  return (
    <div className="grid gap-3">
      <p className="text-note font-semibold">{text.caption}</p>
      {report.directors.map((director) => (
        <div key={director.id} className="grid gap-2 rounded-lg border border-border p-3">
          <span className="font-semibold">
            {director.full_name}
            {director.function_in_cga === null ? '' : ` · ${director.function_in_cga}`}
          </span>
          <div className="grid gap-3 sm:grid-cols-3">
            {TAXES.map((tax) => (
              <ReportField
                key={tax}
                id={`tax-${director.id}-${tax}`}
                label={text.field(text.taxes[tax], director.full_name)}
                kind="integer"
                value={rowOf(director.id)[tax]}
                disabled={disabled}
                onCommit={(value) => {
                  const rows = report.directors.map((person) =>
                    person.id === director.id
                      ? { ...rowOf(person.id), [tax]: value as number | null }
                      : rowOf(person.id),
                  );

                  onCommit(rows);
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const SUMMARY_COLUMNS = ['active_tee', 'active_rme', 'new_total', 'terminated_total'] as const;

/** Feuille Résumé : totaux par CDI, sans nom d'adhérent (section 5, et tableau de synthèse du CNCGA). */
export function SummaryTable({ summary }: { summary: SummarySheet }) {
  const text = labels.states;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-table">
        <caption className="text-left font-semibold">{text.summaryCaption}</caption>
        <thead>
          <tr className="border-b border-border text-left text-muted">
            <th scope="col" className="py-2 pr-3">
              {text.columns.office}
            </th>
            {SUMMARY_COLUMNS.map((column) => (
              <th key={column} scope="col" className="py-2 pr-3 text-right">
                {text.columns[column]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {summary.rows.map((row) => (
            <tr key={row.tax_office?.id ?? 'none'} className="border-b border-border">
              <th scope="row" className="py-2 pr-3 text-left font-normal">
                {row.tax_office?.name ?? text.noOffice}
              </th>
              {SUMMARY_COLUMNS.map((column) => (
                <td key={column} className="py-2 pr-3 text-right">
                  {row[column]}
                </td>
              ))}
            </tr>
          ))}
          <tr className="font-semibold">
            <th scope="row" className="py-2 pr-3 text-left">
              {text.total}
            </th>
            {SUMMARY_COLUMNS.map((column) => (
              <td key={column} className="py-2 pr-3 text-right">
                {summary.totals[column]}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Graphiques des états (section 5), préparés avec l'aperçu du rapport modernisé. */
function StatesCharts({ reportId }: { reportId: string }) {
  const query = useQuery({
    queryKey: reportKeys.preview(reportId),
    queryFn: () => reportsApi.preview(reportId),
  });

  if (query.isPending) {
    return <Skeleton className="h-40 w-full" />;
  }
  if (query.isError) {
    return <p className="text-note text-muted">{labels.charts.loadError}</p>;
  }

  return <ReportCharts charts={query.data.charts} />;
}

/** Section 5 : états du portefeuille CGA, en lecture. */
export function StatesSection({ reportId }: { reportId: string }) {
  const text = labels.states;
  const query = useQuery({
    queryKey: reportKeys.states(reportId),
    queryFn: () => reportsApi.states(reportId),
  });

  if (query.isPending) {
    return <Skeleton className="h-24 w-full" />;
  }
  if (query.isError) {
    return (
      <Banner tone="danger" role="alert">
        {text.loadError}
      </Banner>
    );
  }

  const { sheets, anomalies } = query.data;

  return (
    <div className="grid gap-4">
      <p className="text-note text-muted">{text.intro}</p>
      <SourceTag sources={query.data.sources} />
      <SummaryTable summary={sheets.summary} />
      <StatesCharts reportId={reportId} />
      <ul aria-label={text.sheetsCaption} className="grid gap-1 sm:grid-cols-2">
        {Object.entries(text.sheets).map(([sheet, title]) => {
          const groups = (sheets[sheet] ?? []) as StateGroup[];
          const count = groups.reduce((total, group) => total + (group.totals.count ?? 0), 0);

          return (
            <li key={sheet} className="flex justify-between gap-2 text-note">
              <span>{title}</span>
              <span className="font-semibold">{text.count(String(count))}</span>
            </li>
          );
        })}
      </ul>
      <div className="grid gap-2">
        <p className="text-note font-semibold">{text.anomalies}</p>
        {anomalies.length === 0 ? (
          <p className="text-note text-muted">{text.noAnomaly}</p>
        ) : (
          anomalies.map((anomaly) => (
            <Banner key={anomaly.code} tone="warning">
              <span className="grid gap-1">
                <span>{anomaly.label}</span>
                <span className="flex flex-wrap gap-x-3 gap-y-1">
                  {anomaly.members.map((member) => (
                    <Link
                      key={member.id}
                      className="text-note font-semibold underline"
                      to={memberRoutes.detail(member.id)}
                      aria-label={text.openMember(member.name)}
                    >
                      {member.name}
                    </Link>
                  ))}
                </span>
              </span>
            </Banner>
          ))
        )}
      </div>
    </div>
  );
}

function DocumentLinks({ label, document }: { label: string; document: ReportDocument }) {
  const text = labels.versions;

  if (document === null) {
    return null;
  }
  const files = Object.entries(document.files).filter(([, url]) => url !== null);

  return (
    <span className="flex flex-wrap items-center gap-2 text-note">
      <span className="text-muted">{label}</span>
      {files.length === 0 ? (
        <span className="text-muted">({text.pending})</span>
      ) : (
        files.map(([format, url]) => (
          <Button key={format} variant="link" size="sm" asChild>
            <a href={url as string} target="_blank" rel="noreferrer">
              <Download aria-hidden="true" />
              {`${label} ${text.formats[format] ?? format}`}
            </a>
          </Button>
        ))
      )}
    </span>
  );
}

export function VersionsList({ reportId, version }: { reportId: string; version: number }) {
  const text = labels.versions;
  const query = useQuery({
    queryKey: [...reportKeys.versions(reportId), version],
    queryFn: () => reportsApi.versions(reportId),
  });

  if (query.isPending) {
    return <Skeleton className="h-16 w-full" />;
  }
  if (query.isError) {
    return (
      <Banner tone="danger" role="alert">
        {text.loadError}
      </Banner>
    );
  }
  if (query.data.length === 0) {
    return <p className="text-note text-muted">{text.empty}</p>;
  }

  return (
    <ul aria-label={text.title} className="divide-y divide-border">
      {query.data.map((item) => (
        <li key={item.id} className="grid gap-1 py-3">
          <span className="font-semibold">
            {text.line(
              String(item.version),
              item.generated_at === null ? '—' : formatTimestampDate(item.generated_at),
              item.generated_by ?? '—',
            )}
          </span>
          {item.reason === null ? null : (
            <span className="text-note text-muted">{text.reason(item.reason)}</span>
          )}
          {item.transmitted_at === null ? null : (
            <span className="text-note text-muted">
              {text.transmitted(formatDate(item.transmitted_at.slice(0, 10)))}
            </span>
          )}
          <DocumentLinks label={text.report} document={item.documents.report} />
          <DocumentLinks label={text.workbook} document={item.documents.workbook} />
          <DocumentLinks label={text.slip} document={item.documents.slip} />
        </li>
      ))}
    </ul>
  );
}
