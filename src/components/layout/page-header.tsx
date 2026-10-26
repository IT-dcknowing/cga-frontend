import type { ReactNode } from 'react';

/*
 * En-tête d'un écran dans la coque (04-UX-UI §5.1) : fil d'Ariane `muted`, unique titre de niveau 1
 * (§3), action principale à droite.
 */
type PageHeaderProps = {
  title: string;
  /** Texte, ou lien vers la page parente. */
  breadcrumb?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({ title, breadcrumb, actions }: PageHeaderProps) {
  return (
    <div className="mb-5">
      {breadcrumb !== undefined ? <p className="mb-1 text-note text-muted">{breadcrumb}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-page-title font-extrabold text-ink">{title}</h1>
        {actions}
      </div>
    </div>
  );
}
