import { useState } from 'react';
import { SegmentedControl } from '@/components/shared/segmented-control';
import { TextField } from '@/components/ui/text-field';
import {
  PERIOD_TYPES,
  type PeriodQuery,
  type PeriodType,
  type StatPeriod,
} from '@/features/statistics/api/statistics-api';
import { periodLabel } from '@/features/statistics/lib/statistics-format';
import { fr } from '@/lib/i18n/fr';

/*
 * Sélecteur de période (04-UX-UI §6 « PeriodSelector », F-DSH-04) : groupe segmenté Jour · Mois · Année ·
 * Période ; « Période » ouvre deux dates, appliquées dès qu'elles forment un intervalle ; libellé de la
 * période sous le groupe (« Vue : octobre 2026 »), tel que le serveur l'a compris.
 */
const labels = fr.statistics.period;

const CHOICES = PERIOD_TYPES.map((value) => ({ value, label: labels.types[value] }));

export function PeriodSelector({
  value,
  onChange,
  period,
}: {
  value: PeriodQuery;
  onChange: (query: PeriodQuery) => void;
  /** Période effective renvoyée par le serveur. */
  period?: StatPeriod;
}) {
  const [from, setFrom] = useState(value.from ?? '');
  const [to, setTo] = useState(value.to ?? '');
  const [custom, setCustom] = useState(value.period === 'custom');

  function choose(type: PeriodType) {
    if (type === 'custom') {
      setCustom(true);

      return;
    }
    setCustom(false);
    onChange({ period: type });
  }

  function applyDates(nextFrom: string, nextTo: string) {
    setFrom(nextFrom);
    setTo(nextTo);
    if (nextFrom !== '' && nextTo !== '' && nextFrom <= nextTo) {
      onChange({ period: 'custom', from: nextFrom, to: nextTo });
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <SegmentedControl
          label={labels.label}
          value={custom ? 'custom' : value.period}
          choices={CHOICES}
          onChange={choose}
        />
        {custom ? (
          <>
            <TextField
              id="period-from"
              type="date"
              label={labels.from}
              className="w-44"
              value={from}
              onChange={(event) => {
                applyDates(event.target.value, to);
              }}
            />
            <TextField
              id="period-to"
              type="date"
              label={labels.to}
              className="w-44"
              value={to}
              onChange={(event) => {
                applyDates(from, event.target.value);
              }}
            />
          </>
        ) : null}
      </div>
      {period === undefined ? null : (
        <p className="text-note text-muted">{labels.view(periodLabel(period))}</p>
      )}
    </div>
  );
}
