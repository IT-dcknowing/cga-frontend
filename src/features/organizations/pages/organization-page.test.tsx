import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { organizationRoutes } from '@/features/organizations/lib/organization';
import { fr } from '@/lib/i18n/fr';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import { fieldByLabel } from '@/test/fields';
import { renderApp } from '@/test/render-app';

/*
 * `/cncga/membres/:id` (F-ORG-04 à 07) dans l'application : fiche, onglets, modification en place,
 * abonnement, suspension, réactivation, retrait d'agrément, gérant ; backend simulé.
 */
const labels = fr.organization;
const fields = labels.fields;

let server: ReturnType<typeof installApiServer>;

afterEach(() => {
  server.restore();
});

const accesses = {
  presidente: ['0700000001', demoIds.president],
  gestionnaire: ['0700000003', demoIds.multiCncga],
  bureau: ['0700000013', demoIds.board],
} as const;

const names: Record<string, string> = {
  [demoIds.dck]: 'DC-KNOWING CGA',
  [demoIds.bouake]: 'CGA Démo Bouaké',
  [demoIds.suspended]: 'CGA Démo Suspendu',
};

async function openFiche(id: string, who: keyof typeof accesses = 'presidente') {
  server = installApiServer();

  const [phone, membershipId] = accesses[who];

  server.signIn(phone, membershipId);

  const session = await httpAuthApi.currentSession();
  const view = renderApp({ api: httpAuthApi, session, entry: organizationRoutes.detail(id) });

  if (id in names) {
    await screen.findByRole('heading', { level: 1, name: names[id] });
  }

  return { user: userEvent.setup(), ...view };
}

/** Valeur affichée en face d'une étiquette de la fiche (04-UX-UI §7). */
function valueOf(label: string): string | null {
  const term = screen.getAllByRole('term').find((item) => item.textContent === label);

  return term?.nextElementSibling?.textContent ?? null;
}

function lastWrite() {
  return server.requests.filter((request) => request.method !== 'GET').at(-1);
}

function main() {
  return within(screen.getByRole('main'));
}

