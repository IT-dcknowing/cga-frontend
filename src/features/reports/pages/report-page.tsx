import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, FileCheck2, Send, Sparkles, Stamp, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  reportKeys,
  reportsApi,
  type ReportChanges,
  type ReportDetail,
} from '@/features/reports/api/reports-api';
import {
  AcknowledgeDialog,
  CorrectDialog,
  PreviewDialog,
  TransmitDialog,
} from '@/features/reports/components/report-dialogs';
import {
  PeopleTaxesTable,
  ReportField,
  Section,
  SectionProgress,
  StatesSection,
  VersionsList,
} from '@/features/reports/components/report-sections';
import { DeadlineBanner } from '@/features/reports/components/report-indicators';
import { reportRoutes } from '@/features/reports/lib/routes';
import { ApiBusinessError, ApiValidationError } from '@/lib/api-errors';
import { formatDate, formatTimestampDate } from '@/lib/format';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';

/*
 * `/cga/rapports/:id` (F-RPT-02 à 07, 03-APPFLOW §4.3, étape 5.8) : bandeau d'échéance (orange après
 * la date limite, rouge après l'échéance réglementaire), avancement par section, sections dépliables —
 * 1 à 3 rappellent la fiche permanente (section 1 : date du rapport et direction régionale ; section 2 :
 * impôts du trimestre par dirigeant), 4 et 6 enregistrées en quittant chaque champ (nombres de SMT et
 * bilans proposés par la campagne de clôture), 5 en lecture (états du portefeuille CGA, anomalies) —,
 * « Prévisualiser », « Générer le rapport », transmission, accusé, correction et versions, selon le bloc
 * `can` du serveur.
 */
const labels = fr.reports;

