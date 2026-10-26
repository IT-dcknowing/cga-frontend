import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { memberRoutes } from '@/features/members/lib/member';
import { fr } from '@/lib/i18n/fr';
import { createMembersBackend } from '@/test/api-members';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import { demoMember, demoMemberIds, demoMembers } from '@/test/demo-members';
import { fieldByLabel } from '@/test/fields';
import { renderApp } from '@/test/render-app';

/*
 * `/cga/adherents/:id` (F-ADH-03 à 07, 06-IMPLEMENTATION-PLAN étapes 2.9 et 2.15) : en-tête, bandeaux,
 * onglets Identité, Pièces, Accès en ligne, Historique ; modales Modifier (justificatif), Valider
 * l'adhésion, Changer de régime, Demander / Valider / Annuler la radiation, bascules de portefeuille,
 * Supprimer le brouillon ; vrai client `http`, backend simulé.
 */
const labels = fr.members.detail;
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

const cabinetTeeId = '01mbr000000000000000000008';
const individualId = '01mbr000000000000000000009';
const cabinetDraftId = '01mbr000000000000000000010';

/** Les dossiers de démonstration, plus un client du Cabinet au TEE, à basculer (RG-PTF-03). */
function dataset() {
  return [
    ...demoMembers(),
    demoMember({
      id: cabinetTeeId,
      portfolio: 'cabinet',
      portfolio_label: 'Portefeuille Cabinet',
      company_name: 'MENUISERIE KONAN',
      ncc: '1000008H',
      client_number: 'CAB-DCK-00003',
      contract: { signed_on: null, confirmed: false, ended_on: null },
      can: {
        update: true,
        validate: false,
        delete: false,
        change_regime: true,
        request_radiation: false,
        move_to_cga: true,
        block_attestation: false,
        release_attestation: false,
      },
    }),
    demoMember({
      id: individualId,
      entity_type: 'individual',
      legal_form: 'EI',
      legal_form_label: 'Entreprise individuelle',
      company_name: 'ATELIER KOUASSI',
      ncc: '1000009J',
      membership_number: '2026-DCK-0009',
      owner: {
        last_name: 'Kouassi',
        first_names: 'Jean Marc',
        nationality: 'Ivoirienne',
        id_document_type: 'CNI',
        id_document_number: 'C0123456',
      },
      reference_revenue: { year: 2025, amount: 12000000, kind: 'actual', source: 'entry' },
    }),
    demoMember({
      id: cabinetDraftId,
      portfolio: 'cabinet',
      portfolio_label: 'Portefeuille Cabinet',
      status: 'draft',
      status_label: 'Brouillon',
      company_name: 'BRIQUETERIE NGUESSAN',
      ncc: '1000010K',
      address: 'Zone industrielle',
      signatory_name: 'Nguessan',
      signatory_title: 'Gérant',
      sector: {
        id: '01sec000000000000000000001',
        code: 'COM',
        name: 'Commerce',
        status: 'validated',
      },
      reference_revenue: { year: 2025, amount: 3000000, kind: 'actual', source: 'entry' },
      contract: { signed_on: null, confirmed: false, ended_on: null },
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
  ];
}

const names: Record<string, string> = {
  [demoMemberIds.adjoua]: 'BOULANGERIE ADJOUA',
  [demoMemberIds.bamba]: 'QUINCAILLERIE BAMBA',
  [demoMemberIds.kouadio]: 'ETS KOUADIO & FILS',
  [demoMemberIds.yao]: 'PHARMACIE YAO',
  [demoMemberIds.cabinet]: 'CABINET CLIENT SARL',
  [cabinetTeeId]: 'MENUISERIE KONAN',
  [individualId]: 'ATELIER KOUASSI',
  [cabinetDraftId]: 'BRIQUETERIE NGUESSAN',
};

async function openMember(id: string, who: keyof typeof accesses = 'gerant', shown = true) {
  members = createMembersBackend(dataset());
  server = installApiServer({ members });

  const [phone, membershipId] = accesses[who];

  server.signIn(phone, membershipId);

  const session = await httpAuthApi.currentSession();
  const user = userEvent.setup({ delay: null });
  const view = renderApp({ api: httpAuthApi, session, entry: memberRoutes.detail(id) });

  if (shown && id in names) {
    await screen.findByRole('heading', { level: 1, name: names[id] });
  }

  return { user, ...view };
}

type User = ReturnType<typeof userEvent.setup>;

/** Parcours avec modales et relectures : délai propre, assertions inchangées (voir l'assistant). */
const JOURNEY = { timeout: 15_000 };

function main() {
  return within(screen.getByRole('main'));
}

function valueOf(label: string): string | null {
  const term = screen.getAllByRole('term').find((item) => item.textContent === label);

  return term?.nextElementSibling?.textContent ?? null;
}

async function action(user: User, name: string) {
  await user.click(screen.getByRole('button', { name: labels.actions }));
  await user.click(screen.getByRole('menuitem', { name }));
}

/** Erreur sous un champ, une fois l'envoi asynchrone de la modale traité. */
async function expectInvalid(field: HTMLElement) {
  await waitFor(() => {
    expect(field).toHaveAttribute('aria-invalid', 'true');
  });
}

function writes(suffix: string) {
  return server.requests.filter(
    (request) => request.method !== 'GET' && new URL(request.url).pathname.endsWith(suffix),
  );
}

function bodyOf(index = -1, suffix = ''): Record<string, unknown> {
  const body = writes(suffix).at(index)?.body;

  return body instanceof FormData
    ? Object.fromEntries(body.entries())
    : (body as Record<string, unknown>);
}

describe('/cga/adherents/:id · en-tête et onglet Identité (F-ADH-03)', JOURNEY, () => {
  it('en-tête : n°, ancien n°, portefeuille, apporteur, statut ; fil d’Ariane vers la liste', async () => {
    const { user, router } = await openMember(demoMemberIds.adjoua);

    expect(main().getAllByText('2026-DCK-0001')[0]).toHaveClass('font-mono');
    expect(main().getByText(labels.legacyNumber('DCK-OLD-7'))).toBeVisible();
    expect(main().getAllByText(fr.members.portfolio.badge.cga)[0]).toHaveAttribute(
      'data-portfolio',
      'cga',
    );
    expect(main().getByText('Accessoire 1')).toBeVisible();
    expect(main().getAllByText(fr.status.member.active)[0]).toHaveAttribute('data-tone', 'success');

    await user.click(main().getByRole('link', { name: fr.nav.members }));

    expect(router.state.location.pathname).toBe(memberRoutes.list);
  });

  it('onglet Identité : la fiche en lecture, apporteur compris pour le gérant', async () => {
    await openMember(demoMemberIds.adjoua);

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(
      Object.values(labels.tabs),
    );
    expect(valueOf(fields.ncc)).toBe('1000001A');
    expect(valueOf(fields.taxOffice)).toBe('CDI Plateau (démonstration)');
    expect(valueOf(fields.referrer)).toBe('Accessoire 1 · Kossonou Apporteur');
    expect(valueOf(fields.address)).toBe(fr.common.notProvided);
    expect(valueOf(fields.entryFee)).toMatch(/^29\s500\sF$/);
  });

  it('RG-PTF-06 · sans le droit « Voir les apporteurs » : ni étiquette ni apporteur', async () => {
    await openMember(demoMemberIds.adjoua, 'comptable');

    expect(main().queryByText('Accessoire 1')).not.toBeInTheDocument();
    expect(screen.getAllByRole('term').map((term) => term.textContent)).not.toContain(
      fields.referrer,
    );
  });

  it('RG-PTF-02 · dossier Cabinet sans le droit de le voir : écran « Vous n’avez pas accès »', async () => {
    await openMember(demoMemberIds.cabinet, 'formateur', false);

    expect(
      await screen.findByRole('heading', { level: 1, name: fr.errorScreens.forbiddenTitle }),
    ).toBeVisible();
  });

  it('dossier inconnu : « Élément introuvable » ; panne : bandeau et « Réessayer »', async () => {
    await openMember('01mbr999999999999999999999');

    expect(
      await screen.findByRole('heading', { level: 1, name: fr.errorScreens.notFoundTitle }),
    ).toBeVisible();

    server.restore();
    members = createMembersBackend(dataset());
    server = installApiServer({ members });
    server.signIn(...accesses.gerant);
    server.failNext('GET', apiUrl(`/cga/members/${demoMemberIds.bamba}`), { status: 500 });
    server.failNext('GET', apiUrl(`/cga/members/${demoMemberIds.bamba}`), { status: 500 });

    const session = await httpAuthApi.currentSession();
    const user = userEvent.setup({ delay: null });

    renderApp({ api: httpAuthApi, session, entry: memberRoutes.detail(demoMemberIds.bamba) });

    expect(await screen.findByText(labels.loadError, {}, { timeout: 4000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.common.retry }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'QUINCAILLERIE BAMBA' }),
    ).toBeVisible();
  });
});

describe('/cga/adherents/:id · pièces, accès en ligne, historique', JOURNEY, () => {
  it('RG-PJ-02 · pièces en attente : bandeau, « Voir les pièces », dépôt d’une pièce', async () => {
    const { user } = await openMember(demoMemberIds.bamba);

    await user.click(screen.getByRole('button', { name: labels.banners.seePieces }));

    const list = await screen.findByRole('list', { name: labels.pieces.caption });

    expect(within(list).getAllByText(fr.status.piece.expected)).toHaveLength(5);

    await user.upload(
      within(list).getByLabelText(labels.pieces.uploadLabel('Statuts')),
      new File(['%PDF-1.4'], 'statuts.pdf', { type: 'application/pdf' }),
    );

    expect(await screen.findByText(labels.pieces.uploaded)).toBeInTheDocument();
    expect(writes('/pieces/statutes')).toHaveLength(1);
    await waitFor(() => {
      expect(within(list).getAllByText(fr.status.piece.received)).toHaveLength(1);
    });
  });

  it('F-ADH-09 · accès en ligne : désactiver, inviter (champs obligatoires), renvoyer l’invitation', async () => {
    const { user } = await openMember(demoMemberIds.adjoua);

    await user.click(screen.getByRole('tab', { name: labels.tabs.accesses }));

    const list = await screen.findByRole('list', { name: labels.accesses.caption });

    expect(within(list).getByText('Adjoua Boulangère')).toBeVisible();
    await user.click(within(list).getByRole('button', { name: labels.accesses.disable }));
    expect(await screen.findByText(labels.accesses.disabled)).toBeInTheDocument();
    expect(await within(list).findByText(fr.status.access.disabled)).toBeVisible();

    await user.click(screen.getByRole('button', { name: labels.accesses.invite }));

    const dialog = screen.getByRole('dialog', { name: labels.accesses.dialog.title });

    await user.click(within(dialog).getByRole('button', { name: labels.accesses.dialog.submit }));
    await expectInvalid(fieldByLabel(dialog, labels.accesses.dialog.firstName));
    // Un accès principal existe déjà : le secondaire est proposé.
    expect(within(dialog).getByRole('radio', { name: fr.roles.member_user })).toBeChecked();

    await user.type(fieldByLabel(dialog, labels.accesses.dialog.firstName), 'Awa');
    await user.type(fieldByLabel(dialog, labels.accesses.dialog.lastName), 'Comptable');
    await user.click(within(dialog).getByRole('button', { name: labels.accesses.dialog.submit }));

    expect(await screen.findByText(labels.accesses.dialog.done)).toBeInTheDocument();
    expect(await within(list).findByText('Awa Comptable')).toBeVisible();
    expect(bodyOf(-1, '/accesses')).toMatchObject({
      role: 'member_user',
      channel: 'sms',
      phone: '+2250707070707',
    });

    await user.click(within(list).getByRole('button', { name: labels.accesses.resend }));
    expect(await screen.findByText(labels.accesses.resent)).toBeInTheDocument();
  });

  it('le comptable consulte les accès sans pouvoir inviter', async () => {
    const { user } = await openMember(demoMemberIds.bamba, 'comptable');

    await user.click(screen.getByRole('tab', { name: labels.tabs.accesses }));

    expect(await screen.findByText(labels.accesses.empty)).toBeVisible();
    expect(screen.queryByRole('button', { name: labels.accesses.invite })).not.toBeInTheDocument();
  });

  it('onglet Historique : auteur, ancienne → nouvelle valeur, justificatif, source', async () => {
    const { user } = await openMember(demoMemberIds.adjoua);

    await user.click(screen.getByRole('tab', { name: labels.tabs.history }));

    const list = await screen.findByRole('list', { name: labels.history.caption });
    const [latest, revenue] = within(list)
      .getAllByRole('listitem')
      .filter((item) => item.parentElement === list);

    expect(within(latest).getByText('Dossier · Modification')).toBeVisible();
    expect(within(latest).getByText('BOULANGERIE ADJOUA SARL')).toHaveClass('line-through');
    expect(
      within(latest).getByRole('link', { name: `${labels.history.justification} : kbis.pdf` }),
    ).toHaveAttribute('href', 'https://files.test/kbis.pdf');
    expect(within(revenue).getByText(labels.history.source('Compta Flow'))).toBeVisible();
    expect(within(revenue).getByText(labels.history.system, { exact: false })).toBeVisible();
  });
});

describe('/cga/adherents/:id · modifier, valider, supprimer (F-ADH-02, 04)', JOURNEY, () => {
  it('RG-ADH-06b · raison sociale modifiée d’un dossier validé : justificatif exigé, envoyé en multipart', async () => {
    const { user } = await openMember(demoMemberIds.adjoua);

    await user.click(screen.getByRole('button', { name: labels.edit }));

    const dialog = screen.getByRole('dialog', { name: labels.editDialog.title });

    expect(fieldByLabel(dialog, fields.regime)).toBeDisabled();

    const name = fieldByLabel(dialog, fields.companyName);

    await user.clear(name);
    await user.type(name, 'Boulangerie Adjoua & Fils');
    await user.click(within(dialog).getByRole('button', { name: labels.editDialog.submit }));

    expect(await within(dialog).findByText(labels.editDialog.justificationRequired)).toBeVisible();
    expect(writes(`/cga/members/${demoMemberIds.adjoua}`)).toHaveLength(0);

    await user.upload(
      fieldByLabel(dialog, labels.editDialog.justification),
      new File(['%PDF-1.4'], 'kbis.pdf', { type: 'application/pdf' }),
    );
    await user.click(within(dialog).getByRole('button', { name: labels.editDialog.submit }));

    expect(await screen.findByText(labels.saved)).toBeInTheDocument();
    expect(bodyOf(-1, `/cga/members/${demoMemberIds.adjoua}`)).toMatchObject({
      _method: 'PUT',
      company_name: 'Boulangerie Adjoua & Fils',
    });

    // RG-ADH-07 : la raison sociale figure sur le contrat et l'attestation → le CGA décide.
    const regenerate = await screen.findByRole('dialog', { name: labels.regenerateDialog.title });

    await user.click(
      within(regenerate).getByRole('button', { name: labels.regenerateDialog.submit }),
    );

    expect(await screen.findByText(labels.regenerateDialog.done('2'))).toBeInTheDocument();
    expect(writes('/regenerate')).toHaveLength(2);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'BOULANGERIE ADJOUA & FILS' }),
    ).toBeVisible();
  });

  it('modification sans changement d’identité : envoyée en JSON, sans justificatif', async () => {
    const { user } = await openMember(demoMemberIds.bamba);

    await user.click(screen.getByRole('button', { name: labels.edit }));

    const dialog = screen.getByRole('dialog', { name: labels.editDialog.title });

    await user.type(fieldByLabel(dialog, fields.address), 'Marché de Treichville');
    await user.click(within(dialog).getByRole('button', { name: labels.editDialog.submit }));

    expect(await screen.findByText(labels.saved)).toBeInTheDocument();
    expect(writes(`/cga/members/${demoMemberIds.bamba}`).map((request) => request.method)).toEqual([
      'PUT',
    ]);

    // L'adresse figure sur les documents : « Plus tard » ne régénère rien (RG-ADH-07).
    const regenerate = await screen.findByRole('dialog', { name: labels.regenerateDialog.title });

    await user.click(
      within(regenerate).getByRole('button', { name: labels.regenerateDialog.later }),
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(writes('/regenerate')).toHaveLength(0);
    expect(valueOf(fields.address)).toBe('Marché de Treichville');
  });

  it('modification refusée (422) : message sous le champ', async () => {
    const { user } = await openMember(demoMemberIds.bamba);

    await user.click(screen.getByRole('button', { name: labels.edit }));
    server.failNext('PUT', apiUrl(`/cga/members/${demoMemberIds.bamba}`), {
      status: 422,
      data: {
        message: 'Téléphone invalide.',
        errors: { phone: ['Le numéro de téléphone n’est pas valide.'] },
      },
    });

    const dialog = screen.getByRole('dialog', { name: labels.editDialog.title });

    await user.click(within(dialog).getByRole('button', { name: labels.editDialog.submit }));

    expect(
      await within(dialog).findByText('Le numéro de téléphone n’est pas valide.'),
    ).toBeVisible();
  });

  it('RG-ADH-02 · brouillon : bandeau des manques, « Valider l’adhésion » avec la confirmation d’exclusivité', async () => {
    const { user } = await openMember(demoMemberIds.kouadio);

    expect(main().getByText(labels.noNumber)).toBeVisible();
    expect(
      screen.getByText(
        labels.banners.missing(fr.members.create.missing.items.cga_contract_signed_on),
      ),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: labels.validateDialog.action }));

    const dialog = screen.getByRole('dialog', { name: labels.validateDialog.title });

    await user.click(within(dialog).getByRole('button', { name: labels.validateDialog.submit }));
    // La validation du formulaire est asynchrone : on attend le message, assertion inchangée.
    expect(await within(dialog).findByText(fr.members.create.errors.confirm)).toBeVisible();

    await user.click(within(dialog).getByRole('checkbox', { name: fields.exclusivityConfirmed }));
    await user.click(within(dialog).getByRole('button', { name: labels.validateDialog.submit }));

    // Le serveur liste ce qui manque encore (RG-ADH-02).
    expect(
      await within(dialog).findByText(fr.members.create.missing.items.sector_id),
    ).toBeVisible();
    expect(
      within(dialog).getByText(fr.members.create.missing.items.entry_fee_payment),
    ).toBeVisible();
    expect(bodyOf(-1, '/validate')).toEqual({ exclusivity_confirmed: true });
  });

  it('RG-ADH-01 · « Supprimer le brouillon » : confirmation, puis l’onglet des dossiers à compléter', async () => {
    const { user, router } = await openMember(demoMemberIds.kouadio);

    await action(user, labels.deleteDialog.action);
    await user.click(
      within(screen.getByRole('dialog', { name: labels.deleteDialog.title })).getByRole('button', {
        name: labels.deleteDialog.submit,
      }),
    );

    expect(await screen.findByText(labels.deleteDialog.done)).toBeInTheDocument();
    await waitFor(() => {
      expect(`${router.state.location.pathname}${router.state.location.search}`).toBe(
        `${memberRoutes.list}?tab=brouillons`,
      );
    });
    expect(members.members().some((member) => member.id === demoMemberIds.kouadio)).toBe(false);
  });

  it('le formateur consulte le dossier sans action d’écriture', async () => {
    await openMember(demoMemberIds.adjoua, 'formateur');

    expect(screen.getByRole('button', { name: labels.edit })).toBeVisible();
    // Le bloc `can` vient du serveur : ici le jeu de démonstration l'ouvre ; c'est le serveur qui refuse.
    expect(screen.getByRole('button', { name: labels.actions })).toBeVisible();
  });
});

