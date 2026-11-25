import { Check, Clock, TriangleAlert } from 'lucide-react';
import type {
  ClosingBoard,
  ClosingCampaign,
  ClosingItemStep,
} from '@/features/closing/api/closing-api';
import { formatDate } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';
import { cn } from '@/lib/utils';

/*
 * Frise des 4 étapes de la campagne (`StepTimeline`, 04-UX-UI) : date de chaque étape, dossiers faits et
 * en retard ; et étapes d'un dossier (faite le …, en retard en orange, à faire).
 */
const labels = fr.closing;

export function StepTimeline({
  campaign,
  board,
}: {
  campaign: ClosingCampaign;
  board: ClosingBoard;
}) {
  return (
    <ol aria-label={labels.timeline.caption} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {campaign.steps.map((step, index) => {
        const counts = board.steps.find((candidate) => candidate.code === step.code);
        const late = counts?.late ?? 0;

        return (
          <li
            key={step.code}
            className={cn(
              'grid gap-1 rounded-lg border p-3',
              late > 0 ? 'border-accent bg-accent-soft' : 'border-border bg-card',
            )}
          >
            <span className="text-note text-muted">
              {index + 1}. {labels.timeline.due(formatDate(step.due))}
            </span>
            <span className="font-semibold">{labels.steps[step.code] ?? step.label}</span>
            <span className="text-note">
              {labels.timeline.done(String(counts?.done ?? 0), String(board.items))}
            </span>
            {late > 0 ? (
              <span className="text-note font-semibold text-accent-text">
                {labels.timeline.late(String(late))}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Étapes d'un dossier, dans l'ordre : faite, en retard ou à faire. */
export function ItemSteps({ steps }: { steps: ClosingItemStep[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {steps.map((step) => {
        const label = labels.steps[step.code] ?? step.label;
        const due = formatDate(step.due);
        const text =
          step.done_on !== null
            ? labels.list.stepDone(label, formatDate(step.done_on))
            : step.late
              ? labels.list.stepLate(label, due)
              : labels.list.stepTodo(label, due);
        const Icon = step.done_on !== null ? Check : step.late ? TriangleAlert : Clock;

        return (
          <li
            key={step.code}
            title={text}
            aria-label={text}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-note',
              step.done_on !== null
                ? 'border-primary bg-primary-soft text-primary'
                : step.late
                  ? 'border-accent bg-accent-soft font-semibold text-accent-text'
                  : 'border-border text-muted',
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {label}
          </li>
        );
      })}
    </ul>
  );
}
