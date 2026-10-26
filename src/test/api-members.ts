import type { Member, Referrer, Sector } from '@/features/members/api/members-api';
import {
  conflict,
  forbidden,
  invalid,
  notFound,
  ok,
  paginated,
  text,
  type ApiReply,
  type Input,
} from './api-replies';
import {
  demoCommunes,
  demoFeeSchedule,
  demoMember,
  demoMembers,
  demoReferrers,
  demoSectors,
  demoTaxOffices,
  NCC_ENROLLED_ELSEWHERE,
} from './demo-members';
import { createDossierBackend } from './api-dossier';
import { createMemberRecords, demoRadiationOptions, formInput } from './api-member-records';

/*
 * Dossiers des adhérents simulés, d'après `MemberController` (`ListMembersRequest`, `MemberRequest`,
 * `MemberPolicy`, `MemberResource`, `MembershipReadiness`), `ReferrerController`,
 * `SectorProposalController` et `FeeScheduleController` : portefeuille CGA par défaut, « Tous » et
 * le Cabinet avec `members.cabinet.view` ; l'apporteur n'est renvoyé, ni filtrable, qu'avec
 * `members.referrers.view` (RG-PTF-06) ; un NCC n'est ouvert qu'une fois dans le centre, et jamais
 * au portefeuille CGA s'il l'est dans un autre CGA (RG-ADH-05).
 */
export type DomainContext = {
  allows: (permission: string) => boolean;
  /** Dossier de l'accès adhérent actif, `null` pour un agent. */
  memberId?: string | null;
};

const STATUSES = ['draft', 'active', 'radiation_pending', 'radiated', 'closed'];
const SORTS = ['company_name', 'adhesion_date', 'membership_number', 'created_at'];
const REGIMES = { cga: ['TEE', 'RME'], cabinet: ['TEE', 'RME', 'RSI', 'RNI'] };
const NCC_PATTERN = /^\d{7}[A-Z]$/;

/** `Ncc::normalize` : majuscules, sans espace. */
export function normalizeNcc(ncc: string): string {
  return ncc.replace(/\s+/g, '').toUpperCase();
}

/** Champs exigés à la validation (`MembershipReadiness::REQUIRED`). */
const READINESS: [keyof Member | string, (member: Member) => unknown][] = [
  ['tax_office_id', (member) => member.tax_office],
  ['sector_id', (member) => member.sector],
  ['main_activity', (member) => member.main_activity],
  ['address', (member) => member.address],
  ['phone', (member) => member.phone],
  ['signatory_name', (member) => member.signatory_name],
  ['signatory_title', (member) => member.signatory_title],
];

const OWNER_FIELDS = [
  'last_name',
  'first_names',
  'nationality',
  'id_document_type',
  'id_document_number',
] as const;

