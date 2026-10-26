import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileField } from '@/components/ui/file-field';
import { TextField } from '@/components/ui/text-field';
import {
  httpMemberImportsApi as importsApi,
  XLSX,
  type ImportBatch,
  type ImportPreview,
} from '@/features/members/api/imports-api';
import { memberKeys } from '@/features/members/api/queries';
import { PortfolioBadge } from '@/features/members/components/portfolio-badge';
import { memberRoutes } from '@/features/members/lib/member';
import { ApiBusinessError, ApiValidationError } from '@/lib/api-errors';
import { config } from '@/lib/config';
import { saveBlob } from '@/lib/download';
import { formatNumber, formatTimestamp } from '@/lib/format';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';

/*
 * `/cga/imports/adherents` (F-IMP-02, 03-APPFLOW §4.3) : télécharger le modèle → déposer le fichier
 * → numéro de départ de la séquence (proposé par le serveur) → « Analyser » → aperçu (importables,
 * brouillons, rejetées avec motifs ; ancien n° → n° CGA Connect) → « Importer » → progression →
 * rapport. Rien n'est écrit avant « Importer » ; le serveur refait chaque contrôle.
 */
const labels = fr.members.import;

const importKeys = {
  list: ['imports', 'members'] as const,
  batch: (id: string) => ['imports', 'batch', id] as const,
};

function finished(batch: ImportBatch | undefined): boolean {
  return batch !== undefined && (batch.status === 'done' || batch.status === 'failed');
}

