import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { memberRoutes } from '@/features/members/lib/member';
import { fr } from '@/lib/i18n/fr';
import { createMembersBackend } from '@/test/api-members';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import {
  demoCommunes,
  demoMemberIds,
  demoReferrers,
  demoTaxOffices,
  NCC_ENROLLED_ELSEWHERE,
} from '@/test/demo-members';
import { fieldByLabel } from '@/test/fields';
import { renderApp } from '@/test/render-app';

/*
 * `/cga/adherents/nouveau` (F-ADH-02, 06-IMPLEMENTATION-PLAN étapes 2.8 et 2.15) : assistant en deux
 * étapes, portefeuille, contrôle du NCC à la volée, exclusivité (RG-ADH-05), brouillon (RG-ADH-01),
 * validation (RG-ADH-02, 03), proposition de secteur (RG-REF-01) ; vrai client `http`, backend simulé.
 */
const labels = fr.members.create;
const fields = fr.members.fields;

let server: ReturnType<typeof installApiServer>;
let members: ReturnType<typeof createMembersBackend>;

afterEach(() => {
  server.restore();
});

const accesses = {
  gerant: ['0700000002', demoIds.manager],
  comptable: ['0700000004', demoIds.accountant],
  formateur: ['0700000007', demoIds.trainer],
} as const;

async function openWizard(who: keyof typeof accesses = 'gerant') {
  members = createMembersBackend();
  server = installApiServer({ members });

  const [phone, membershipId] = accesses[who];

  server.signIn(phone, membershipId);

  const session = await httpAuthApi.currentSession();
  // Sans pause entre les frappes : l'assistant compte une vingtaine de champs.
  const user = userEvent.setup({ delay: null });
  const view = renderApp({ api: httpAuthApi, session, entry: memberRoutes.create });

  if (who !== 'formateur') {
    await screen.findByRole('heading', { level: 1, name: labels.title });
  }

  return { user, ...view };
}

function main() {
  return screen.getByRole('main');
}

function field(label: string) {
  return fieldByLabel(main(), label);
}

type User = ReturnType<typeof userEvent.setup>;

async function fill(user: User, label: string, value: string) {
  const input = field(label);

  await user.clear(input);
  await user.click(input);
  await user.paste(value);
}

async function choose(user: User, label: string, value: string) {
  const select = field(label);

  await waitFor(() => {
    expect(within(select).getAllByRole('option').length).toBeGreaterThan(1);
  });
  await user.selectOptions(select, value);
}

/** Champs exigés pour enregistrer un brouillon (`MemberRequest`). */
async function fillDraft(user: User, ncc = '1234567A') {
  await choose(user, fields.legalForm, 'SARL');
  await fill(user, fields.companyName, 'Ets Kouamé');
  await fill(user, fields.ncc, ncc);
  await user.tab();
  await fill(user, fields.mainActivity, 'Commerce de détail');
  await fill(user, fields.phone, '0707070708');
}

/** Le reste de l'étape 1 (« Suivant »). */
async function fillIdentification(user: User, ncc = '1234567A') {
  await fillDraft(user, ncc);
  await choose(user, fields.taxOffice, demoTaxOffices[0].id);
  await fill(user, fields.address, 'Rue des Jardins');
  await choose(user, fields.commune, demoCommunes[0].id);
  await fill(user, fields.signatoryName, 'Kouamé Yao');
  await fill(user, fields.signatoryTitle, 'Gérant');
}

/** Étape 2 complète du portefeuille CGA. */
async function fillActivity(user: User) {
  await choose(user, fields.sector, '01sec000000000000000000001');
  await fill(user, fields.revenueAmount, '12000000');
  await fill(user, fields.contractSignedOn, '2026-10-20');
  await user.click(screen.getByRole('checkbox', { name: fields.contractConfirmed }));
  await user.click(screen.getByRole('checkbox', { name: fields.exclusivityConfirmed }));
}

function writes(path: string) {
  return server.requests.filter(
    (request) => request.method !== 'GET' && new URL(request.url).pathname.endsWith(path),
  );
}