function blank(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

export function createMembersBackend(initial: Member[] = demoMembers()) {
  let members = initial;
  let sectors: Sector[] = [...demoSectors];
  /** Droits d'adhésion payés (dossier → oui) : le paiement arrive avec l'étape 3.8. */
  const entryFeesPaid = new Set<string>();
  const sequence = { membership: 2, client: 2, sector: 0 };
  let referrers: Referrer[] = demoReferrers.map((referrer) => ({ ...referrer }));
  let current: DomainContext = { allows: () => false };
  const dossier = createDossierBackend(
    (id) => members.find((member) => member.id === id),
    (member) => save(member),
    (memberId) => {
      entryFeesPaid.add(memberId);
    },
  );
  const records = createMemberRecords(
    (member) => save(member),
    (member) => shown(member, current),
  );

  function shown(member: Member, context: DomainContext): Member {
    if (context.allows('members.referrers.view')) {
      return member;
    }

    const rest: Partial<Member> = { ...member };

    delete rest.referrer;

    return rest as Member;
  }

  function list(query: URLSearchParams, context: DomainContext): ApiReply {
    const portfolio = query.get('filter[portfolio]') ?? 'cga';
    const statuses = query.get('filter[status]');
    const search = query.get('filter[search]')?.toLocaleLowerCase('fr') ?? '';
    const sort = query.get('sort') ?? 'company_name';
    const field = sort.replace(/^-/, '');

    if (
      !['cga', 'cabinet', 'all'].includes(portfolio) ||
      (statuses !== null && statuses.split(',').some((status) => !STATUSES.includes(status))) ||
      !SORTS.includes(field)
    ) {
      return invalid({ filter: 'Le filtre demandé est invalide.' });
    }

    if (query.has('filter[referrer_id]') && !context.allows('members.referrers.view')) {
      return invalid({ 'filter.referrer_id': 'Le champ filter.referrer_id est interdit.' });
    }

    if (portfolio !== 'cga' && !context.allows('members.cabinet.view')) {
      return forbidden;
    }

    const exact: [string, (member: Member) => string | null | undefined][] = [
      ['filter[regime]', (member) => member.regime],
      ['filter[tax_office_id]', (member) => member.tax_office?.id],
      ['filter[referrer_id]', (member) => member.referrer?.id],
    ];
    const direction = sort.startsWith('-') ? -1 : 1;
    const selected = members
      .filter((member) => portfolio === 'all' || member.portfolio === portfolio)
      .filter((member) => statuses === null || statuses.split(',').includes(member.status))
      .filter(
        (member) =>
          search === '' ||
          [
            member.company_name,
            member.sigle,
            member.ncc,
            member.membership_number,
            member.client_number,
            member.legacy_number,
            member.phone,
          ].some((value) => value?.toLocaleLowerCase('fr').includes(search)),
      )
      .filter((member) =>
        exact.every(([name, value]) => !query.has(name) || value(member) === query.get(name)),
      )
      .sort(
        (a, b) =>
          direction *
          String(a[field as keyof Member] ?? '').localeCompare(
            String(b[field as keyof Member] ?? ''),
            'fr',
          ),
      )
      .map((member) => shown(member, context));

    return paginated(selected, query);
  }

  function openWithNcc(ncc: string, except: string | null): Member | undefined {
    return members.find(
      (member) =>
        member.ncc === ncc &&
        member.id !== except &&
        !['radiated', 'closed'].includes(member.status),
    );
  }

  /** Règles de `MemberRequest` : ce sans quoi le dossier n'existe pas. */
  function validateFields(input: Input, portfolio: string): Record<string, string> {
    const errors: Record<string, string> = {};

    for (const field of ['company_name', 'legal_form', 'main_activity', 'phone']) {
      if (text(input, field) === '') {
        errors[field] = `Le champ ${field} est obligatoire.`;
      }
    }

    if (!NCC_PATTERN.test(normalizeNcc(text(input, 'ncc')))) {
      errors.ncc = 'Le NCC compte 7 chiffres suivis d’une lettre (ex. 1234567A).';
    }

    if (!REGIMES[portfolio as 'cga'].includes(text(input, 'regime'))) {
      errors.regime = 'Ce régime n’est pas permis dans ce portefeuille.';
    }

    if (portfolio === 'cabinet' && !blank(input.referrer_id)) {
      errors.referrer_id = 'Le champ apporteur est interdit au portefeuille Cabinet.';
    }

    return errors;
  }

  /** `MemberResource` d'une saisie, sur un dossier neuf ou existant. */
  function filled(member: Member, input: Input): Member {
    const value = (field: string) => (blank(input[field]) ? null : (input[field] as string));
    const number = (field: string) => (blank(input[field]) ? null : Number(input[field]));
    const revenue = input.reference_revenue as Member['reference_revenue'] | null | undefined;
    const office = demoTaxOffices.find((item) => item.id === input.tax_office_id);
    const commune = demoCommunes.find((item) => item.id === input.commune_id);
    const sector = sectors.find((item) => item.id === input.sector_id);
    const referrer = referrers.find((item) => item.id === input.referrer_id);

    return {
      ...member,
      entity_type: text(input, 'entity_type'),
      company_name: text(input, 'company_name').toUpperCase(),
      sigle: value('sigle'),
      legal_form: text(input, 'legal_form'),
      share_capital: number('share_capital'),
      owner: {
        last_name: value('owner_last_name'),
        first_names: value('owner_first_names'),
        nationality: value('owner_nationality'),
        id_document_type: value('owner_id_document_type'),
        id_document_number: value('owner_id_document_number'),
      },
      ncc: normalizeNcc(text(input, 'ncc')),
      rccm: value('rccm'),
      idu: value('idu'),
      regime: text(input, 'regime'),
      regime_label: text(input, 'regime'),
      legacy_number: value('legacy_number'),
      referrer:
        referrer === undefined
          ? null
          : { id: referrer.id, label: referrer.label, name: referrer.name },
      tax_office: office === undefined ? null : { ...office },
      activity_code_text: value('activity_code_text'),
      sector: sector === undefined ? null : { ...sector },
      main_activity: text(input, 'main_activity'),
      address: value('address'),
      commune: commune === undefined ? null : { id: commune.id, name: commune.name },
      land_section: value('land_section'),
      land_parcel: value('land_parcel'),
      phone: text(input, 'phone'),
      whatsapp: value('whatsapp'),
      email: value('email'),
      signatory_name: value('signatory_name'),
      signatory_title: value('signatory_title'),
      employees_count: number('employees_count'),
      contract: {
        signed_on: value('cga_contract_signed_on'),
        confirmed: input.cga_contract_confirmed === true,
        ended_on: null,
      },
      entry_fee_amount:
        number('entry_fee_amount') ??
        (member.portfolio === 'cga' ? demoFeeSchedule.entry_fee.amount : 0),
      fees_amount: number('fees_amount') ?? 0,
      fees_periodicity: value('fees_periodicity') ?? 'monthly',
      reference_revenue:
        revenue === null || revenue === undefined ? null : { ...revenue, source: 'manual' },
    };
  }

  /** Ce qui manque à la validation (`MembershipReadiness`). */
  function missingFor(member: Member, exclusivityConfirmed: boolean): string[] {
    const missing = READINESS.filter(([, read]) => blank(read(member))).map(([code]) => code);

    if (member.entity_type === 'individual') {
      missing.push(
        ...OWNER_FIELDS.filter((field) => blank(member.owner[field])).map(
          (field) => `owner_${field}`,
        ),
      );
    }

    if (member.reference_revenue === null) {
      missing.push('reference_revenue');
    }

    if (member.portfolio === 'cga') {
      if (member.contract.signed_on === null) {
        missing.push('cga_contract_signed_on');
      }

      if (!member.contract.confirmed) {
        missing.push('cga_contract_confirmed');
      }

      if (member.entry_fee_amount > 0 && !entryFeesPaid.has(member.id)) {
        missing.push('entry_fee_payment');
      }

      if (!exclusivityConfirmed) {
        missing.push('exclusivity_confirmed');
      }
    }

    return missing;
  }

  function save(member: Member): Member {
    members = members.some((candidate) => candidate.id === member.id)
      ? members.map((candidate) => (candidate.id === member.id ? member : candidate))
      : [...members, member];

    return member;
  }

  function create(input: Input, context: DomainContext): ApiReply {
    const portfolio = text(input, 'portfolio');

    if (!context.allows('members.create')) {
      return forbidden;
    }

    if (!['cga', 'cabinet'].includes(portfolio)) {
      return invalid({ portfolio: 'Le champ portefeuille est obligatoire.' });
    }

    if (portfolio === 'cabinet' && !context.allows('members.cabinet.view')) {
      return forbidden;
    }

    const errors = validateFields(input, portfolio);

    if (Object.keys(errors).length > 0) {
      return invalid(errors);
    }

    const ncc = normalizeNcc(text(input, 'ncc'));
    const existing = openWithNcc(ncc, null);

    if (existing !== undefined) {
      return conflict(
        'ncc_already_registered',
        'Ce NCC a déjà un dossier ouvert dans votre centre : ouvrez-le (ou basculez-le) plutôt que d’en créer un autre.',
        { member_id: existing.id, status: existing.status, portfolio: existing.portfolio },
      );
    }

    if (portfolio === 'cga' && ncc === NCC_ENROLLED_ELSEWHERE) {
      return exclusive();
    }

    const member = filled(
      demoMember({
        id: `01mbr8${String(members.length + 1).padStart(20, '0')}`,
        portfolio,
        portfolio_label: portfolio === 'cga' ? 'Portefeuille CGA' : 'Portefeuille Cabinet',
        status: 'draft',
        status_label: 'Brouillon',
        adhesion_date: null,
        validated_at: null,
        pieces_status: 'pending',
        created_at: '2026-10-26T09:00:00Z',
        can: {
          update: true,
          validate: true,
          delete: true,
          change_regime: false,
          request_radiation: false,
          move_to_cga: false,
          block_attestation: false,
          release_attestation: false,
        },
      }),
      input,
    );

    return { status: 201, data: { data: shown(save(member), context) } };
  }

  function exclusive(): ApiReply {
    return conflict(
      'membership_exclusive',
      'Ce contribuable est adhérent d’un autre CGA. L’inscription sera possible dès que sa radiation y aura été validée.',
    );
  }

  function update(member: Member, input: Input, context: DomainContext): ApiReply {
    if (!context.allows('members.update')) {
      return forbidden;
    }

    const errors = validateFields(input, member.portfolio);

    if (Object.keys(errors).length > 0) {
      return invalid(errors);
    }

    const existing = openWithNcc(normalizeNcc(text(input, 'ncc')), member.id);

    if (existing !== undefined) {
      return conflict(
        'ncc_already_registered',
        'Ce NCC a déjà un dossier ouvert dans votre centre.',
        {
          member_id: existing.id,
        },
      );
    }

    return ok(shown(save(filled(member, input)), context));
  }

  function validate(member: Member, input: Input, context: DomainContext): ApiReply {
    if (!context.allows('members.create')) {
      return forbidden;
    }

    if (member.status !== 'draft') {
      return conflict('member_not_draft', 'Ce dossier est déjà validé.');
    }

    const missing = missingFor(member, input.exclusivity_confirmed === true);

    if (missing.length > 0) {
      return conflict(
        'membership_incomplete',
        'L’adhésion ne peut pas encore être validée : complétez ce qui manque.',
        { missing },
      );
    }

    if (member.portfolio === 'cga' && member.ncc === NCC_ENROLLED_ELSEWHERE) {
      return exclusive();
    }

    const cga = member.portfolio === 'cga';
    const next = cga ? ++sequence.membership : ++sequence.client;
    const validated: Member = {
      ...member,
      status: 'active',
      status_label: 'Actif',
      membership_number: cga ? `2026-DCK-${String(next).padStart(4, '0')}` : null,
      client_number: cga ? null : `CAB-DCK-${String(next).padStart(5, '0')}`,
      adhesion_date: cga ? member.contract.signed_on : '2026-10-26',
      validated_at: '2026-10-26T09:00:00Z',
      missing_for_validation: [],
      can: { ...member.can, validate: false, delete: false, change_regime: true },
    };

    return ok(shown(save(validated), context));
  }

  function nccCheck(query: URLSearchParams, context: DomainContext): ApiReply {
    if (!context.allows('members.create')) {
      return forbidden;
    }

    const ncc = normalizeNcc(query.get('ncc') ?? '');
    const valid = NCC_PATTERN.test(ncc);
    const existing = valid ? openWithNcc(ncc, null) : undefined;

    return ok({
      ncc,
      valid,
      existing:
        existing === undefined
          ? null
          : {
              id: existing.id,
              company_name: existing.company_name,
              status: existing.status,
              portfolio: existing.portfolio,
            },
      enrolled_elsewhere: valid && ncc === NCC_ENROLLED_ELSEWHERE,
    });
  }

  function proposeSector(input: Input, context: DomainContext): ApiReply {
    if (!context.allows('members.create')) {
      return forbidden;
    }

    const name = text(input, 'name');

    if (name === '') {
      return invalid({ name: 'Le champ nom est obligatoire.' });
    }

    if (sectors.some((sector) => sector.name.toLowerCase() === name.toLowerCase())) {
      return invalid({ name: 'La valeur du champ nom est déjà utilisée.' });
    }

    const sector: Sector = {
      id: `01sec9${String(++sequence.sector).padStart(20, '0')}`,
      code: `DCK${String(sequence.sector).padStart(4, '0')}`,
      name,
      status: 'proposed',
    };

    sectors = [...sectors, sector];

    return { status: 201, data: { data: sector } };
  }

  function referentials(
    method: string,
    path: string,
    query: URLSearchParams,
  ): ApiReply | undefined {
    if (method !== 'GET') {
      return undefined;
    }

    const lists: Record<string, unknown[]> = {
      '/referentials/tax-offices': demoTaxOffices,
      '/referentials/communes': demoCommunes,
      '/referentials/sectors': sectors,
    };

    return path in lists ? paginated(lists[path], query) : undefined;
  }

  /** `ReferrerController` (RG-PTF-06) : lecture avec « Voir les apporteurs », écriture pour le gérant. */
  function referrersRoute(
    method: string,
    path: string,
    input: Input,
    context: DomainContext,
  ): ApiReply | undefined {
    const match = /^\/cga\/referrers(?:\/([^/]+))?$/.exec(path);

    if (match === null) {
      return undefined;
    }

    if (!context.allows('members.referrers.view')) {
      return forbidden;
    }

    if (method === 'GET') {
      return ok(referrers);
    }

    if (!context.allows('cga.profile.manage')) {
      return forbidden;
    }

    const id = match[1];
    const current = referrers.find((item) => item.id === id);

    if (id !== undefined && current === undefined) {
      return notFound;
    }

    if (method === 'DELETE' && current !== undefined) {
      if (current.members_count > 0) {
        return conflict('referrer_in_use', 'Cet apporteur est rattaché à des dossiers.');
      }

      referrers = referrers.filter((item) => item.id !== id);

      return { status: 204 };
    }

    const label = text(input, 'label');

    if (text(input, 'name') === '') {
      return invalid({ name: 'Le champ nom est obligatoire.' });
    }

    if (label !== '' && referrers.some((item) => item.label === label && item.id !== id)) {
      return invalid({ label: 'La valeur du champ libellé est déjà utilisée.' });
    }

    const next =
      Math.max(
        0,
        ...referrers.map((item) => Number(/^Accessoire (\d+)$/.exec(item.label)?.[1] ?? 0)),
      ) + 1;
    const saved: Referrer = {
      ...(current ?? {
        id: `01ref9${String(referrers.length + 1).padStart(20, '0')}`,
        members_count: 0,
        can: { update: true, delete: true },
      }),
      label: label === '' ? (current?.label ?? `Accessoire ${String(next)}`) : label,
      name: text(input, 'name'),
      phone: (input.phone as string | null) ?? null,
      email: (input.email as string | null) ?? null,
      terms: (input.terms as string | null) ?? null,
      active: input.active !== false,
    };

    referrers =
      current === undefined
        ? [...referrers, saved]
        : referrers.map((item) => (item.id === id ? saved : item));

    return { status: current === undefined ? 201 : 200, data: { data: saved } };
  }

  /** `MemberHomeController` : son dossier et son CGA, jamais l'apporteur (RG-PTF-06). */
  function memberHome(context: DomainContext): ApiReply {
    const member = members.find((candidate) => candidate.id === context.memberId);

    if (member === undefined) {
      return forbidden;
    }

    return ok({
      member: {
        company_name: member.company_name,
        sigle: member.sigle,
        number: member.membership_number ?? member.client_number,
        portfolio: member.portfolio,
        portfolio_label: member.portfolio_label,
        status: member.status,
        status_label: member.status_label,
        regime_label: member.regime_label,
        adhesion_date: member.adhesion_date,
        ended_on: member.radiation?.status === 'validated' ? member.radiation.effective_date : null,
      },
      access: {
        role: 'member_owner',
        role_label: 'Accès principal',
        read_only_until: member.status === 'radiated' ? '2027-03-31' : null,
      },
      organization: {
        name: 'DC-KNOWING CGA',
        sigle: 'DCK',
        address: 'Rue des Jardins, Cocody',
        city: 'Abidjan',
        phone_1: '+2252722445501',
        phone_2: null,
        email: 'contact@dcknowing.demo',
      },
    });
  }

  function route(
    method: string,
    path: string,
    query: URLSearchParams,
    body: Input,
    context: DomainContext,
  ): ApiReply | undefined {
    const referential = referentials(method, path, query);

    if (referential !== undefined) {
      return referential;
    }

    const referrerRoute = referrersRoute(method, path, body, context);

    if (referrerRoute !== undefined) {
      return referrerRoute;
    }

    if (method === 'GET' && path === '/cga/fee-schedule') {
      return context.allows('members.create') || context.allows('cga.profile.view')
        ? ok({ ...demoFeeSchedule, can: { update: context.allows('cga.profile.manage') } })
        : forbidden;
    }

    const documentReply = dossier.documentRoute(method, path, formInput(body), context);

    if (documentReply !== undefined) {
      return documentReply;
    }

    if (method === 'GET' && path === '/member/home') {
      return memberHome(context);
    }

    if (method === 'POST' && path === '/cga/sectors') {
      return proposeSector(body, context);
    }

    if (method === 'GET' && path === '/cga/members/ncc-check') {
      return nccCheck(query, context);
    }

    if (method === 'GET' && path === '/cga/members/radiation-options') {
      return context.allows('members.view') ? ok(demoRadiationOptions) : forbidden;
    }

    const match = /^\/cga\/members(?:\/([^/]+))?(?:\/(.+))?$/.exec(path);

    if (match === null) {
      return undefined;
    }

    if (!context.allows('members.view')) {
      return forbidden;
    }

    const [, id, action] = match;

    current = context;

    if (id === undefined) {
      if (method === 'GET') {
        return list(query, context);
      }

      return method === 'POST' ? create(body, context) : undefined;
    }

    const member = members.find((candidate) => candidate.id === id);

    if (member === undefined) {
      return notFound;
    }

    if (member.portfolio === 'cabinet' && !context.allows('members.cabinet.view')) {
      return forbidden;
    }

    if (action === 'validate' && method === 'POST') {
      return validate(member, body, context);
    }

    if (action !== undefined) {
      return (
        records.route(member, method, action, query, body, context) ??
        dossier.route(member, method, action, formInput(body), context)
      );
    }

    const input = formInput(body);

    // Un fichier joint passe en POST avec `_method=PUT` (method spoofing de Laravel).
    if (method === 'PUT' || (method === 'POST' && input._method === 'PUT')) {
      return update(member, input, context);
    }

    if (method === 'DELETE') {
      if (!context.allows('members.update') || member.status !== 'draft') {
        return member.status === 'draft'
          ? forbidden
          : conflict('member_not_draft', 'Seul un brouillon se supprime.');
      }

      members = members.filter((candidate) => candidate.id !== member.id);

      return { status: 204 };
    }

    return method === 'GET' ? ok(shown(member, context)) : undefined;
  }

  return {
    route,
    /** Dossiers simulés, dans leur état courant. */
    members: () => members,
    sectors: () => sectors,
    /** Éléments des dossiers (pièces, accès, historique). */
    records,
    /** Honoraires, paiements, documents et blocages d'attestation (étape 3.8). */
    dossier,
    /** Droit d'adhésion payé et confirmé (paiement de l'étape 3.8). */
    payEntryFee(memberId: string) {
      entryFeesPaid.add(memberId);
    },
  };
}