describe('/cncga/membres/:id · fiche d’un CGA (F-ORG-04)', () => {
  it('en-tête : dénomination, sigle, statut, agrément et abonnement ; fil d’Ariane vers le registre', async () => {
    const { user, router } = await openFiche(demoIds.dck);

    // Sigle sous le titre, puis dans la fiche.
    expect(main().getAllByText('DCK')).toHaveLength(2);
    expect(main().getAllByText(fr.status.organization.active)[0]).toHaveAttribute(
      'data-tone',
      'success',
    );
    expect(main().getAllByText(fr.status.agreement.granted)[0]).toBeInTheDocument();
    expect(main().getAllByText(fr.status.subscription.active)[0]).toBeInTheDocument();

    await user.click(main().getByRole('link', { name: fr.nav.cncgaMembers }));

    expect(router.state.location.pathname).toBe(organizationRoutes.list);
  });

  it('onglet Identité : la fiche du registre en clé / valeur', async () => {
    await openFiche(demoIds.dck);

    expect(valueOf(fields.phone)).toBe('+2252722445501');
    expect(valueOf(fields.region)).toBe('DR Abidjan (démonstration)');
    expect(valueOf(fields.agreementNumber)).toBe('AGR-DEMO-001');
    expect(valueOf(fields.agreementDate)).toBe('01/01/2018');
    expect(valueOf(fields.subscriptionStartedAt)).toBe('01/01/2026');
    // RG-ORG-02 : calculé par le serveur.
    expect(valueOf(fields.members)).toBe('3');
    expect(valueOf(fields.profile)).toBe(labels.profileIncomplete);
    expect(screen.getByText(labels.history.empty)).toBeInTheDocument();
  });

  it('RG-ORG-03 · agrément en cours : bandeau « ne peut pas inscrire d’adhérents »', async () => {
    await openFiche(demoIds.bouake);

    expect(screen.getByText(labels.banners.pending)).toBeInTheDocument();
    expect(valueOf(fields.region)).toBe('DR Bouaké (démonstration)');
  });

  it('RG-ORG-08 · CGA suspendu : bandeau rouge, motif, historique tracé et « Réactiver »', async () => {
    await openFiche(demoIds.suspended);

    expect(
      screen.getByText(
        labels.banners.suspended('01/10/2026', 'Démonstration : cotisation impayée'),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(labels.history.by('Aminata Présidente'), { exact: false }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: labels.reactivate.action })).toBeVisible();
    expect(screen.queryByRole('button', { name: labels.suspend.action })).not.toBeInTheDocument();
  });

  it('onglet Utilisateurs : le gérant du CGA ; les autres onglets « Bientôt disponible »', async () => {
    const { user } = await openFiche(demoIds.dck);

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      labels.tabs.identity,
      labels.tabs.users,
      labels.tabs.dues,
      labels.tabs.reports,
      labels.tabs.figures,
      labels.tabs.concerns,
    ]);

    await user.click(screen.getByRole('tab', { name: labels.tabs.users }));

    const users = within(screen.getByRole('tabpanel', { name: labels.tabs.users }));

    expect(users.getByText('Koffi Gérant')).toBeInTheDocument();
    expect(users.getByText('+2250700000002')).toBeInTheDocument();
    // Le CGA a déjà son gérant : pas de seconde invitation.
    expect(users.queryByRole('button', { name: labels.invite.action })).not.toBeInTheDocument();

    for (const tab of [
      labels.tabs.dues,
      labels.tabs.reports,
      labels.tabs.figures,
      labels.tabs.concerns,
    ]) {
      await user.click(screen.getByRole('tab', { name: tab }));

      expect(
        within(screen.getByRole('tabpanel', { name: tab })).getByText(fr.common.comingSoon),
      ).toBeInTheDocument();
    }
  });

  it('03-APPFLOW §7 · CGA inconnu : « Élément introuvable », sans toast', async () => {
    await openFiche('01cga999999999999999999999');

    expect(
      await screen.findByRole('heading', { level: 1, name: fr.errorScreens.notFoundTitle }),
    ).toBeVisible();
    expect(screen.queryByText(fr.errors.http.notFound)).not.toBeInTheDocument();
  });

  it('erreur du serveur : bandeau et « Réessayer »', async () => {
    server = installApiServer();
    server.signIn('0700000001', demoIds.president);
    server.failNext('GET', apiUrl(`/network/organizations/${demoIds.dck}`), { status: 500 });
    server.failNext('GET', apiUrl(`/network/organizations/${demoIds.dck}`), { status: 500 });

    const session = await httpAuthApi.currentSession();
    renderApp({ api: httpAuthApi, session, entry: organizationRoutes.detail(demoIds.dck) });

    expect(await screen.findByText(labels.loadError, {}, { timeout: 4000 })).toBeVisible();

    await userEvent.setup().click(screen.getByRole('button', { name: fr.common.retry }));

    expect(await screen.findByRole('heading', { level: 1, name: 'DC-KNOWING CGA' })).toBeVisible();
  });
});

