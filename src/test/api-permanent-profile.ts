import type {
  PermanentPerson,
  PermanentPersonInput,
  PermanentProfile,
} from '@/features/internal/api/permanent-profile-api';
import { forbidden, invalid, ok, type ApiReply, type Input } from './api-replies';

const categories = [
  ['premises', 'Locaux'], ['training_rooms', 'Salles de formation'], ['furniture', 'Mobilier'],
  ['computers', 'Matériel informatique'], ['software', 'Logiciels'], ['projectors', 'Vidéoprojecteurs'],
  ['vehicles', 'Véhicules'], ['other', 'Autres'],
] as const;

export function createPermanentProfileBackend() {
  let nextId = 1;
  const profile: PermanentProfile = {
    presentation: {
      name: 'DC-KNOWING CGA', sigle: 'DCK', legal_form: 'SARL', share_capital: 1_000_000,
      ncc: 'CI-ABJ-2026-A-12345', agreement_number: 'AGR-001', agreement_date: '2020-01-01',
      regional_directorate: { id: '01dr0000000000000000000001', name: 'DR Abidjan' }, said: 'SAID Plateau',
      address: 'Cocody', city: 'Abidjan', manager_name: 'Ama Manager', expert_name: 'Yao Expert',
      history_text: 'Créé en 2004.', previous_year_revenue: 48_000_000,
    },
    people: [{
      id: '01person000000000000000001', kind: 'director', kind_label: 'Dirigeant', full_name: 'Awa Koné',
      nationality: 'Ivoirienne', profession: 'Expert-comptable', diplomas: 'DESCOGEF',
      function_in_cga: 'Gérante', start_date: '2020-01-01', practice_structure: null,
      practice_function: null, practice_years: 8, cnps_declared: true, active: true, end_date: null,
    }],
    resources: categories.map(([category, category_label]) => ({
      category, category_label,
      entry: category === 'computers' ? { id: '01resource00000000000000001', category, category_label, quantity: 6, description: 'Ordinateurs', need: null } : null,
    })),
    can: { manage: true },
  };

  function route(method: string, path: string, body: Input, allows: (permission: string) => boolean): ApiReply | undefined {
    if (!path.startsWith('/cga/permanent-profile')) return undefined;
    if (!allows('internal.manage')) return forbidden;
    if (method === 'GET' && path === '/cga/permanent-profile') return ok(structuredClone(profile));
    if (method === 'PUT' && path === '/cga/permanent-profile/presentation') {
      if (!('history_text' in body) || !('previous_year_revenue' in body)) return invalid({ history_text: 'Champ requis.' });
      profile.presentation.history_text = typeof body.history_text === 'string' ? body.history_text : null;
      profile.presentation.previous_year_revenue = typeof body.previous_year_revenue === 'number' ? body.previous_year_revenue : null;
      return ok(profile.presentation);
    }
    if (method === 'POST' && path === '/cga/permanent-profile/people') {
      if (typeof body.full_name !== 'string' || body.full_name.trim() === '') return invalid({ full_name: 'Renseignez le nom.' });
      const person: PermanentPerson = {
        ...(body as unknown as PermanentPersonInput), id: `01person${String(nextId++).padStart(17, '0')}`,
        kind_label: body.kind === 'director' ? 'Dirigeant' : body.kind === 'occasional' ? 'Personnel occasionnel' : 'Salarié permanent',
      };
      profile.people.push(person);
      return ok(person, 201);
    }
    const personPath = path.match(/^\/cga\/permanent-profile\/people\/([^/]+)$/);
    if (method === 'PUT' && personPath !== null) {
      const personIndex = profile.people.findIndex((person) => person.id === personPath[1]);
      if (personIndex === -1) return { status: 404, data: { message: 'Introuvable.' } };
      if (typeof body.full_name !== 'string' || body.full_name.trim() === '') return invalid({ full_name: 'Renseignez le nom.' });
      const kind = body.kind === 'director' || body.kind === 'occasional' ? body.kind : 'employee';
      const person: PermanentPerson = {
        ...(body as unknown as PermanentPersonInput), id: personPath[1],
        kind_label: kind === 'director' ? 'Dirigeant' : kind === 'occasional' ? 'Personnel occasionnel' : 'Salarié permanent',
      };
      profile.people[personIndex] = person;
      return ok(person);
    }
    const resource = path.match(/^\/cga\/permanent-profile\/resources\/([a-z_]+)$/);
    if (method === 'PUT' && resource !== null) {
      const entry = profile.resources.find((item) => item.category === resource[1]);
      if (entry === undefined) return { status: 404, data: { message: 'Introuvable.' } };
      if (typeof body.quantity !== 'number' || body.quantity < 0) return invalid({ quantity: 'Quantité invalide.' });
      entry.entry = { id: entry.entry?.id ?? `01resource${String(nextId++).padStart(17, '0')}`, category: entry.category, category_label: entry.category_label, quantity: body.quantity, description: typeof body.description === 'string' ? body.description : null, need: typeof body.need === 'string' ? body.need : null };
      return ok(entry.entry);
    }
    return { status: 404, data: { message: 'Introuvable.' } };
  }
  return { profile: () => profile, route };
}
