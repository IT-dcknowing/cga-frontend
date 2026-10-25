import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type EmptyStateProps = {
  icon: LucideIcon;
  /** La phrase affichée sous l'icône. */
  children: ReactNode;
  /** Action principale proposée, par exemple « Enregistrer un CGA ». */
  action?: ReactNode;
  className?: string;
};

/** 04-UX-UI §6 (EmptyState), 03-APPFLOW §7 (Liste vide) : icône 40 px `muted`, phrase, action. */
export function EmptyState({ icon: Icon, children, action, className }: EmptyStateProps) {
  return (
    <div className={cn('grid justify-items-center gap-3 px-4 py-6 text-center', className)}>
      <Icon className="size-10 text-muted" aria-hidden="true" />
      <p className="text-body text-muted">{children}</p>
      {action}
    </div>
  );
}
