import type { TrainingSpace } from '@/features/trainings/api/trainings-api';

/** Adresses des formations dans chaque espace (03-APPFLOW §3.2, §4.3, §5.2). */
export const trainingRoutes = {
  list: (space: TrainingSpace) => (space === 'network' ? '/cncga/formations' : '/cga/formations'),
  create: (space: TrainingSpace) => `${trainingRoutes.list(space)}/nouvelle`,
  detail: (space: TrainingSpace, id: string) =>
    `${trainingRoutes.list(space)}/${encodeURIComponent(id)}`,
  edit: (space: TrainingSpace, id: string) => `${trainingRoutes.detail(space, id)}/modifier`,
  /** Onglet « Formations du réseau » de `/cga/formations`. */
  networkTab: '/cga/formations?onglet=reseau',
  /** Une formation du réseau vue d'un CGA. */
  network: (id: string) => `/cga/formations/reseau/${encodeURIComponent(id)}`,
  member: '/adherent/formations',
} as const;
