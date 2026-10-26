import type { Charge } from '@/features/members/api/dossier-api';
import { formatDate } from '@/lib/format';

/** « Honoraires · 01/10/2026 – 31/10/2026 », ou le seul genre pour une somme sans période. */
export function chargeLabel(charge: Charge): string {
  return charge.period_start === null || charge.period_end === null
    ? charge.kind_label
    : `${charge.kind_label} · ${formatDate(charge.period_start)} – ${formatDate(charge.period_end)}`;
}