describe('/cga/adherents/:id · régime et radiation (F-ADH-05, 06, RG-ADH-08 à 18)', JOURNEY, () => {
  it('RG-ADH-08 · passage au RSI : avertissement, justificatif exigé, puis bandeau « Radiation requise »', async () => {
    const { user } = await openMember(demoMemberIds.bamba);

    await action(user, labels.regimeDialog.action);

    const dialog = screen.getByRole('dialog', { name: labels.regimeDialog.title });

    await user.selectOptions(fieldByLabel(dialog, labels.regimeDialog.regime), 'RSI');
    expect(within(dialog).getByText(labels.regimeDialog.realWarning)).toBeVisible();

    await user.type(fieldByLabel(dialog, labels.regimeDialog.reason), 'Notification de la DGI.');
    await user.click(within(dialog).getByRole('button', { name: labels.regimeDialog.submit }));
    await expectInvalid(fieldByLabel(dialog, labels.regimeDialog.justification));

    await user.upload(
      fieldByLabel(dialog, labels.regimeDialog.justification),
      new File(['%PDF-1.4'], 'avis.pdf', { type: 'application/pdf' }),
    );
    await user.click(within(dialog).getByRole('button', { name: labels.regimeDialog.submit }));

    expect(await screen.findByText(labels.regimeDialog.done)).toBeInTheDocument();
    // RG-ADH-18 : la plateforme alerte, l'utilisateur décide.
    expect(await screen.findByText(labels.banners.radiationRequired('0'))).toBeVisible();
    expect(bodyOf(-1, '/regimes')).toMatchObject({
      regime: 'RSI',
      reason: 'Notification de la DGI.',
    });
  });

  it('RG-ADH-17 · « Demander la radiation » : motifs selon l’initiateur, pièce exigée, puis « Radiation en cours »', async () => {
    const { user } = await openMember(demoMemberIds.bamba);

    await action(user, labels.radiationDialog.action);

    const dialog = await screen.findByRole('dialog', { name: labels.radiationDialog.title });
    const reason = fieldByLabel(dialog, labels.radiationDialog.reason);

    await waitFor(() => {
      expect(within(reason).getAllByRole('option')).toHaveLength(5);
    });
    expect(fieldByLabel(dialog, labels.radiationDialog.spReference)).toBeVisible();

    await user.selectOptions(reason, 'zone_change');
    await user.type(
      fieldByLabel(dialog, labels.radiationDialog.observation),
      'Déménagement à Bouaké.',
    );
    await user.click(within(dialog).getByRole('button', { name: labels.radiationDialog.submit }));

    await expectInvalid(
      fieldByLabel(dialog, labels.radiationDialog.proof('justificatif de transfert')),
    );

    await user.selectOptions(reason, 'reclassified_real_regime');
    await user.click(within(dialog).getByRole('button', { name: labels.radiationDialog.submit }));

    expect(await screen.findByText(labels.radiationDialog.done)).toBeInTheDocument();
    expect(await screen.findByText(labels.banners.radiationPending('26/10/2026'))).toBeVisible();
    expect(bodyOf(-1, '/radiation')).toMatchObject({
      initiator: 'cga',
      reason: 'reclassified_real_regime',
      validate_now: '0',
    });
    expect(bodyOf(-1, '/radiation')).not.toHaveProperty('outcome');
  });

  it('RG-PTF-04 · « Basculer vers le portefeuille Cabinet » : rappels, demande, validation enchaînée', async () => {
    const { user } = await openMember(demoMemberIds.adjoua);

    await action(user, labels.radiationDialog.toCabinetAction);

    const dialog = await screen.findByRole('dialog', {
      name: labels.radiationDialog.toCabinetTitle,
    });

    expect(within(dialog).getByText(labels.radiationDialog.cabinetReminder)).toBeVisible();
    // Dossier « Accessoire 1 » : le rattachement à l'apporteur prendra fin.
    expect(within(dialog).getByText(labels.radiationDialog.referrerWarning)).toBeVisible();

    await user.selectOptions(
      fieldByLabel(dialog, labels.radiationDialog.reason),
      'reclassified_real_regime',
    );
    await user.type(fieldByLabel(dialog, labels.radiationDialog.observation), 'Client devenu RSI.');
    await user.click(within(dialog).getByRole('button', { name: labels.radiationDialog.submit }));

    const validation = await screen.findByRole('dialog', {
      name: labels.validateRadiationDialog.title,
    });

    expect(
      within(validation).getByRole('radio', { name: 'Basculé dans le portefeuille Cabinet' }),
    ).toBeChecked();
    await user.click(
      within(validation).getByRole('button', { name: labels.validateRadiationDialog.submit }),
    );

    expect(await screen.findByText(labels.validateRadiationDialog.done)).toBeInTheDocument();
    await waitFor(() => {
      expect(main().getAllByText(fr.members.portfolio.badge.cabinet)[0]).toHaveAttribute(
        'data-portfolio',
        'cabinet',
      );
    });
    expect(bodyOf(-1, '/radiation/validate')).toEqual({
      outcome: 'moved_to_cabinet',
      validation_reference: null,
    });
  });

  it('RG-ADH-17 · radiation du contribuable « Valider immédiatement », puis « Annuler la radiation » (RG-ADH-11)', async () => {
    const { user } = await openMember(demoMemberIds.bamba);

    await action(user, labels.radiationDialog.action);

    const dialog = await screen.findByRole('dialog', { name: labels.radiationDialog.title });

    await user.click(within(dialog).getByRole('radio', { name: 'Contribuable' }));
    await user.selectOptions(
      fieldByLabel(dialog, labels.radiationDialog.reason),
      'dissatisfaction',
    );
    await user.click(
      within(dialog).getByRole('checkbox', { name: labels.radiationDialog.validateNow }),
    );
    await user.type(
      fieldByLabel(dialog, labels.radiationDialog.observation),
      'Lettre reçue le 20/10.',
    );
    await user.upload(
      fieldByLabel(dialog, labels.radiationDialog.proof('lettre de résiliation')),
      new File(['%PDF-1.4'], 'lettre.pdf', { type: 'application/pdf' }),
    );
    await user.click(within(dialog).getByRole('radio', { name: 'Dossier clos' }));
    await user.click(within(dialog).getByRole('button', { name: labels.radiationDialog.submit }));

    expect(await screen.findByText(labels.validateRadiationDialog.done)).toBeInTheDocument();
    expect(
      await screen.findByText(labels.banners.radiated('26/10/2026', 'Dossier clos')),
    ).toBeVisible();
    expect(bodyOf(-1, '/radiation')).toMatchObject({ validate_now: '1', outcome: 'closed' });

    await action(user, labels.cancelRadiationDialog.action);

    const cancel = screen.getByRole('dialog', { name: labels.cancelRadiationDialog.title });

    await user.click(
      within(cancel).getByRole('button', { name: labels.cancelRadiationDialog.submit }),
    );
    await expectInvalid(fieldByLabel(cancel, labels.cancelRadiationDialog.reason));
    await user.type(
      fieldByLabel(cancel, labels.cancelRadiationDialog.reason),
      'Lettre retirée par le client.',
    );
    await user.click(
      within(cancel).getByRole('button', { name: labels.cancelRadiationDialog.submit }),
    );

    expect(await screen.findByText(labels.cancelRadiationDialog.done)).toBeInTheDocument();
  });

  it('radiation en cours : « Valider la radiation » depuis le bandeau, issue « Dossier clos »', async () => {
    const { user } = await openMember(demoMemberIds.bamba);

    await action(user, labels.radiationDialog.action);
    const dialog = await screen.findByRole('dialog', { name: labels.radiationDialog.title });
    await user.selectOptions(
      fieldByLabel(dialog, labels.radiationDialog.reason),
      'reclassified_real_regime',
    );
    await user.type(fieldByLabel(dialog, labels.radiationDialog.observation), 'RSI.');
    await user.click(within(dialog).getByRole('button', { name: labels.radiationDialog.submit }));
    await screen.findByText(labels.banners.radiationPending('26/10/2026'));

    await user.click(screen.getByRole('button', { name: labels.validateRadiationDialog.action }));

    const validation = screen.getByRole('dialog', { name: labels.validateRadiationDialog.title });

    expect(within(validation).getByRole('radio', { name: 'Dossier clos' })).toBeChecked();
    await user.type(
      fieldByLabel(validation, labels.validateRadiationDialog.reference),
      'SP-2026-114',
    );
    await user.click(
      within(validation).getByRole('button', { name: labels.validateRadiationDialog.submit }),
    );

    expect(await screen.findByText(labels.validateRadiationDialog.done)).toBeInTheDocument();
    expect(bodyOf(-1, '/radiation/validate')).toEqual({
      outcome: 'closed',
      validation_reference: 'SP-2026-114',
    });
  });

  it('RG-PTF-03 · « Basculer vers le portefeuille CGA » : contrat confirmé, puis droit d’adhésion payé avec la bascule', async () => {
    const { user } = await openMember(cabinetTeeId);

    await action(user, labels.moveDialog.action);

    const dialog = screen.getByRole('dialog', { name: labels.moveDialog.title });

    await user.click(within(dialog).getByRole('button', { name: labels.moveDialog.submit }));
    await expectInvalid(fieldByLabel(dialog, fields.contractSignedOn));

    await user.type(fieldByLabel(dialog, fields.contractSignedOn), '2026-10-20');
    await user.click(within(dialog).getByRole('checkbox', { name: fields.contractConfirmed }));
    await user.click(within(dialog).getByRole('button', { name: labels.moveDialog.submit }));

    // Le serveur annonce le droit d'adhésion dû (TTC) : le paiement part avec la bascule.
    expect(
      await within(dialog).findByText(/Droit d’adhésion à payer : 29\s500\sF\./),
    ).toBeVisible();
    expect(fieldByLabel(dialog, labels.moveDialog.amount)).toHaveValue('29500');

    await user.selectOptions(fieldByLabel(dialog, labels.moveDialog.method), 'cash');
    await user.click(within(dialog).getByRole('button', { name: labels.moveDialog.submit }));

    expect(await screen.findByText(labels.moveDialog.done('2026-DCK-0151'))).toBeInTheDocument();
    expect(bodyOf(-1, '/portfolio/cga')).toMatchObject({
      cga_contract_signed_on: '2026-10-20',
      cga_contract_confirmed: '1',
      'entry_fee_payment[amount]': '29500',
      'entry_fee_payment[method]': 'cash',
    });
  });
});

