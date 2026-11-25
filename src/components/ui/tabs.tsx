import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/*
 * Onglets (maquette v4.1 & 04-UX-UI §6) :
 * - Barre sur fond table-head (#FAFBF9), bordure basse border
 * - Onglet actif en primary-dark (#144C37) souligné par 2px primary (#1E6A4E)
 * - Typographie 12.5px / font-800, padding 10x12
 */
export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'flex overflow-x-auto border-b border-border bg-table-head px-3 gap-1',
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        '-mb-px min-h-10 shrink-0 whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-[12.5px] font-extrabold text-muted transition-colors duration-150 hover:text-ink cursor-pointer',
        'data-[state=active]:border-primary data-[state=active]:text-primary-dark',
        className,
      )}
      {...props}
    />
  );
}

/** Contenu d'un onglet ; avec `forceMount`, un onglet quitté reste monté (saisie conservée), caché. */
export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('pt-4 data-[state=inactive]:hidden', className)}
      {...props}
    />
  );
}