describe('Modifier la fiche en place (03-APPFLOW §3.2)', () => {
  async function startEditing(id: string = demoIds.dck) {
    const view = await openFiche(id);

    await view.user.click(screen.getByRole('button', { name: labels.edit }));

    const panel = screen.getByRole('tabpanel', { name: labels.tabs.identity });

    return { ...view, panel };
  }

  it('formulaire prérempli ; Enregistrer → PUT de la fiche, toast, retour à la fiche mise à jour', async () => {
    const { user, panel } = await startEditing();

    expect(fieldByLabel(panel, fields.name)).toHaveValue('DC-KNOWING CGA');
    expect(within(panel).getByRole('radio', { name: labels.agreement.granted })).toBeChecked();

    await user.clear(fieldByLabel(panel, fields.city));
    await user.type(fieldByLabel(panel, fields.city), 'Abidjan-Plateau');
    await user.click(within(panel).getByRole('button', { name: labels.save }));

    expect(await screen.findByText(labels.saved)).toBeInTheDocument();
    expect(lastWrite()).toMatchObject({
      method: 'PUT',
      url: apiUrl(`/network/organizations/${demoIds.dck}`),
      body: {
        name: 'DC-KNOWING CGA',
        sigle: 'DCK',
        city: 'Abidjan-Plateau',
        phone_1: '+2252722445501',
        email: 'contact@dcknowing.demo',
        agreement_status: 'granted',
        agreement_number: 'AGR-DEMO-001',
        agreement_date: '2018-01-01',
      },
    });
    expect(valueOf(fields.city)).toBe('Abidjan-Plateau');
    expect(within(panel).queryByRole('button', { name: labels.save })).not.toBeInTheDocument();
  });

  it('RG-ORG-03 · un CGA agréé garde son n° d’agrément', async () => {
    const { user, panel } = await startEditing();

    await user.clear(fieldByLabel(panel, fields.agreementNumber));
    await user.click(within(panel).getByRole('button', { name: labels.save }));

    expect(within(panel).getByText(labels.errors.agreementNumberRequired)).toBeInTheDocument();
    expect(lastWrite()).toBeUndefined();
  });

  it('CGA en cours : saisir son agrément le rend agréé, le bandeau disparaît', async () => {
    const { user, panel } = await startEditing(demoIds.bouake);

    await user.click(within(panel).getByRole('radio', { name: labels.agreement.granted }));
    await user.type(fieldByLabel(panel, fields.agreementNumber), 'AGR-DEMO-002');
    await user.type(fieldByLabel(panel, fields.agreementDate), '2026-03-01');
    await user.click(within(panel).getByRole('button', { name: labels.save }));

    await screen.findByText(labels.saved);
    expect(screen.queryByText(labels.banners.pending)).not.toBeInTheDocument();
    expect(main().getAllByText(fr.status.agreement.granted)).not.toHaveLength(0);
  });

  it('03-APPFLOW §7 · refus 422 : sous le champ, saisie conservée, toujours en modification', async () => {
    const { user, panel } = await startEditing();

    await user.clear(fieldByLabel(panel, fields.agreementNumber));
    await user.type(fieldByLabel(panel, fields.agreementNumber), 'AGR-DEMO-003');
    await user.click(within(panel).getByRole('button', { name: labels.save }));

    expect(
      await within(panel).findByText('La valeur du champ n° d’agrément est déjà utilisée.'),
    ).toBeInTheDocument();
    expect(fieldByLabel(panel, fields.agreementNumber)).toHaveFocus();
    expect(fieldByLabel(panel, fields.agreementNumber)).toHaveValue('AGR-DEMO-003');
  });

  it('« Annuler » revient à la fiche sans rien envoyer', async () => {
    const { user, panel } = await startEditing();

    await user.type(fieldByLabel(panel, fields.city), ' Nord');
    await user.click(within(panel).getByRole('button', { name: fr.common.cancel }));

    expect(valueOf(fields.city)).toBe('Abidjan');
    expect(lastWrite()).toBeUndefined();
  });

  it('03-APPFLOW §7 · fiche modifiée : quitter la page demande « Quitter sans enregistrer ? »', async () => {
    const { user, panel, router } = await startEditing();

    await user.type(fieldByLabel(panel, fields.city), ' Nord');
    await user.click(main().getByRole('link', { name: fr.nav.cncgaMembers }));
    await user.click(screen.getByRole('button', { name: fr.unsaved.stay }));

    expect(router.state.location.pathname).toBe(organizationRoutes.detail(demoIds.dck));
    expect(fieldByLabel(panel, fields.city)).toHaveValue('Abidjan Nord');

    await user.click(main().getByRole('link', { name: fr.nav.cncgaMembers }));
    await user.click(screen.getByRole('button', { name: fr.unsaved.leave }));

    expect(router.state.location.pathname).toBe(organizationRoutes.list);
  });

  it('changer d’onglet ne perd pas la modification en cours', async () => {
    const { user, panel } = await startEditing();

    await user.type(fieldByLabel(panel, fields.city), ' Nord');
    await user.click(screen.getByRole('tab', { name: labels.tabs.users }));
    await user.click(screen.getByRole('tab', { name: labels.tabs.identity }));

    expect(fieldByLabel(panel, fields.city)).toHaveValue('Abidjan Nord');
  });
});