describe('/cga/adherents/:id · compléments et refus du serveur', JOURNEY, () => {
  it('entreprise individuelle : dirigeant dans l’onglet Identité, sans capital social', async () => {
    await openMember(individualId);

    expect(valueOf(fields.ownerLastName)).toBe('Kouassi');
    expect(valueOf(fields.ownerIdDocumentNumber)).toBe('C0123456');
    expect(screen.getAllByRole('term').map((term) => term.textContent)).not.toContain(
      fields.shareCapital,
    );
    expect(valueOf(labels.fields.revenue)).toMatch(/^12\s000\s000\sF \(Exercice N-1, 2025\)$/);
  });

  it('brouillon du Cabinet validé : « Dossier client créé — n° CAB-… », sans confirmation d’exclusivité', async () => {
    const { user } = await openMember(cabinetDraftId);

    await user.click(screen.getByRole('button', { name: labels.validateDialog.action }));

    const dialog = screen.getByRole('dialog', { name: labels.validateDialog.title });

    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: labels.validateDialog.submit }));

    expect(
      await screen.findByText(fr.members.create.clientCreated('CAB-DCK-00003')),
    ).toBeInTheDocument();
    expect(bodyOf(-1, '/validate')).toEqual({ exclusivity_confirmed: false });
  });

  it('suppression refusée (409) : message dans la modale ; « Annuler » ferme une modale sans rien envoyer', async () => {
    const { user } = await openMember(demoMemberIds.kouadio);

    await action(user, labels.deleteDialog.action);
    server.failNext('DELETE', apiUrl(`/cga/members/${demoMemberIds.kouadio}`), {
      status: 409,
      data: {
        message: 'Un document a déjà été émis pour ce dossier.',
        code: 'draft_has_documents',
        details: {},
      },
    });

    const dialog = screen.getByRole('dialog', { name: labels.deleteDialog.title });

    await user.click(within(dialog).getByRole('button', { name: labels.deleteDialog.submit }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Un document a déjà été émis',
    );

    await user.click(within(dialog).getByRole('button', { name: fr.common.cancel }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: labels.edit }));
    await user.click(
      within(screen.getByRole('dialog', { name: labels.editDialog.title })).getByRole('button', {
        name: fr.common.cancel,
      }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('régime : motif et date obligatoires ; justificatif refusé par le serveur (422) sous son champ', async () => {
    const { user } = await openMember(demoMemberIds.bamba);

    await action(user, labels.regimeDialog.action);

    const dialog = screen.getByRole('dialog', { name: labels.regimeDialog.title });

    await user.clear(fieldByLabel(dialog, labels.regimeDialog.effectiveDate));
    await user.click(within(dialog).getByRole('button', { name: labels.regimeDialog.submit }));
    await expectInvalid(fieldByLabel(dialog, labels.regimeDialog.reason));
    await expectInvalid(fieldByLabel(dialog, labels.regimeDialog.effectiveDate));

    await user.type(fieldByLabel(dialog, labels.regimeDialog.effectiveDate), '2026-10-01');
    await user.type(fieldByLabel(dialog, labels.regimeDialog.reason), 'Option du contribuable.');
    await user.upload(
      fieldByLabel(dialog, labels.regimeDialog.justification),
      new File(['x'], 'avis.pdf', { type: 'application/pdf' }),
    );
    server.failNext('POST', apiUrl(`/cga/members/${demoMemberIds.bamba}/regimes`), {
      status: 422,
      data: {
        message: 'Fichier refusé.',
        errors: { justification: ['Le fichier doit être un PDF, un JPG ou un PNG.'] },
      },
    });
    await user.click(within(dialog).getByRole('button', { name: labels.regimeDialog.submit }));

    expect(
      await within(dialog).findByText('Le fichier doit être un PDF, un JPG ou un PNG.'),
    ).toBeVisible();
  });

  it('radiation « Autre » : précision exigée ; pièce refusée (422) sous son champ ; 409 en bandeau', async () => {
    const { user } = await openMember(demoMemberIds.bamba);

    await action(user, labels.radiationDialog.action);

    const dialog = await screen.findByRole('dialog', { name: labels.radiationDialog.title });
    const reason = fieldByLabel(dialog, labels.radiationDialog.reason);

    await waitFor(() => {
      expect(within(reason).getAllByRole('option').length).toBeGreaterThan(1);
    });
    await user.selectOptions(reason, 'other');
    await user.type(fieldByLabel(dialog, labels.radiationDialog.observation), 'Autre motif.');
    await user.click(within(dialog).getByRole('button', { name: labels.radiationDialog.submit }));
    await expectInvalid(fieldByLabel(dialog, labels.radiationDialog.reasonOther));

    await user.type(fieldByLabel(dialog, labels.radiationDialog.reasonOther), 'Fusion de sociétés');
    server.failNext('POST', apiUrl(`/cga/members/${demoMemberIds.bamba}/radiation`), {
      status: 422,
      data: { message: 'Pièce refusée.', errors: { proof: ['La pièce doit être un PDF.'] } },
    });
    await user.click(within(dialog).getByRole('button', { name: labels.radiationDialog.submit }));
    expect(await within(dialog).findByText('La pièce doit être un PDF.')).toBeVisible();

    server.failNext('POST', apiUrl(`/cga/members/${demoMemberIds.bamba}/radiation`), {
      status: 409,
      data: { message: 'Une radiation est déjà en cours.', code: 'radiation_pending', details: {} },
    });
    await user.click(within(dialog).getByRole('button', { name: labels.radiationDialog.submit }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Une radiation est déjà en cours.',
    );
    expect(bodyOf(-1, '/radiation')).toMatchObject({
      reason: 'other',
      reason_other: 'Fusion de sociétés',
    });
  });

  it('bascule vers le CGA : montant invalide refusé avant l’envoi', async () => {
    const { user } = await openMember(cabinetTeeId);

    await action(user, labels.moveDialog.action);

    const dialog = screen.getByRole('dialog', { name: labels.moveDialog.title });

    await user.type(fieldByLabel(dialog, fields.contractSignedOn), '2026-10-20');
    await user.click(within(dialog).getByRole('checkbox', { name: fields.contractConfirmed }));
    await user.click(within(dialog).getByRole('button', { name: labels.moveDialog.submit }));
    await within(dialog).findByText(/Droit d’adhésion à payer/);

    await user.clear(fieldByLabel(dialog, labels.moveDialog.amount));
    await user.type(fieldByLabel(dialog, labels.moveDialog.amount), '29 500');

    const sent = writes('/portfolio/cga').length;

    await user.click(within(dialog).getByRole('button', { name: labels.moveDialog.submit }));
    await expectInvalid(fieldByLabel(dialog, labels.moveDialog.amount));
    expect(writes('/portfolio/cga')).toHaveLength(sent);
  });

  it('pièce refusée (409) : toast du message du serveur', async () => {
    const { user } = await openMember(demoMemberIds.bamba);

    await user.click(screen.getByRole('tab', { name: labels.tabs.pieces }));

    const list = await screen.findByRole('list', { name: labels.pieces.caption });

    server.failNext('POST', apiUrl(`/cga/members/${demoMemberIds.bamba}/pieces/rccm`), {
      status: 409,
      data: { message: 'Ce dossier est clos.', code: 'member_closed', details: {} },
    });
    await user.upload(
      within(list).getByLabelText(labels.pieces.uploadLabel('Registre du commerce (RCCM)')),
      new File(['%PDF-1.4'], 'rccm.pdf', { type: 'application/pdf' }),
    );

    expect(await screen.findByText('Ce dossier est clos.')).toBeInTheDocument();
  });

  it('accès principal déjà ouvert (409) dans la modale ; 422 sous le champ ; action refusée : toast', async () => {
    const { user } = await openMember(demoMemberIds.adjoua);

    await user.click(screen.getByRole('tab', { name: labels.tabs.accesses }));
    await screen.findByRole('list', { name: labels.accesses.caption });
    await user.click(screen.getByRole('button', { name: labels.accesses.invite }));

    const dialog = screen.getByRole('dialog', { name: labels.accesses.dialog.title });

    await user.type(fieldByLabel(dialog, labels.accesses.dialog.firstName), 'Paul');
    await user.type(fieldByLabel(dialog, labels.accesses.dialog.lastName), 'Second');
    await user.click(within(dialog).getByRole('radio', { name: fr.roles.member_owner }));
    await user.click(within(dialog).getByRole('button', { name: labels.accesses.dialog.submit }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Cet adhérent a déjà un accès principal.',
    );

    server.failNext('POST', apiUrl(`/cga/members/${demoMemberIds.adjoua}/accesses`), {
      status: 422,
      data: {
        message: 'Téléphone invalide.',
        errors: { phone: ['Le numéro de téléphone n’est pas valide.'] },
      },
    });
    await user.click(within(dialog).getByRole('radio', { name: fr.roles.member_user }));
    await user.click(within(dialog).getByRole('button', { name: labels.accesses.dialog.submit }));
    expect(
      await within(dialog).findByText('Le numéro de téléphone n’est pas valide.'),
    ).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: fr.common.cancel }));

    server.failNext(
      'POST',
      apiUrl(`/cga/members/${demoMemberIds.adjoua}/accesses/01acc000000000000000000001/disable`),
      {
        status: 409,
        data: {
          message: 'Le dernier accès principal ne se désactive pas.',
          code: 'last_owner',
          details: {},
        },
      },
    );
    await user.click(screen.getByRole('button', { name: labels.accesses.disable }));
    expect(
      await screen.findByText('Le dernier accès principal ne se désactive pas.'),
    ).toBeInTheDocument();
  });

  it('onglet en panne : bandeau et « Réessayer » ; historique paginé', async () => {
    const { user } = await openMember(demoMemberIds.adjoua);

    members.records.seedHistory(
      demoMemberIds.adjoua,
      Array.from({ length: 30 }, (_, index) =>
        members.records.historyEntry(index + 1, {
          changes: [
            {
              field: 'phone',
              label: 'Téléphone',
              before: null,
              after: `+22507000000${String(index).padStart(2, '0')}`,
            },
          ],
        }),
      ),
    );
    server.failNext('GET', apiUrl(`/cga/members/${demoMemberIds.adjoua}/pieces`), { status: 500 });
    server.failNext('GET', apiUrl(`/cga/members/${demoMemberIds.adjoua}/pieces`), { status: 500 });
    await user.click(screen.getByRole('tab', { name: labels.tabs.pieces }));
    expect(await screen.findByText(labels.pieces.loadError, {}, { timeout: 4000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.common.retry }));
    expect(await screen.findByRole('list', { name: labels.pieces.caption })).toBeVisible();

    await user.click(screen.getByRole('tab', { name: labels.tabs.history }));

    const list = await screen.findByRole('list', { name: labels.history.caption });

    expect(within(list).getByText('+2250700000000')).toBeVisible();
    expect(screen.getByText('1 / 2')).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.table.next }));
    expect(await screen.findByText('+2250700000029')).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.table.previous }));
    expect(await screen.findByText('+2250700000000')).toBeVisible();
  });
});