type Dialog = 'preview' | 'transmit' | 'acknowledge' | 'correct';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function ReportView({ report }: { report: ReportDetail }) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [generating, setGenerating] = useState(false);
  const [proposing, setProposing] = useState(false);
  const disabled = !report.can.update;

  async function save(changes: ReportChanges) {
    setSaveState('saving');
    try {
      const updated = await reportsApi.save(report.id, changes);

      queryClient.setQueryData(reportKeys.detail(report.id), updated);
      await queryClient.invalidateQueries({ queryKey: reportKeys.list });
      setSaveState('saved');
    } catch (error) {
      setSaveState('error');
      if (error instanceof ApiValidationError) {
        toast.error(Object.values(error.fields)[0] ?? labels.saveError);
      } else if (error instanceof ApiBusinessError) {
        toast.error(error.message);
      } else {
        toastUnexpectedError(error);
      }
    }
  }

  async function proposeSynthesis() {
    setProposing(true);
    try {
      const preview = await queryClient.fetchQuery({
        queryKey: reportKeys.preview(report.id),
        queryFn: () => reportsApi.preview(report.id),
      });

      if (preview.synthesis !== null) {
        await save({ qualitative_analysis: { synthesis: preview.synthesis } });
        toast.success(labels.synthesis.proposed);
      }
    } catch {
      toast.error(labels.synthesis.error);
    } finally {
      setProposing(false);
    }
  }

  async function generate() {
    setGenerating(true);
    try {
      const updated = await reportsApi.generate(report.id);

      queryClient.setQueryData(reportKeys.detail(report.id), updated);
      await queryClient.invalidateQueries({ queryKey: reportKeys.all });
      toast.success(labels.actions.generated(String(updated.current_version)));
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        toast.error(error.message);
      } else {
        toastUnexpectedError(error);
      }
    } finally {
      setGenerating(false);
    }
  }

  function contentField(key: string) {
    const integer = labels.numberFields.includes(key);
    const proposal =
      report.closing_proposals?.[key as keyof NonNullable<ReportDetail['closing_proposals']>];

    return (
      <ReportField
        key={`${key}-${String(report.content[key] ?? '')}`}
        id={`report-${key}`}
        label={labels.fields[key] ?? key}
        kind={integer ? 'integer' : 'text'}
        value={report.content[key] ?? null}
        disabled={disabled}
        hint={integer ? undefined : labels.nothingHint}
        onCommit={(value) => void save({ content: { [key]: value } })}
      >
        {integer && proposal !== undefined && report.closing_proposals !== null ? (
          <span className="flex flex-wrap items-center gap-2 text-note text-muted">
            {labels.proposal(String(proposal), String(report.closing_proposals.fiscal_year))}
            {disabled || report.content[key] === proposal ? null : (
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => void save({ content: { [key]: proposal } })}
              >
                {labels.useProposal}
              </Button>
            )}
          </span>
        ) : null}
      </ReportField>
    );
  }

  return (
    <div className="grid gap-4">
      <DeadlineBanner
        deadline={report.deadline}
        legalDeadline={report.legal_deadline}
        isLate={report.is_late}
        isLegallyLate={report.is_legally_late}
      />

      <Card>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <StatusBadge domain="report" status={report.status} />
              <span className="text-note text-muted" role="status">
                {saveState === 'saving'
                  ? labels.saving
                  : saveState === 'saved'
                    ? labels.saved
                    : saveState === 'error'
                      ? labels.saveError
                      : ''}
              </span>
            </span>
            <span className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setDialog('preview');
                }}
              >
                <Eye aria-hidden="true" />
                {labels.actions.preview}
              </Button>
              {report.can.update ? (
                <Button
                  disabled={!report.can.generate || generating}
                  onClick={() => void generate()}
                >
                  <FileCheck2 aria-hidden="true" />
                  {labels.actions.generate}
                </Button>
              ) : null}
              {report.can.transmit ? (
                <Button
                  onClick={() => {
                    setDialog('transmit');
                  }}
                >
                  <Send aria-hidden="true" />
                  {labels.actions.transmit}
                </Button>
              ) : null}
              {report.can.acknowledge ? (
                <Button
                  onClick={() => {
                    setDialog('acknowledge');
                  }}
                >
                  <Stamp aria-hidden="true" />
                  {labels.actions.acknowledge}
                </Button>
              ) : null}
              {report.can.correct ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setDialog('correct');
                  }}
                >
                  <Undo2 aria-hidden="true" />
                  {labels.actions.correct}
                </Button>
              ) : null}
            </span>
          </div>
          {report.can.update && !report.can.generate ? (
            <p className="text-note text-muted">{labels.actions.generateHint}</p>
          ) : null}
          {disabled ? <p className="text-note text-muted">{labels.readOnly}</p> : null}
          <SectionProgress completeness={report.completeness} />
          {report.transmission === null ? null : (
            <p className="text-note">
              {labels.transmission(
                formatTimestampDate(report.transmission.transmitted_at),
                report.transmission.mode_label ?? '—',
                report.transmission.by ?? '—',
              )}
            </p>
          )}
          {report.acknowledgement === null ? null : (
            <p className="flex flex-wrap items-center gap-2 text-note">
              {labels.acknowledgement(
                formatDate(report.acknowledgement.date),
                report.acknowledgement.reference ?? '—',
              )}
              {report.acknowledgement.file === null ? null : (
                <Button variant="link" size="sm" asChild>
                  <a href={report.acknowledgement.file.url} target="_blank" rel="noreferrer">
                    <Download aria-hidden="true" />
                    {labels.acknowledgementFile}
                  </a>
                </Button>
              )}
            </p>
          )}
        </CardContent>
      </Card>

      <Section title={labels.sections.section_1} percent={report.completeness.section_1}>
        <ProfileReminder />
        <div className="grid gap-3 sm:grid-cols-2">
          <ReportField
            key={`date-${report.report_date ?? ''}`}
            id="report-date"
            label={labels.reportDate}
            kind="date"
            value={report.report_date}
            disabled={disabled}
            onCommit={(value) => void save({ report_date: value as string | null })}
          />
          <ReportField
            key={`dr-${report.regional_directorate_label ?? ''}`}
            id="report-regional-directorate"
            label={labels.regionalDirectorate}
            kind="line"
            value={report.regional_directorate_label}
            disabled={disabled}
            onCommit={(value) => void save({ regional_directorate_label: value as string | null })}
          />
        </div>
      </Section>

      <Section title={labels.sections.section_2} percent={report.completeness.section_2}>
        <ProfileReminder />
        <PeopleTaxesTable
          key={JSON.stringify(report.people_taxes)}
          report={report}
          disabled={disabled}
          onCommit={(rows) => void save({ people_taxes: rows })}
        />
      </Section>

      <Section title={labels.sections.section_3} percent={report.completeness.section_3}>
        <ProfileReminder />
      </Section>

      <Section title={labels.sections.section_4} percent={report.completeness.section_4}>
        <div className="grid gap-3 sm:grid-cols-2">
          {labels.sectionFields.section_4.map((key) => contentField(key))}
        </div>
      </Section>

      <Section title={labels.sections.section_5} percent={report.completeness.section_5}>
        <StatesSection reportId={report.id} />
      </Section>

      <Section title={labels.sections.section_6} percent={report.completeness.section_6}>
        <div className="grid gap-3 sm:grid-cols-2">
          {labels.sectionFields.section_6.map((key) => contentField(key))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold">{labels.qualitative.title}</p>
          {disabled ? null : (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={proposing}
              onClick={() => void proposeSynthesis()}
            >
              <Sparkles aria-hidden="true" />
              {labels.synthesis.propose}
            </Button>
          )}
        </div>
        {disabled ? null : <p className="text-note text-muted">{labels.synthesis.hint}</p>}
        <div className="grid gap-3">
          {(['synthesis', 'highlights', 'outlook'] as const).map((key) => (
            <ReportField
              key={`${key}-${report.qualitative_analysis[key] ?? ''}`}
              id={`report-qualitative-${key}`}
              label={labels.qualitative[key]}
              value={report.qualitative_analysis[key] ?? null}
              disabled={disabled}
              required={key === 'synthesis'}
              onCommit={(value) =>
                void save({ qualitative_analysis: { [key]: value as string | null } })
              }
            />
          ))}
        </div>
      </Section>

      <Card>
        <CardHeader>
          <CardTitle>{labels.versions.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <VersionsList reportId={report.id} version={report.current_version} />
        </CardContent>
      </Card>

      {dialog === 'preview' ? (
        <PreviewDialog
          report={report}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      {dialog === 'transmit' ? (
        <TransmitDialog
          report={report}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      {dialog === 'acknowledge' ? (
        <AcknowledgeDialog
          report={report}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      {dialog === 'correct' ? (
        <CorrectDialog
          report={report}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
    </div>
  );
}

function ProfileReminder() {
  return (
    <p className="flex flex-wrap items-center gap-2 text-note text-muted">
      {labels.profileReminder}
      <Link className="font-semibold text-primary underline" to={reportRoutes.permanentProfile}>
        {labels.updateProfile}
      </Link>
    </p>
  );
}

export function ReportPage() {
  const { id = '' } = useParams();
  const query = useQuery({ queryKey: reportKeys.detail(id), queryFn: () => reportsApi.show(id) });

  return (
    <>
      <PageHeader
        title={query.data?.label ?? labels.title}
        breadcrumb={<Link to={reportRoutes.list}>{labels.back}</Link>}
      />
      {query.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : query.isError ? (
        <Banner
          tone="danger"
          role="alert"
          action={
            <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
              {fr.common.retry}
            </Button>
          }
        >
          {labels.detailError}
        </Banner>
      ) : (
        <ReportView report={query.data} />
      )}
    </>
  );
}