describe('Abonnement (F-ORG-05)', () => {
  it('modale : état actuel présélectionné → Essai avec motif → POST, toast, badge', async () => {
    const { user } = await openFiche(demoIds.bouake);

    await user.click(screen.getByRole('button', { name: labels.subscription.action }));

    const dialog = screen.getByRole('dialog', { name: labels.subscription.title });

    expect(
      within(dialog)
        .getAllByRole('radio')
        .map((radio) => radio.getAttribute('value')),
    ).toEqual(['none', 'trial', 'active', 'terminated']);
    expect(within(dialog).getByRole('radio', { name: fr.status.subscription.none })).toBeChecked();

    await user.click(within(dialog).getByRole('radio', { name: fr.status.subscription.trial }));
    await user.type(fieldByLabel(dialog, labels.subscription.reason), 'Pilote');
    await user.click(within(dialog).getByRole('button', { name: labels.subscription.submit }));

    expect(await screen.findByText(labels.subscription.done)).toBeInTheDocument();
    expect(lastWrite()).toMatchObject({
      url: apiUrl(`/network/organizations/${demoIds.bouake}/subscription`),
      body: { status: 'trial', reason: 'Pilote' },
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(main().getAllByText(fr.status.subscription.trial)).not.toHaveLength(0);
  });

  it('409 « état inchangé » : le message de l’API reste dans la modale', async () => {
    const { user } = await openFiche(demoIds.bouake);

    await user.click(screen.getByRole('button', { name: labels.subscription.action }));

    const dialog = screen.getByRole('dialog', { name: labels.subscription.title });

    await user.click(within(dialog).getByRole('button', { name: labels.subscription.submit }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Ce CGA a déjà cet état d’abonnement.',
    );
  });
});

describe('Suspension, réactivation, retrait d’agrément (F-ORG-06, F-ORG-07, Présidente)', () => {
  async function openDialog(id: string, action: string, title: string) {
    const view = await openFiche(id);

    await view.user.click(screen.getByRole('button', { name: action }));

    return { ...view, dialog: screen.getByRole('dialog', { name: title }) };
  }

  it('03-APPFLOW §7 · suspension : effets repris, motif et case « Je confirme » obligatoires', async () => {
    const { user, dialog } = await openDialog(
      demoIds.dck,
      labels.suspend.action,
      labels.suspend.title,
    );

    expect(
      within(dialog)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([...labels.suspend.effects]);

    await user.click(within(dialog).getByRole('button', { name: labels.suspend.submit }));

    expect(within(dialog).getByText(labels.errors.reasonRequired)).toBeInTheDocument();
    expect(within(dialog).getByText(labels.errors.confirmRequired)).toBeInTheDocument();
    expect(lastWrite()).toBeUndefined();
  });

  it('Confirmer la suspension → POST motif, toast, bandeau, historique et « Réactiver »', async () => {
    const { user, dialog } = await openDialog(
      demoIds.dck,
      labels.suspend.action,
      labels.suspend.title,
    );

    await user.type(fieldByLabel(dialog, labels.suspend.reason), 'Rapports non transmis');
    await user.click(
      within(dialog).getByRole('checkbox', { name: labels.suspend.confirm('DC-KNOWING CGA') }),
    );
    await user.click(within(dialog).getByRole('button', { name: labels.suspend.submit }));

    expect(await screen.findByText(labels.suspend.done)).toBeInTheDocument();
    expect(lastWrite()).toMatchObject({
      url: apiUrl(`/network/organizations/${demoIds.dck}/suspend`),
      body: { reason: 'Rapports non transmis' },
    });
    expect(
      screen.getByText(labels.banners.suspended('22/10/2026', 'Rapports non transmis')),
    ).toBeInTheDocument();
    // Historique : l'événement et son motif.
    expect(screen.getAllByText('Rapports non transmis')).not.toHaveLength(0);
    expect(screen.getByRole('button', { name: labels.reactivate.action })).toBeVisible();
  });

  it('03-APPFLOW §7 · conflit 409 : le message de l’API reste dans la modale', async () => {
    const { user, dialog } = await openDialog(
      demoIds.dck,
      labels.suspend.action,
      labels.suspend.title,
    );

    server.failNext('POST', apiUrl(`/network/organizations/${demoIds.dck}/suspend`), {
      status: 409,
      data: { message: 'Ce CGA est déjà suspendu.', code: 'organization_already_suspended' },
    });
    await user.type(fieldByLabel(dialog, labels.suspend.reason), 'Motif');
    await user.click(
      within(dialog).getByRole('checkbox', { name: labels.suspend.confirm('DC-KNOWING CGA') }),
    );
    await user.click(within(dialog).getByRole('button', { name: labels.suspend.submit }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Ce CGA est déjà suspendu.');
  });

  it('Réactiver : motif obligatoire, puis POST, toast, bandeau levé', async () => {
    const { user, dialog } = await openDialog(
      demoIds.suspended,
      labels.reactivate.action,
      labels.reactivate.title,
    );

    await user.click(within(dialog).getByRole('button', { name: labels.reactivate.submit }));

    expect(within(dialog).getByText(labels.errors.reasonRequired)).toBeInTheDocument();

    await user.type(fieldByLabel(dialog, labels.reactivate.reason), 'Cotisation réglée');
    await user.click(within(dialog).getByRole('button', { name: labels.reactivate.submit }));

    expect(await screen.findByText(labels.reactivate.done)).toBeInTheDocument();
    expect(lastWrite()).toMatchObject({
      url: apiUrl(`/network/organizations/${demoIds.suspended}/reactivate`),
      body: { reason: 'Cotisation réglée' },
    });
    expect(screen.queryByText(/CGA suspendu depuis/)).not.toBeInTheDocument();
  });

  it('F-ORG-07 · retrait d’agrément : effets, date, motif et confirmation obligatoires', async () => {
    const { user, dialog } = await openDialog(
      demoIds.dck,
      labels.withdraw.action,
      labels.withdraw.title,
    );

    expect(
      within(dialog)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([...labels.withdraw.effects]);

    await user.click(within(dialog).getByRole('button', { name: labels.withdraw.submit }));

    expect(within(dialog).getByText(labels.errors.dateRequired)).toBeInTheDocument();
    expect(within(dialog).getByText(labels.errors.reasonRequired)).toBeInTheDocument();
    expect(within(dialog).getByText(labels.errors.confirmRequired)).toBeInTheDocument();
  });

  it('F-ORG-07 · Confirmer → POST, CGA suspendu, agrément retiré : plus de modification ni de second retrait', async () => {
    const { user, dialog } = await openDialog(
      demoIds.dck,
      labels.withdraw.action,
      labels.withdraw.title,
    );

    await user.type(fieldByLabel(dialog, labels.withdraw.date), '2026-10-20');
    await user.type(fieldByLabel(dialog, labels.withdraw.reason), 'Manquement réglementaire');
    await user.click(
      within(dialog).getByRole('checkbox', { name: labels.withdraw.confirm('DC-KNOWING CGA') }),
    );
    await user.click(within(dialog).getByRole('button', { name: labels.withdraw.submit }));

    expect(await screen.findByText(labels.withdraw.done)).toBeInTheDocument();
    expect(lastWrite()).toMatchObject({
      url: apiUrl(`/network/organizations/${demoIds.dck}/withdraw-agreement`),
      body: { withdrawn_at: '2026-10-20', reason: 'Manquement réglementaire' },
    });
    expect(screen.getByText(labels.banners.withdrawn('20/10/2026'))).toBeInTheDocument();
    expect(main().getAllByText(fr.status.agreement.withdrawn)).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: labels.edit })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: labels.withdraw.action })).not.toBeInTheDocument();
  });

  it('RG-ROLE-04 · le gestionnaire du CNCGA modifie et gère l’abonnement, sans suspendre ni retirer l’agrément', async () => {
    await openFiche(demoIds.dck, 'gestionnaire');

    expect(screen.getByRole('button', { name: labels.subscription.action })).toBeVisible();
    expect(screen.getByRole('button', { name: labels.edit })).toBeVisible();
    expect(screen.queryByRole('button', { name: labels.suspend.action })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: labels.withdraw.action })).not.toBeInTheDocument();
  });

  it('01-PRD §3.3 · le bureau consulte la fiche, sans aucune action', async () => {
    await openFiche(demoIds.suspended, 'bureau');

    expect(
      screen.queryByRole('button', { name: labels.subscription.action }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: labels.reactivate.action }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: labels.edit })).not.toBeInTheDocument();
  });
});