/**
 * Parcours complets de l'assistant (une vingtaine de champs, deux envois) : 3 s environ sur un poste
 * libre, davantage quand toute la suite tourne en parallèle. Délai propre à ces parcours ; les
 * assertions restent les mêmes.
 */
const JOURNEY = { timeout: 15_000 };

function portfolioRadio(name: string) {
  return within(screen.getByRole('group', { name: fields.portfolio })).getByRole('radio', { name });
}

describe('/cga/adherents/nouveau · étape 1 « Identification » (F-ADH-02)', JOURNEY, () => {
  it('portefeuille CGA par défaut : régimes TEE et RME, apporteur ; au Cabinet, quatre régimes sans apporteur', async () => {
    const { user } = await openWizard();

    expect(screen.getByText(labels.stepOf('1', '2'))).toBeVisible();
    expect(portfolioRadio(fr.members.portfolio.cga)).toBeChecked();
    expect(
      within(field(fields.regime))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['TEE', 'RME']);
    await choose(user, fields.referrer, demoReferrers[0].id);

    await user.click(portfolioRadio(fr.members.portfolio.cabinet));

    expect(
      within(field(fields.regime))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['TEE', 'RME', 'RSI', 'RNI']);
    expect(screen.queryByLabelText(fields.referrer)).not.toBeInTheDocument();
  });

  it('« Suivant » contrôle les champs obligatoires de l’étape : erreurs sous les champs, focus sur le premier', async () => {
    const { user } = await openWizard();

    await user.click(screen.getByRole('button', { name: labels.next }));

    expect(field(fields.companyName)).toHaveAttribute('aria-invalid', 'true');
    // Focus sur le premier champ en erreur, dans l'ordre de l'écran.
    await waitFor(() => {
      expect(field(fields.companyName)).toHaveFocus();
    });
    expect(field(fields.legalForm)).toHaveAttribute('aria-invalid', 'true');
    expect(field(fields.taxOffice)).toHaveAttribute('aria-invalid', 'true');
    expect(field(fields.signatoryTitle)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(labels.stepOf('1', '2'))).toBeVisible();
  });

  it('entreprise individuelle : bloc « Dirigeant » obligatoire, sans capital social', async () => {
    const { user } = await openWizard();

    expect(field(fields.shareCapital)).toBeVisible();
    await user.click(screen.getByRole('radio', { name: fr.members.entityTypes.individual }));

    expect(screen.queryByLabelText(fields.shareCapital)).not.toBeInTheDocument();

    await fillIdentification(user);
    await user.click(screen.getByRole('button', { name: labels.next }));

    expect(field(fields.ownerLastName)).toHaveAttribute('aria-invalid', 'true');
    expect(field(fields.ownerIdDocumentNumber)).toHaveAttribute('aria-invalid', 'true');
  });

  it('NCC au mauvais format : message sous le champ, à la sortie du champ', async () => {
    const { user } = await openWizard();

    await fill(user, fields.ncc, '123');
    await user.tab();

    expect(await within(main()).findByText(labels.ncc.invalid)).toBeVisible();
    expect(field(fields.ncc)).toHaveAttribute('aria-invalid', 'true');
  });

  it('RG-ADH-05 · NCC déjà ouvert dans le centre : message, lien vers le dossier, « Suivant » bloqué', async () => {
    const { user, router } = await openWizard();

    await fill(user, fields.ncc, '1000001 a');
    await user.tab();

    expect(await screen.findByText(labels.ncc.existing, { exact: false })).toBeVisible();
    expect(screen.getByRole('button', { name: labels.next })).toBeDisabled();
    expect(screen.getByRole('button', { name: labels.saveDraft })).toBeDisabled();

    // La saisie en cours fait d'abord confirmer la sortie (03-APPFLOW §7).
    await user.click(screen.getByRole('link', { name: labels.ncc.openExisting }));
    await user.click(await screen.findByRole('button', { name: fr.unsaved.leave }));

    expect(router.state.location.pathname).toBe(memberRoutes.detail(demoMemberIds.adjoua));
  });

  it('RG-ADH-05 · adhérent d’un autre CGA : blocage sans le nommer, puis « Inscrire dans le portefeuille Cabinet »', async () => {
    const { user } = await openWizard();

    await fill(user, fields.ncc, NCC_ENROLLED_ELSEWHERE);
    await user.tab();

    expect(await screen.findByText(labels.ncc.elsewhere)).toBeVisible();
    expect(screen.getByRole('button', { name: labels.next })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: labels.ncc.toCabinet }));

    expect(portfolioRadio(fr.members.portfolio.cabinet)).toBeChecked();
    expect(screen.queryByText(labels.ncc.elsewhere)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: labels.next })).toBeEnabled();
  });

  it('RG-PTF-06 · sans le droit « Voir les apporteurs » : pas de champ apporteur', async () => {
    await openWizard('comptable');

    expect(portfolioRadio(fr.members.portfolio.cga)).toBeChecked();
    expect(screen.queryByLabelText(fields.referrer)).not.toBeInTheDocument();
  });

  it('sans le droit d’inscrire : écran « Vous n’avez pas accès »', async () => {
    await openWizard('formateur');

    expect(
      await screen.findByRole('heading', { level: 1, name: fr.errorScreens.forbiddenTitle }),
    ).toBeVisible();
  });
});

