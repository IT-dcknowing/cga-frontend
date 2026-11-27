import type { ExportSpace } from '@/features/exports/api/exports-api';

/**
 * Page « Mes exports » de chaque espace : `/cncga/exports/:id` et `/cga/exports/:id` sont les liens de
 * la notification « Export prêt » (`ExportReadyNotification::link()`), à garder identiques.
 */
export const exportRoutes = {
  list: (space: ExportSpace) => (space === 'network' ? '/cncga/exports' : '/cga/exports'),
  detail: (space: ExportSpace, id: string) =>
    `${exportRoutes.list(space)}/${encodeURIComponent(id)}`,
} as const;