function PreviewTable({ preview }: { preview: ImportPreview }) {
  const columns = labels.columns;

  return (
    <div className="overflow-x-auto">
      <table aria-label={labels.caption} className="w-full text-table">
        <thead className="border-b border-border text-left text-label text-muted">
          <tr>
            <th className="px-3 py-2 font-semibold">{columns.row}</th>
            <th className="px-3 py-2 font-semibold">{columns.label}</th>
            <th className="px-3 py-2 font-semibold">{columns.legacyNumber}</th>
            <th className="px-3 py-2 font-semibold">{columns.number}</th>
            <th className="px-3 py-2 font-semibold">{columns.portfolio}</th>
            <th className="px-3 py-2 font-semibold">{columns.status}</th>
            <th className="px-3 py-2 font-semibold">{columns.messages}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {preview.rows.map((row) => (
            <tr key={row.row}>
              <td className="px-3 py-2">{row.row}</td>
              <td className="px-3 py-2 font-semibold">{row.label ?? fr.table.none}</td>
              <td className="px-3 py-2">{row.legacy_number ?? fr.table.none}</td>
              <td className="px-3 py-2 font-mono">{row.number ?? fr.table.none}</td>
              <td className="px-3 py-2">
                {row.portfolio === null ? (
                  fr.table.none
                ) : (
                  <PortfolioBadge portfolio={row.portfolio} />
                )}
              </td>
              <td className="px-3 py-2">
                <StatusBadge domain="importRow" status={row.status} />
              </td>
              <td className="px-3 py-2 text-note text-muted">
                {row.messages.length === 0 ? fr.table.none : row.messages.join(' ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Progress({ batch, onAgain }: { batch: ImportBatch; onAgain: () => void }) {
  const total = Math.max(batch.total_rows, 1);
  const percent = Math.round((batch.processed_rows / total) * 100);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge domain="importBatch" status={batch.status} />
        <span className="text-table">
          {labels.progress(formatNumber(batch.processed_rows), formatNumber(batch.total_rows))}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={labels.steps.progress}
        className="h-2 overflow-hidden rounded-badge bg-neutral-soft"
      >
        <div className="h-full bg-primary" style={{ width: `${String(percent)}%` }} />
      </div>
      {batch.status === 'done' ? (
        <Banner tone="success" role="status">
          {labels.done(
            formatNumber(batch.imported_rows),
            formatNumber(batch.draft_rows),
            formatNumber(batch.rejected_rows),
          )}
        </Banner>
      ) : null}
      {batch.status === 'failed' ? (
        <Banner tone="danger" role="alert">
          {labels.failed}
        </Banner>
      ) : null}
      {finished(batch) ? (
        <div className="flex flex-wrap gap-2">
          {batch.report !== null ? (
            <Button variant="secondary" asChild>
              <a href={batch.report.url} target="_blank" rel="noreferrer">
                <Download aria-hidden="true" />
                {labels.report}
              </a>
            </Button>
          ) : null}
          <Button asChild>
            <Link to={memberRoutes.list}>{labels.seeMembers}</Link>
          </Button>
          <Button variant="secondary" onClick={onAgain}>
            {labels.again}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function History() {
  const history = useQuery({ queryKey: importKeys.list, queryFn: () => importsApi.list() });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.history}</CardTitle>
      </CardHeader>
      <CardContent>
        {history.isError ? (
          <Banner
            tone="danger"
            action={
              <Button variant="secondary" size="sm" onClick={() => void history.refetch()}>
                {fr.common.retry}
              </Button>
            }
          >
            {labels.loadError}
          </Banner>
        ) : history.data !== undefined && history.data.items.length === 0 ? (
          <EmptyState icon={FileSpreadsheet}>{labels.historyEmpty}</EmptyState>
        ) : (
          <ul aria-label={labels.history} className="divide-y divide-border">
            {(history.data?.items ?? []).map((batch) => (
              <li
                key={batch.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5"
              >
                <span className="text-table">
                  {labels.historyLine(
                    batch.created_at === null ? fr.table.none : formatTimestamp(batch.created_at),
                    batch.file_name,
                    batch.created_by?.name ?? fr.table.none,
                  )}
                </span>
                <span className="flex items-center gap-2">
                  <StatusBadge domain="importBatch" status={batch.status} />
                  {batch.report !== null ? (
                    <a
                      className="text-note font-semibold text-primary underline"
                      href={batch.report.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {labels.report}
                    </a>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function MemberImportPage() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [startNumber, setStartNumber] = useState('');
  const [errors, setErrors] = useState<{ file?: string; start_number?: string }>({});
  const [conflict, setConflict] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState<'template' | 'preview' | 'start' | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const batch = useQuery({
    queryKey: importKeys.batch(batchId ?? ''),
    queryFn: () => importsApi.get(batchId ?? ''),
    enabled: batchId !== null,
    // Avancement lu tant que la file « imports » traite le fichier.
    refetchInterval: (query) => (finished(query.state.data) ? false : config.importPollMs),
  });

  const done = finished(batch.data);

  // Import terminé : la liste des adhérents et l'historique des imports se rechargent.
  useEffect(() => {
    if (done) {
      void queryClient.invalidateQueries({ queryKey: memberKeys.lists });
      void queryClient.invalidateQueries({ queryKey: importKeys.list });
    }
  }, [done, queryClient]);

  function failed(error: unknown) {
    if (error instanceof ApiBusinessError) {
      setConflict(error.message);
    } else if (error instanceof ApiValidationError) {
      setErrors({ file: error.fields.file, start_number: error.fields.start_number });
    } else {
      toastUnexpectedError(error);
    }
  }

  function startValue(): number | null {
    const trimmed = startNumber.trim();

    return trimmed === '' ? null : Number.parseInt(trimmed, 10);
  }

  async function downloadTemplate() {
    setBusy('template');

    try {
      const { blob, fileName } = await importsApi.template();

      saveBlob(blob, fileName);
    } catch (error) {
      toastUnexpectedError(error);
    } finally {
      setBusy(null);
    }
  }

  async function analyze() {
    setConflict(null);
    setErrors({});

    if (file === null) {
      setErrors({ file: labels.fileRequired });

      return;
    }

    if (startNumber.trim() !== '' && !/^\d+$/.test(startNumber.trim())) {
      setErrors({ start_number: fr.members.create.errors.number });

      return;
    }

    setBusy('preview');

    try {
      const result = await importsApi.preview(file, startValue());

      setPreview(result);
      setStartNumber(String(result.start_number));
    } catch (error) {
      setPreview(null);
      failed(error);
    } finally {
      setBusy(null);
    }
  }

  async function start() {
    if (file === null) {
      return;
    }

    setConflict(null);
    setBusy('start');

    try {
      const started = await importsApi.start(file, startValue());

      queryClient.setQueryData(importKeys.batch(started.id), started);
      setBatchId(started.id);
      toast.success(labels.started);
    } catch (error) {
      failed(error);
    } finally {
      setBusy(null);
    }
  }

  function again() {
    setBatchId(null);
    setPreview(null);
    setFile(null);
    setFileKey((key) => key + 1);
    setStartNumber('');
  }

  const summary = labels.summary;
  const importable = preview === null ? 0 : preview.importable + preview.drafts;

  return (
    <>
      <PageHeader
        title={labels.title}
        breadcrumb={<Link to={memberRoutes.list}>{fr.nav.members}</Link>}
      />

      <div className="grid gap-4">
        {conflict !== null ? (
          <Banner tone="danger" role="alert">
            {conflict}
          </Banner>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{labels.steps.template}</CardTitle>
            <Button
              variant="secondary"
              size="sm"
              loading={busy === 'template'}
              onClick={() => void downloadTemplate()}
            >
              <Download aria-hidden="true" />
              {labels.downloadTemplate}
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-note text-muted">{labels.templateHint}</p>
          </CardContent>
        </Card>

        {batchId === null ? (
          <Card>
            <CardHeader>
              <CardTitle>{labels.steps.file}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <FileField
                key={fileKey}
                id="import-file"
                label={labels.file}
                required
                hint={labels.fileHint}
                accept={XLSX}
                error={errors.file}
                disabled={busy !== null}
                onChange={(chosen) => {
                  setFile(chosen);
                  setPreview(null);
                }}
              />
              <TextField
                id="import-start-number"
                label={labels.startNumber}
                inputMode="numeric"
                hint={
                  preview === null
                    ? undefined
                    : labels.startNumberHint(String(preview.proposed_start_number))
                }
                error={errors.start_number}
                disabled={busy !== null}
                value={startNumber}
                onChange={(event) => {
                  setStartNumber(event.target.value);
                  setPreview(null);
                }}
              />
              <div className="md:col-span-2">
                <Button
                  loading={busy === 'preview'}
                  disabled={busy !== null}
                  onClick={() => void analyze()}
                >
                  <FileSpreadsheet aria-hidden="true" />
                  {labels.analyze}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {preview !== null && batchId === null ? (
          <Card>
            <CardHeader>
              <CardTitle>{labels.steps.preview}</CardTitle>
              <Button
                loading={busy === 'start'}
                disabled={busy !== null || importable === 0}
                onClick={() => void start()}
              >
                <Upload aria-hidden="true" />
                {labels.start}
              </Button>
            </CardHeader>
            <CardContent className="grid gap-4">
              <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {(
                  [
                    [summary.total, preview.total],
                    [summary.importable, preview.importable],
                    [summary.drafts, preview.drafts],
                    [summary.rejected, preview.rejected],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="rounded-card border border-border p-3">
                    <dt className="text-label text-muted">{label}</dt>
                    <dd className="text-kpi font-extrabold">{formatNumber(value)}</dd>
                  </div>
                ))}
              </dl>
              {importable === 0 ? (
                <Banner tone="warning">{labels.nothing}</Banner>
              ) : (
                <p className="text-note text-muted">{labels.paidNote}</p>
              )}
              <PreviewTable preview={preview} />
            </CardContent>
          </Card>
        ) : null}

        {batch.data !== undefined && batchId !== null ? (
          <Card>
            <CardHeader>
              <CardTitle>{labels.steps.progress}</CardTitle>
            </CardHeader>
            <CardContent>
              <Progress batch={batch.data} onAgain={again} />
            </CardContent>
          </Card>
        ) : null}

        <History />
      </div>
    </>
  );
}