describe('/cga/adherents/nouveau · brouillon et validation (RG-ADH-01, 02)', JOURNEY, () => {
  it('RG-ADH-01 · « Enregistrer comme brouillon » : dossier sans numéro, toast, puis le dossier', async () => {
    const { user, router } = await openWizard();

    await fillDraft(user);
    await user.click(screen.getByRole('button', { name: labels.saveDraft }));

    expect(await screen.findByText(labels.draftSaved)).toBeInTheDocument();

    const created = members.members().at(-1);

    expect(created?.status).toBe('draft');
    expect(created?.membership_number).toBeNull();
    expect(router.state.location.pathname).toBe(memberRoutes.detail(created?.id ?? ''));
    expect(writes('/cga/members')[0].body).toMatchObject({
      portfolio: 'cga',
      company_name: 'Ets Kouamé',
      ncc: '1234567A',
      regime: 'TEE',
      referrer_id: null,
      cga_contract_confirmed: false,
    });
  });

  it('étape 2 : honoraires et droit d’adhésion pré-remplis par le barème, selon le régime', async () => {
    const { user } = await openWizard();

    await fillIdentification(user);
    await user.click(screen.getByRole('button', { name: labels.next }));

    expect(screen.getByText(labels.stepOf('2', '2'))).toBeVisible();
    await waitFor(() => {
      expect(field(fields.feesAmount)).toHaveValue('15000');
    });
    expect(field(fields.entryFee)).toHaveValue('25000');
    expect(field(fields.feesPeriodicity)).toHaveValue('quarterly');

    await user.click(screen.getByRole('button', { name: labels.back }));
    await user.selectOptions(field(fields.regime), 'RME');
    await user.click(screen.getByRole('button', { name: labels.next }));

    expect(field(fields.feesAmount)).toHaveValue('20000');
    expect(field(fields.feesPeriodicity)).toHaveValue('monthly');
  });

  it('RG-ADH-02 · plusieurs éléments manquants : liste, lien vers l’étape concernée', async () => {
    const { user } = await openWizard();

    await fillIdentification(user);
    await user.click(screen.getByRole('button', { name: labels.next }));
    await fillActivity(user);
    server.failNext('POST', apiUrl(`/cga/members/01mbr8${String(8).padStart(20, '0')}/validate`), {
      status: 409,
      data: {
        message: 'L’adhésion ne peut pas encore être validée : complétez ce qui manque.',
        code: 'membership_incomplete',
        details: { missing: ['signatory_title', 'entry_fee_payment'] },
      },
    });
    await user.click(screen.getByRole('button', { name: labels.validate }));

    const dialog = await screen.findByRole('dialog', { name: labels.missing.title });

    expect(within(dialog).getByText(labels.missing.items.signatory_title)).toBeVisible();
    expect(within(dialog).getByText(labels.missing.items.entry_fee_payment)).toBeVisible();
    expect(writes('/validate')[0].body).toEqual({ exclusivity_confirmed: true });

    await user.click(
      within(dialog).getByRole('button', {
        name: labels.missing.goTo(labels.steps.identification),
      }),
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText(labels.stepOf('1', '2'))).toBeVisible();
  });

  it('RG-ADH-02, 03 · seul le droit d’adhésion manque : paiement pré-rempli, « Enregistrer et valider », n° attribué', async () => {
    const { user, router } = await openWizard();

    await fillIdentification(user);
    await user.click(screen.getByRole('button', { name: labels.next }));
    await fillActivity(user);
    await user.click(screen.getByRole('button', { name: labels.validate }));

    // 03-APPFLOW §4.3 : la modale du paiement, montant TTC donné par le serveur.
    const payment = await screen.findByRole('dialog', { name: fr.members.finance.entryFee.title });
    const amount = fieldByLabel(payment, fr.members.finance.paymentDialog.amount);

    await waitFor(() => {
      expect(amount).toHaveValue('29500');
    });
    await user.click(
      within(payment).getByRole('button', { name: fr.members.finance.entryFee.submit }),
    );

    expect(await screen.findByText(labels.validated('2026-DCK-0003'))).toBeInTheDocument();

    const draft = members.members().at(-1);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(memberRoutes.detail(draft?.id ?? ''));
    });
    // Bandeau vert du dossier et ses suites (03-APPFLOW §4.3).
    expect(
      await screen.findByText(fr.members.detail.banners.validated('2026-DCK-0003')),
    ).toBeVisible();
    // La modale de paiement se referme : le bouton redevient accessible.
    await waitFor(
      () => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      },
      { timeout: 4000 },
    );
    expect(
      screen.getByRole('button', { name: fr.members.detail.banners.produceDocuments }),
    ).toBeVisible();
    // Le paiement a soldé le droit d'adhésion, puis la validation est repartie (deux envois).
    expect(writes('/payments')[0].body).toBeInstanceOf(FormData);
    expect(writes('/validate')).toHaveLength(2);
    expect(writes('/cga/members')).toHaveLength(1);
  });

  it('un second envoi après un refus modifie le brouillon (PUT), sans en créer un autre', async () => {
    const { user } = await openWizard();

    await fillDraft(user);
    server.failNext('POST', apiUrl('/cga/members'), { status: 500 });
    await user.click(screen.getByRole('button', { name: labels.saveDraft }));
    await screen.findByText(fr.errors.http.server);

    await user.click(screen.getByRole('button', { name: labels.saveDraft }));
    expect(await screen.findByText(labels.draftSaved)).toBeInTheDocument();
    expect(server.requests.filter((request) => request.method === 'PUT')).toHaveLength(0);
  });

  it('portefeuille Cabinet : ni contrat ni droit d’adhésion ; « Dossier client créé — n° CAB-… »', async () => {
    const { user } = await openWizard();

    await user.click(portfolioRadio(fr.members.portfolio.cabinet));
    await fillIdentification(user);
    await user.selectOptions(field(fields.regime), 'RSI');
    await user.click(screen.getByRole('button', { name: labels.next }));

    expect(screen.queryByLabelText(fields.contractSignedOn)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(fields.entryFee)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: fields.exclusivityConfirmed }),
    ).not.toBeInTheDocument();

    await choose(user, fields.sector, '01sec000000000000000000002');
    await fill(user, fields.revenueAmount, '90000000');
    await fill(user, fields.feesAmount, '50000');
    await user.click(screen.getByRole('button', { name: labels.validate }));

    expect(await screen.findByText(labels.clientCreated('CAB-DCK-00003'))).toBeInTheDocument();

    const body = writes('/cga/members')[0].body as Record<string, unknown>;

    expect(body.portfolio).toBe('cabinet');
    expect(body).not.toHaveProperty('referrer_id');
    expect(body).not.toHaveProperty('cga_contract_signed_on');
    expect(body.entry_fee_amount).toBeNull();
  });

  it('RG-ADH-02 · « Valider » contrôle tout le dossier et ramène à l’étape du premier champ manquant', async () => {
    const { user } = await openWizard();

    await fillIdentification(user);
    await user.click(screen.getByRole('button', { name: labels.next }));
    await user.click(screen.getByRole('button', { name: labels.validate }));

    expect(field(fields.sector)).toHaveAttribute('aria-invalid', 'true');
    expect(within(main()).getAllByText(labels.errors.confirm).length).toBeGreaterThanOrEqual(2);
    expect(writes('/cga/members')).toHaveLength(0);
  });

  it('exemplaire signé du contrat : déposé comme pièce après l’enregistrement (RG-PTF-08)', async () => {
    const { user } = await openWizard();

    await fillIdentification(user);
    await user.click(screen.getByRole('button', { name: labels.next }));
    await user.upload(
      field(fields.contractFile),
      new File(['%PDF-1.4'], 'contrat.pdf', { type: 'application/pdf' }),
    );
    await user.click(screen.getByRole('button', { name: labels.saveDraft }));

    await screen.findByText(labels.draftSaved);
    expect(writes('/pieces/signed_cga_contract')).toHaveLength(1);
  });

  it('dépôt de l’exemplaire refusé : le dossier est enregistré, le toast le dit', async () => {
    const { user } = await openWizard();

    await fillIdentification(user);
    await user.click(screen.getByRole('button', { name: labels.next }));
    await user.upload(
      field(fields.contractFile),
      new File(['x'], 'contrat.pdf', { type: 'application/pdf' }),
    );
    server.failNext(
      'POST',
      apiUrl(`/cga/members/01mbr8${String(8).padStart(20, '0')}/pieces/signed_cga_contract`),
      { status: 422, data: { message: 'Fichier refusé.', errors: { file: ['Fichier refusé.'] } } },
    );
    await user.click(screen.getByRole('button', { name: labels.saveDraft }));

    // Deux toasts empilés : l'échec du dépôt, puis le brouillon enregistré.
    expect(await screen.findByText(labels.pieceFailed)).toBeInTheDocument();
    expect(await screen.findByText(labels.draftSaved)).toBeInTheDocument();
    expect(members.members().at(-1)?.status).toBe('draft');
  });
});

