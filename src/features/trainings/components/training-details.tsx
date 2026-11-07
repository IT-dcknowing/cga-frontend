import { KeyValueList } from '@/components/shared/key-value-list';
import type { Training } from '@/features/trainings/api/trainings-api';
import { audienceLabel, placeOf } from '@/features/trainings/lib/training-helpers';
import { formatAmount, formatNumber, formatTimestamp } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';

/*
 * Fiche d'une formation (F-FOR-01, onglet « Détails ») : dates et horaires, format, lieu ou lien,
 * formateur, places, prix, validation des inscriptions, publics, organisateur, description.
 */
const labels = fr.trainings;
const text = labels.detail;

export function TrainingDetails({ training }: { training: Training }) {
  const { seats } = training;

  return (
    <div className="grid gap-4">
      <KeyValueList
        items={[
          {
            label: text.when,
            value: text.whenValue(
              formatTimestamp(training.starts_at),
              formatTimestamp(training.ends_at),
            ),
          },
          { label: text.format, value: labels.formats[training.format] ?? training.format_label },
          { label: text.place, value: placeOf(training) },
          { label: text.trainer, value: training.trainer },
          {
            label: text.seats,
            value:
              training.capacity === null
                ? `${text.unlimited} · ${labels.list.unlimited(formatNumber(seats.registered))}`
                : text.seatsValue(
                    formatNumber(seats.registered),
                    formatNumber(training.capacity),
                    formatNumber(seats.left ?? 0),
                  ),
          },
          {
            label: text.price,
            value: training.price === 0 ? text.free : formatAmount(training.price),
          },
          {
            label: text.approval,
            value: training.requires_approval ? text.approvalYes : text.approvalNo,
          },
          { label: text.audiences, value: training.audiences.map(audienceLabel).join(', ') },
          ...(training.organizer === undefined
            ? []
            : [{ label: text.organizer, value: training.organizer.name }]),
        ]}
      />
      {training.description === null ? null : (
        <div className="grid gap-1">
          <p className="text-label text-muted">{text.description}</p>
          <p className="whitespace-pre-line">{training.description}</p>
        </div>
      )}
    </div>
  );
}
