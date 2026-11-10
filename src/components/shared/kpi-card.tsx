import { Link } from 'react-router';
import { cn } from '@/lib/utils';

/*
 * Carte KPI (maquette v4.1 & 04-UX-UI §6) :
 * - Carte bordée sans ombre, padding 14×16 (p-4 md:px-4 md:py-3.5), rayon 10px
 * - Libellé : 11px majuscules espacé .05em muted
 * - Valeur : 24px / 800 tabular-nums (orange/accent si alerte)
 * - Sous-texte : 11.5px muted
 */
type KpiCardProps = {
  label: string;
  value: string;
  sub?: string | null;
  alert?: boolean;
  /** Liste filtrée ouverte au clic. */
  to?: string;
};

export function KpiCard({ label, value, sub, alert = false, to }: KpiCardProps) {
  const body = (
    <>
      <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted">{label}</span>
      <span
        className={cn(
          'mt-1 text-[24px] font-extrabold tabular-nums',
          alert ? 'text-accent' : 'text-ink',
        )}
      >
        {value}
      </span>
      {sub === undefined || sub === null || sub === '' ? null : (
        <span className="mt-0.5 text-[11.5px] text-muted">{sub}</span>
      )}
    </>
  );
  const classes = 'grid gap-0.5 rounded-card border border-border bg-card p-4 md:px-4 md:py-3.5';

  return to === undefined ? (
    <div className={classes}>{body}</div>
  ) : (
    <Link
      to={to}
      aria-label={`${label} : ${value}`}
      className={cn(classes, 'transition-colors duration-150 hover:bg-primary-soft/40')}
    >
      {body}
    </Link>
  );
}