describe('/cga/adherents/nouveau · refus du serveur et sortie', JOURNEY, () => {
  it('03-APPFLOW §7 · refus 422 : message sous le champ, sur son étape', async () => {
    const { user } = await openWizard();

    await fillDraft(user);
    server.failNext('POST', apiUrl('/cga/members'), {
      status: 422,
      data: {
        message: 'Le numéro de téléphone n’est pas valide.',
        errors: { phone: ['Le numéro de téléphone n’est pas valide.'] },
      },
    });
    await user.click(screen.getByRole('button', { name: labels.saveDraft }));

    expect(
      await within(main()).findByText('Le numéro de téléphone n’est pas valide.'),
    ).toBeVisible();
    expect(field(fields.phone)).toHaveAttribute('aria-invalid', 'true');
  });

  it('RG-ADH-05 · 409 à l’enregistrement (autre CGA) : le blocage s’affiche', async () => {
    const { user } = await openWizard();

    await fillDraft(user);
    server.failNext('POST', apiUrl('/cga/members'), {
      status: 409,
      data: { message: labels.ncc.elsewhere, code: 'membership_exclusive', details: {} },
    });
    await user.click(screen.getByRole('button', { name: labels.saveDraft }));

    expect(await screen.findByText(labels.ncc.elsewhere)).toBeVisible();
    expect(screen.getByRole('button', { name: labels.saveDraft })).toBeDisabled();
  });

  it('RG-ADH-05 · 409 « NCC déjà ouvert » : lien vers le dossier existant', async () => {
    const { user } = await openWizard();

    await fillDraft(user);
    server.failNext('POST', apiUrl('/cga/members'), {
      status: 409,
      data: {
        message: 'Ce NCC a déjà un dossier ouvert dans votre centre.',
        code: 'ncc_already_registered',
        details: { member_id: demoMemberIds.bamba, status: 'active', portfolio: 'cga' },
      },
    });
    await user.click(screen.getByRole('button', { name: labels.saveDraft }));

    expect(await screen.findByRole('link', { name: labels.ncc.openExisting })).toHaveAttribute(
      'href',
      memberRoutes.detail(demoMemberIds.bamba),
    );
  });

  it('autre 409 : message de l’API en bandeau', async () => {
    const { user } = await openWizard();

    await fillDraft(user);
    server.failNext('POST', apiUrl('/cga/members'), {
      status: 409,
      data: { message: 'Le centre est suspendu.', code: 'organization_suspended', details: {} },
    });
    await user.click(screen.getByRole('button', { name: labels.saveDraft }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Le centre est suspendu.');
  });

  it('RG-REF-01 · « Proposer un secteur » : le secteur proposé devient celui du dossier', async () => {
    const { user } = await openWizard();

    await fillIdentification(user);
    await user.click(screen.getByRole('button', { name: labels.next }));
    await user.click(screen.getByRole('button', { name: labels.proposeSector }));

    const dialog = screen.getByRole('dialog', { name: labels.sector.title });

    await user.click(within(dialog).getByRole('button', { name: labels.sector.submit }));
    await waitFor(() => {
      expect(fieldByLabel(dialog, labels.sector.name)).toHaveAttribute('aria-invalid', 'true');
    });

    await user.type(fieldByLabel(dialog, labels.sector.name), 'Commerce');
    await user.click(within(dialog).getByRole('button', { name: labels.sector.submit }));
    expect(
      await within(dialog).findByText('La valeur du champ nom est déjà utilisée.'),
    ).toBeVisible();

    await user.clear(fieldByLabel(dialog, labels.sector.name));
    await user.type(fieldByLabel(dialog, labels.sector.name), 'Transformation du cacao');
    await user.click(within(dialog).getByRole('button', { name: labels.sector.submit }));

    expect(await screen.findByText(labels.sector.done)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const sector = field(fields.sector) as HTMLSelectElement;

    expect(sector.selectedOptions[0].textContent).toBe(
      `Transformation du cacao (${labels.sector.proposed})`,
    );
  });

  it('« Proposer un secteur » refusé (409) ou en panne : message dans la modale, puis toast', async () => {
    const { user } = await openWizard();

    await fillIdentification(user);
    await user.click(screen.getByRole('button', { name: labels.next }));
    await user.click(screen.getByRole('button', { name: labels.proposeSector }));

    const dialog = screen.getByRole('dialog', { name: labels.sector.title });

    await user.type(fieldByLabel(dialog, labels.sector.name), 'Orpaillage');
    server.failNext('POST', apiUrl('/cga/sectors'), {
      status: 409,
      data: {
        message: 'Renseignez d’abord l’abréviation de numérotation du centre (fiche du CGA).',
        code: 'abbreviation_missing',
        details: {},
      },
    });
    await user.click(within(dialog).getByRole('button', { name: labels.sector.submit }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Renseignez d’abord l’abréviation de numérotation du centre',
    );

    server.failNext('POST', apiUrl('/cga/sectors'), { status: 500 });
    await user.click(within(dialog).getByRole('button', { name: labels.sector.submit }));

    expect(await screen.findByText(fr.errors.http.server)).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: labels.sector.title })).toBeVisible();
  });

  it('« Annuler » après saisie : « Abandonner la saisie ? », puis la liste', async () => {
    const { user, router } = await openWizard();

    await fill(user, fields.companyName, 'Ets Kouamé');
    await user.click(screen.getByRole('button', { name: fr.common.cancel }));

    const dialog = screen.getByRole('dialog', { name: labels.cancel.title });

    await user.click(within(dialog).getByRole('button', { name: labels.cancel.stay }));
    expect(router.state.location.pathname).toBe(memberRoutes.create);

    await user.click(screen.getByRole('button', { name: fr.common.cancel }));
    await user.click(screen.getByRole('button', { name: labels.cancel.leave }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(memberRoutes.list);
    });
    expect(screen.queryByRole('dialog', { name: fr.unsaved.title })).not.toBeInTheDocument();
  });

  it('« Annuler » sans saisie : retour direct à la liste', async () => {
    const { user, router } = await openWizard();

    await user.click(screen.getByRole('button', { name: fr.common.cancel }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(memberRoutes.list);
    });
  });
});
