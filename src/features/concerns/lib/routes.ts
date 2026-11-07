import type { ConcernSpace } from '@/features/concerns/api/concerns-api';

/** Adresses des préoccupations dans chaque espace (03-APPFLOW §3.2, §4.3, §5.2). */
export const concernRoutes = {
  list: (space: ConcernSpace) =>
    space === 'network'
      ? '/cncga/preoccupations'
      : space === 'cga'
        ? '/cga/preoccupations'
        : '/adherent/messages',
  detail: (space: ConcernSpace, id: string) =>
    `${concernRoutes.list(space)}/${encodeURIComponent(id)}`,
} as const;
