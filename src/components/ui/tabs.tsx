import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/*
 * 04-UX-UI §6 (Tabs) : soulignement de 2 px `primary` pour l'onglet actif ; défilement horizontal
 * sur mobile. Radix gère les flèches du clavier et les rôles `tablist` / `tab` / `tabpanel` (§9).
 */
export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn('flex overflow-x-auto border-b border-border', className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        '-mb-px min-h-11 shrink-0 whitespace-nowrap border-b-2 border-transparent px-4 text-table font-semibold text-muted transition-colors duration-150 hover:text-ink md:min-h-10',
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
