// Adhérents fictifs de la page de démonstration (aucune donnée réelle).
export type DemoMember = {
  id: string;
  companyName: string;
  number: string;
  adhesionDate: string;
  regime: 'RME' | 'TEE';
  status: 'draft' | 'active' | 'radiation_pending' | 'radiated';
  feesAmount: number;
  pieces: 'pending' | 'complete';
};

const ACTIVITIES = [
  'BOULANGERIE',
  'GARAGE',
  'PHARMACIE',
  'QUINCAILLERIE',
  'IMPRIMERIE',
  'TRANSPORTS',
];
const PLACES = ['DU PLATEAU', 'DE COCODY', 'DE YOPOUGON', 'DE TREICHVILLE', 'DE MARCORY'];
const STATUSES: DemoMember['status'][] = [
  'active',
  'active',
  'active',
  'draft',
  'radiation_pending',
  'radiated',
];

export const demoMembers: DemoMember[] = Array.from({ length: 28 }, (_, index) => {
  const sequence = index + 1;

  return {
    id: `demo-${sequence}`,
    companyName: `${ACTIVITIES[index % ACTIVITIES.length]} ${PLACES[index % PLACES.length]}`,
    number: `2026-DEMO-${String(sequence).padStart(4, '0')}`,
    adhesionDate: `2026-${String((index % 9) + 1).padStart(2, '0')}-${String((index % 27) + 1).padStart(2, '0')}`,
    regime: index % 3 === 0 ? 'TEE' : 'RME',
    status: STATUSES[index % STATUSES.length],
    feesAmount: 15000 + (index % 5) * 5000,
    pieces: index % 4 === 0 ? 'pending' : 'complete',
  };
});
