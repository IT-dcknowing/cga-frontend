import { Link } from 'react-router';
import { cn } from '@/lib/utils';

/*
 * Carte d'indicateur (04-UX-UI §6 « KpiCard ») : libellé 13 px `muted`, valeur 26 px en 800, sous-texte
 * 12,5 px `muted` ; variante `alert` (valeur en `danger`). Cliquable quand elle mène à une liste filtrée.
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
      <span className="text-label text-muted">{label}</span>
      <span
        className={cn('text-kpi font-extrabold tabular-nums', alert ? 'text-danger' : 'text-ink')}
      >
        {value}
      </span>
      {sub === undefined || sub === null || sub === '' ? null : (
        <span className="text-note text-muted">{sub}</span>
      )}
    </>
  );
  const classes = 'grid gap-1 rounded-card border border-border bg-card p-4 shadow-card';

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
