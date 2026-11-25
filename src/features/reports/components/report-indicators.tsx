import { Banner } from '@/components/ui/banner';
import type { ReportStates } from '@/features/reports/api/reports-api';
import { formatDate } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';
import { cn } from '@/lib/utils';

/*
 * Indicateurs du rapport trimestriel (étape 5.12) : `DeadlineBanner` (date limite et échéance
 * réglementaire, orange après la date limite, rouge après l'échéance, RG-RPT-06, 07) et `SourceTag`
 * (origine des chiffres d'affaires et des paiements du trimestre : saisie, import ou Compta Flow,
 * RG-RPT-12).
 */
const labels = fr.reports;

export function DeadlineBanner({
  deadline,
  legalDeadline,
  isLate,
  isLegallyLate,
}: {
  deadline: string;
  legalDeadline: string;
  isLate: boolean;
  isLegallyLate: boolean;
}) {
  return (
    <Banner tone={isLegallyLate ? 'danger' : isLate ? 'warning' : 'success'} role="status">
      <span className="grid gap-0.5">
        <span>{labels.deadline(formatDate(deadline), formatDate(legalDeadline))}</span>
        {isLegallyLate ? (
          <span className="font-semibold">{labels.legallyLate}</span>
        ) : isLate ? (
          <span className="font-semibold">{labels.late}</span>
        ) : null}
      </span>
    </Banner>
  );
}

function describe(counts: Record<string, number>): string {
  const text = labels.sources;
  const entries = Object.entries(counts).filter(([, count]) => count > 0);

  return entries.length === 0
    ? text.none
    : entries
        .map(([source, count]) => text.item(String(count), text.kinds[source] ?? source))
        .join(', ');
}

export function SourceTag({ sources }: { sources: ReportStates['sources'] }) {
  const text = labels.sources;
  const flow = (sources.revenues.compta_flow ?? 0) + (sources.payments.compta_flow ?? 0) > 0;

  return (
    <p
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-note',
        flow ? 'border-info bg-info-soft text-info' : 'border-border text-muted',
      )}
    >
      <span className="font-semibold">{flow ? text.flow : text.manual}</span>
      <span>{text.detail(describe(sources.revenues), describe(sources.payments))}</span>
    </p>
  );
}