describe('Inviter un gérant (F-ORG-02, « Ouvrir l’accès »)', () => {
  async function openInvitation() {
    const view = await openFiche(demoIds.bouake);

    await view.user.click(screen.getByRole('tab', { name: labels.tabs.users }));

    expect(screen.getByText(labels.manager.none)).toBeInTheDocument();

    await view.user.click(screen.getByRole('button', { name: labels.invite.action }));

    return { ...view, dialog: screen.getByRole('dialog', { name: labels.invite.title }) };
  }

  it('prénom, nom et téléphone obligatoires', async () => {
    const { user, dialog } = await openInvitation();

    await user.click(within(dialog).getByRole('button', { name: labels.invite.submit }));

    expect(within(dialog).getByText(labels.errors.firstNameRequired)).toBeInTheDocument();
    expect(within(dialog).getByText(labels.errors.lastNameRequired)).toBeInTheDocument();
    expect(within(dialog).getByText(labels.errors.phoneRequired)).toBeInTheDocument();
  });

  it('Envoyer l’invitation → POST …/manager, toast, le gérant invité s’affiche', async () => {
    const { user, dialog } = await openInvitation();

    await user.type(fieldByLabel(dialog, labels.invite.firstName), 'Awa');
    await user.type(fieldByLabel(dialog, labels.invite.lastName), 'Koné');
    await user.type(fieldByLabel(dialog, labels.invite.phone), '0700000030');
    await user.click(within(dialog).getByRole('button', { name: labels.invite.submit }));

    expect(await screen.findByText(labels.invite.done)).toBeInTheDocument();
    expect(lastWrite()).toMatchObject({
      url: apiUrl(`/network/organizations/${demoIds.bouake}/manager`),
      body: { first_name: 'Awa', last_name: 'Koné', phone: '0700000030' },
    });

    const users = within(screen.getByRole('tabpanel', { name: labels.tabs.users }));

    expect(users.getByText('Awa Koné')).toBeInTheDocument();
    expect(users.getByText('Invité')).toBeInTheDocument();
    expect(users.queryByRole('button', { name: labels.invite.action })).not.toBeInTheDocument();
  });

  it('refus 422 du téléphone : sous le champ', async () => {
    const { user, dialog } = await openInvitation();

    await user.type(fieldByLabel(dialog, labels.invite.firstName), 'Awa');
    await user.type(fieldByLabel(dialog, labels.invite.lastName), 'Koné');
    await user.type(fieldByLabel(dialog, labels.invite.phone), '12');
    await user.click(within(dialog).getByRole('button', { name: labels.invite.submit }));

    expect(
      await within(dialog).findByText('Le numéro de téléphone n’est pas valide.'),
    ).toBeInTheDocument();
  });

  it('409 « cga_manager_exists » : message dans la modale', async () => {
    const { user, dialog } = await openInvitation();

    server.failNext('POST', apiUrl(`/network/organizations/${demoIds.bouake}/manager`), {
      status: 409,
      data: { message: 'Ce CGA a déjà un gérant, invité ou actif.', code: 'cga_manager_exists' },
    });
    await user.type(fieldByLabel(dialog, labels.invite.firstName), 'Awa');
    await user.type(fieldByLabel(dialog, labels.invite.lastName), 'Koné');
    await user.type(fieldByLabel(dialog, labels.invite.phone), '0700000030');
    await user.click(within(dialog).getByRole('button', { name: labels.invite.submit }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Ce CGA a déjà un gérant, invité ou actif.',
    );
    await waitFor(() => {
      expect(within(dialog).getByRole('button', { name: labels.invite.submit })).toBeEnabled();
    });
  });
});
