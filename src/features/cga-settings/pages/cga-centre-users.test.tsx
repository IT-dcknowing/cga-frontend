import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { cgaSettingsRoutes } from '@/features/cga-settings/lib/routes';
import { memberRoutes } from '@/features/members/lib/member';
import { fr } from '@/lib/i18n/fr';
import { createCgaBackend, demoProfile } from '@/test/api-cga';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import { fieldByLabel } from '@/test/fields';
import { renderApp } from '@/test/render-app';

/*
 * `/cga/parametres`, étape 1.6 (06-IMPLEMENTATION-PLAN, 03-APPFLOW §4.2 et §4.3) : onglet « Centre »
 * (fiche complète, logo, signature, cachet, RG-ORG-04, 05), onglet « Utilisateurs » (inviter, profils,
 * désactiver, réactiver, renvoyer l'invitation) et bandeaux de l'espace CGA (suspendu, fiche
 * incomplète, agrément en cours). Vrai client `http`, backend simulé (`api-cga.ts`).
 */
const centre = fr.cgaSettings.centre;
const users = fr.cgaSettings.users;
const banners = fr.cgaSettings.banners;
const field = centre.fields;

let server: ReturnType<typeof installApiServer>;
let cga: ReturnType<typeof createCgaBackend>;

afterEach(() => {
  server.restore();
});

const accesses = {
  gerant: ['0700000002', demoIds.manager],
  expert: ['0700000003', demoIds.multiDck],
  comptable: ['0700000004', demoIds.accountant],
} as const;

async function open(entry: string, who: keyof typeof accesses = 'gerant', profile = demoProfile()) {
  cga = createCgaBackend(profile);
  server = installApiServer({ cga });

  const [phone, membershipId] = accesses[who];

  server.signIn(phone, membershipId);

  const session = await httpAuthApi.currentSession();
  const user = userEvent.setup({ delay: null });
  const view = renderApp({ api: httpAuthApi, session, entry });

  return { user, ...view };
}

const CENTRE = `${cgaSettingsRoutes.root}?onglet=centre`;
const USERS = `${cgaSettingsRoutes.root}?onglet=utilisateurs`;

function valueOf(label: string): string | null {
  const term = screen.getAllByRole('term').find((item) => item.textContent === label);

  return term?.nextElementSibling?.textContent ?? null;
}

function writes(suffix: string) {
  return server.requests.filter(
    (request) => request.method !== 'GET' && new URL(request.url).pathname.endsWith(suffix),
  );
}

function bodyOf(suffix: string): Record<string, unknown> {
  const body = writes(suffix).at(-1)?.body;

  return body instanceof FormData
    ? Object.fromEntries(body.entries())
    : (body as Record<string, unknown>);
}

const JOURNEY = { timeout: 15_000 };

describe('/cga/parametres · Centre (F-ORG-03, RG-ORG-04, 05)', JOURNEY, () => {
  it('F-ORG-03 · fiche en lecture : registre, rattachement, abréviation, images ; fiche complète', async () => {
    await open(CENTRE);

    expect(await screen.findByText(centre.complete('05/01/2026'))).toBeVisible();
    expect(valueOf(field.name)).toBe('DC-KNOWING CGA');
    expect(valueOf(field.regional_directorate_id)).toBe('DR Abidjan (démonstration)');
    expect(valueOf(field.tax_office_id)).toBe('CDI Plateau (démonstration)');
    expect(valueOf(field.numbering_abbreviation)).toBe('DCK');
    expect(screen.getByRole('img', { name: centre.images.alt('Logo') })).toHaveAttribute(
      'src',
      'https://files.test/logo.png',
    );
    // Fiche complète : aucun bandeau de la coque.
    expect(screen.queryByText(banners.incomplete)).toBeNull();
  });

  it('« Modifier » : CDI de la DR choisie, ville et téléphone exigés, abréviation verrouillée, puis enregistrement', async () => {
    const { user } = await open(CENTRE);

    await user.click(await screen.findByRole('button', { name: fr.organization.edit }));

    const form = screen.getByRole('button', { name: centre.save }).closest('form') as HTMLElement;
    const directorate = fieldByLabel(form, field.regional_directorate_id);
    const office = fieldByLabel(form, field.tax_office_id);

    expect(fieldByLabel(form, field.numbering_abbreviation)).toBeDisabled();
    expect(within(form).getByText(centre.abbreviationLocked)).toBeVisible();
    await waitFor(() => {
      expect(within(office).getAllByRole('option')).toHaveLength(2);
    });

    // Autre DR : le CDI est vidé, seuls ceux de cette DR sont proposés.
    await user.selectOptions(directorate, '01dr0000000000000000000002');
    expect(office).toHaveValue('');
    expect(
      within(office).getByRole('option', { name: 'CDI Bouaké (démonstration)' }),
    ).toBeVisible();
    expect(
      within(office).queryByRole('option', { name: 'CDI Plateau (démonstration)' }),
    ).toBeNull();
    await user.selectOptions(office, '01cdi000000000000000000002');

    await user.clear(fieldByLabel(form, field.city));
    await user.clear(fieldByLabel(form, field.share_capital));
    await user.type(fieldByLabel(form, field.share_capital), '5 millions');
    await user.click(within(form).getByRole('button', { name: centre.save }));
    expect(await within(form).findByText(fr.members.create.errors.required)).toBeVisible();
    expect(within(form).getByText(centre.integer)).toBeVisible();
    expect(writes('/cga/profile')).toHaveLength(0);

    await user.type(fieldByLabel(form, field.city), 'Bouaké');
    await user.clear(fieldByLabel(form, field.share_capital));
    await user.type(fieldByLabel(form, field.share_capital), '10000000');
    await user.type(fieldByLabel(form, field.said), 'SAID Bouaké');
    await user.click(within(form).getByRole('button', { name: centre.save }));

    expect(await screen.findByText(centre.saved)).toBeInTheDocument();
    expect(bodyOf('/cga/profile')).toMatchObject({
      city: 'Bouaké',
      share_capital: 10000000,
      regional_directorate_id: '01dr0000000000000000000002',
      tax_office_id: '01cdi000000000000000000002',
      said: 'SAID Bouaké',
      phone_2: null,
    });
    expect(await screen.findByText('CDI Bouaké (démonstration)')).toBeVisible();
    expect(valueOf(field.city)).toBe('Bouaké');
  });

  it('RG-ORG-05 · abréviation libre : format contrôlé avant l’envoi ; refus du serveur (422) sous le champ', async () => {
    const { user } = await open(
      CENTRE,
      'gerant',
      demoProfile({ abbreviation_locked: false, numbering_abbreviation: null }),
    );

    await user.click(await screen.findByRole('button', { name: fr.organization.edit }));

    const form = screen.getByRole('button', { name: centre.save }).closest('form') as HTMLElement;
    const abbreviation = fieldByLabel(form, field.numbering_abbreviation);

    expect(abbreviation).toBeEnabled();
    await user.type(abbreviation, 'dck1');
    await user.click(within(form).getByRole('button', { name: centre.save }));
    expect(await within(form).findByText(centre.abbreviation)).toBeVisible();

    await user.clear(abbreviation);
    await user.type(abbreviation, 'DCK');
    server.failNext('PUT', apiUrl('/cga/profile'), {
      status: 422,
      data: {
        message: 'Invalide.',
        errors: { numbering_abbreviation: ['Cette abréviation est déjà prise dans le réseau.'] },
      },
    });
    await user.click(within(form).getByRole('button', { name: centre.save }));
    expect(
      await within(form).findByText('Cette abréviation est déjà prise dans le réseau.'),
    ).toBeVisible();

    await user.click(within(form).getByRole('button', { name: fr.common.cancel }));
    expect(screen.queryByRole('button', { name: centre.save })).toBeNull();
  });

  it('RG-ORG-04 · fiche incomplète : liste des manques, bandeau de la coque, puis le logo téléversé', async () => {
    const { user } = await open(
      CENTRE,
      'gerant',
      demoProfile({
        images: { logo: null, signature: null, stamp: null },
        email: null,
        missing_fields: ['email', 'logo_file_id', 'signature_file_id', 'stamp_file_id'],
        profile_completed_at: null,
      }),
    );

    expect(
      await screen.findByText(centre.incomplete('E-mail, Logo, Signature du gérant, Cachet')),
    ).toBeVisible();
    expect(screen.getByText(banners.incomplete)).toBeVisible();
    expect(screen.getByRole('link', { name: banners.complete })).toHaveAttribute(
      'href',
      `${cgaSettingsRoutes.root}?onglet=centre`,
    );
    expect(screen.getAllByText(centre.images.missing)).toHaveLength(3);

    // Image refusée par le serveur (contenu vérifié côté serveur) : message sous le champ.
    server.failNext('POST', apiUrl('/cga/profile/images/logo'), {
      status: 422,
      data: {
        message: 'Invalide.',
        errors: { image: ['L’image doit être au format PNG ou JPEG.'] },
      },
    });
    await user.upload(
      fieldByLabel(document.body, centre.images.choose('Logo')),
      new File(['GIF89a'], 'logo.png', { type: 'image/png' }),
    );
    expect(await screen.findByText('L’image doit être au format PNG ou JPEG.')).toBeVisible();

    await user.upload(
      fieldByLabel(document.body, centre.images.choose('Logo')),
      new File(['PNG'], 'logo.png', { type: 'image/png' }),
    );
    expect(await screen.findByText(centre.images.uploaded('Logo'))).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: centre.images.alt('Logo') })).toHaveAttribute(
      'src',
      'https://files.test/logo-logo.png.png',
    );
    expect(screen.getAllByText(centre.images.missing)).toHaveLength(2);
  });

  it('l’expert-comptable consulte la fiche sans la modifier ; panne : bandeau et « Réessayer »', async () => {
    const view = await open(CENTRE, 'expert');

    expect(await screen.findByText(centre.readOnly)).toBeVisible();
    expect(screen.queryByRole('button', { name: fr.organization.edit })).toBeNull();
    expect(screen.queryByLabelText(centre.images.choose('Logo'))).toBeNull();
    expect(screen.queryByRole('tab', { name: fr.cgaSettings.tabs.utilisateurs })).toBeNull();
    view.unmount();
    server.restore();

    cga = createCgaBackend();
    server = installApiServer({ cga });
    server.signIn('0700000002', demoIds.manager);
    // La fiche n'est pas relue d'office (`retry: false`) : une panne suffit.
    server.failNext('GET', apiUrl('/cga/profile'), { status: 500, data: { message: 'Erreur.' } });
    const session = await httpAuthApi.currentSession();
    const user = userEvent.setup({ delay: null });

    renderApp({ api: httpAuthApi, session, entry: CENTRE });
    expect(await screen.findByText(centre.loadError, {}, { timeout: 4000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.common.retry }));
    expect(await screen.findByText(centre.complete('05/01/2026'))).toBeVisible();
  });
});

describe('Espace CGA · bandeaux du centre (03-APPFLOW §4.2)', JOURNEY, () => {
  it('RG-ORG-08 · centre suspendu et RG-ORG-03 · agrément en cours : bandeaux, inscription désactivée', async () => {
    await open(
      memberRoutes.list,
      'gerant',
      demoProfile({ status: 'suspended', agreement_status: 'pending' }),
    );

    expect(await screen.findByText(banners.suspended)).toBeVisible();
    expect(screen.getByText(banners.agreementPending)).toBeVisible();
    expect(screen.getByRole('button', { name: fr.members.list.create })).toBeDisabled();
    expect(screen.queryByRole('link', { name: fr.members.list.create })).toBeNull();
  });

  it('sans le droit de voir la fiche (comptable) : aucun bandeau, aucune lecture refusée affichée', async () => {
    await open(memberRoutes.list, 'comptable', demoProfile({ status: 'suspended' }));

    expect(await screen.findByRole('heading', { level: 1 })).toBeVisible();
    expect(screen.queryByText(banners.suspended)).toBeNull();
    expect(
      server.requests.some((request) => new URL(request.url).pathname.endsWith('/cga/profile')),
    ).toBe(false);
  });
});

describe('/cga/parametres · Utilisateurs (F-ORG-09, 10)', JOURNEY, () => {
  it('liste : profils, accès, dernière connexion ; recherche et filtre par accès', async () => {
    const { user } = await open(USERS);

    const rows = within(await screen.findByRole('list', { name: users.caption }));

    expect(rows.getByText('Adjoua Comptable')).toBeVisible();
    expect(rows.getByText('Comptable')).toBeVisible();
    expect(rows.getByText(fr.status.access.disabled)).toBeVisible();
    expect(rows.getByText(fr.status.access.invited)).toBeVisible();
    expect(rows.getByText(`${users.columns.lastLogin} : ${users.never}`)).toBeVisible();

    await user.type(screen.getByLabelText(users.search), 'adjoua');
    await waitFor(() => {
      expect(
        within(screen.getByRole('list', { name: users.caption })).getAllByRole('listitem'),
      ).toHaveLength(1);
    });

    await user.clear(screen.getByLabelText(users.search));
    await user.selectOptions(screen.getByLabelText(users.status), 'invited');
    await waitFor(() => {
      const items = within(screen.getByRole('list', { name: users.caption })).getAllByRole(
        'listitem',
      );

      expect(items).toHaveLength(1);
      expect(items[0]).toHaveTextContent('Fatou Invitée');
    });

    await user.selectOptions(screen.getByLabelText(users.status), 'disabled');
    await user.type(screen.getByLabelText(users.search), 'personne');
    expect(await screen.findByText(users.empty)).toBeVisible();
  });

  it('« Inviter » : champs et profil exigés, e-mail exigé pour un envoi par e-mail, 422 sous le champ, puis l’invité', async () => {
    const { user } = await open(USERS);

    await screen.findByRole('list', { name: users.caption });
    await user.click(screen.getByRole('button', { name: users.invite }));

    const dialog = screen.getByRole('dialog', { name: users.inviteDialog.title });
    const text = users.inviteDialog;

    await user.selectOptions(fieldByLabel(dialog, text.channel), 'email');
    await user.click(within(dialog).getByRole('button', { name: text.submit }));
    expect(await within(dialog).findAllByText(fr.members.create.errors.required)).toHaveLength(4);
    expect(within(dialog).getByText(text.rolesRequired)).toBeVisible();
    expect(writes('/cga/users')).toHaveLength(0);

    await user.selectOptions(fieldByLabel(dialog, text.channel), 'sms');
    await user.type(fieldByLabel(dialog, text.firstName), 'Awa');
    await user.type(fieldByLabel(dialog, text.lastName), 'Fiscaliste');
    await user.type(fieldByLabel(dialog, text.phone), '+2250700000004');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Fiscaliste' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'Juriste' }));
    await user.click(within(dialog).getByRole('button', { name: text.submit }));
    expect(
      await within(dialog).findByText('Ce téléphone est déjà utilisé par un agent.'),
    ).toBeVisible();

    await user.clear(fieldByLabel(dialog, text.phone));
    await user.type(fieldByLabel(dialog, text.phone), '+2250700000020');
    await user.click(within(dialog).getByRole('button', { name: text.submit }));

    expect(await screen.findByText(text.done)).toBeInTheDocument();
    expect(bodyOf('/cga/users')).toEqual({
      first_name: 'Awa',
      last_name: 'Fiscaliste',
      phone: '+2250700000020',
      email: null,
      channel: 'sms',
      roles: ['cga_tax_advisor', 'cga_legal'],
    });
    expect(
      await within(screen.getByRole('list', { name: users.caption })).findByText('Awa Fiscaliste'),
    ).toBeVisible();
  });

  it('« Modifier les profils » : au moins un profil, puis la liste à jour', async () => {
    const { user } = await open(USERS);

    await screen.findByRole('list', { name: users.caption });
    await user.click(screen.getByRole('button', { name: users.rowActions('Adjoua Comptable') }));
    await user.click(screen.getByRole('menuitem', { name: users.editRoles }));

    const dialog = screen.getByRole('dialog', { name: users.rolesDialog.title });
    const accountant = within(dialog).getByRole('checkbox', { name: 'Comptable' });

    expect(accountant).toBeChecked();
    await user.click(accountant);
    await user.click(within(dialog).getByRole('button', { name: users.rolesDialog.submit }));
    expect(await within(dialog).findByText(users.inviteDialog.rolesRequired)).toBeVisible();
    expect(writes('/roles')).toHaveLength(0);

    await user.click(within(dialog).getByRole('checkbox', { name: 'Expert-comptable' }));
    await user.click(within(dialog).getByRole('button', { name: users.rolesDialog.submit }));

    expect(await screen.findByText(users.rolesDialog.done)).toBeInTheDocument();
    expect(bodyOf('/roles')).toEqual({ roles: ['cga_accountant_expert'] });
    expect(
      await within(screen.getByRole('list', { name: users.caption })).findByText(
        'Expert-comptable',
      ),
    ).toBeVisible();
  });

  it('désactiver (confirmation), réactiver, renvoyer l’invitation ; le gérant n’a pas d’action sur lui-même', async () => {
    const { user } = await open(USERS);

    await screen.findByRole('list', { name: users.caption });
    expect(screen.queryByRole('button', { name: users.rowActions('Koffi Gérant') })).toBeNull();

    await user.click(screen.getByRole('button', { name: users.rowActions('Adjoua Comptable') }));
    await user.click(screen.getByRole('menuitem', { name: users.disable }));

    const dialog = screen.getByRole('dialog', { name: users.disableDialog.title });

    expect(within(dialog).getByText(users.disableDialog.effects[0])).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: users.disableDialog.submit }));
    expect(
      await screen.findByText(users.disableDialog.done('Adjoua Comptable')),
    ).toBeInTheDocument();
    expect(writes('/disable')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: users.rowActions('Kouassi Désactivé') }));
    await user.click(screen.getByRole('menuitem', { name: users.enable }));
    expect(await screen.findByText(users.enabled('Kouassi Désactivé'))).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: users.rowActions('Fatou Invitée') }));
    await user.click(screen.getByRole('menuitem', { name: users.resend }));
    expect(await screen.findByText(users.resent)).toBeInTheDocument();
    expect(writes('/invitation')).toHaveLength(1);
  });

  it('refus du serveur : 409 en toast pour une action, dans la modale pour une désactivation ; panne de la liste', async () => {
    const { user } = await open(USERS);

    await screen.findByRole('list', { name: users.caption });
    server.failNext('POST', apiUrl('/cga/users/01usr00000000000000kouassi/enable'), {
      status: 409,
      data: { message: 'Accès déjà actif.', code: 'agent_active', details: {} },
    });
    await user.click(screen.getByRole('button', { name: users.rowActions('Kouassi Désactivé') }));
    await user.click(screen.getByRole('menuitem', { name: users.enable }));
    expect(await screen.findByText('Accès déjà actif.')).toBeInTheDocument();

    server.failNext('POST', apiUrl('/cga/users/01usr000000000000000adjoua/disable'), {
      status: 409,
      data: { message: 'Dernier gérant.', code: 'last_head', details: {} },
    });
    await user.click(screen.getByRole('button', { name: users.rowActions('Adjoua Comptable') }));
    await user.click(screen.getByRole('menuitem', { name: users.disable }));

    const dialog = screen.getByRole('dialog', { name: users.disableDialog.title });

    await user.click(within(dialog).getByRole('button', { name: users.disableDialog.submit }));
    expect(await within(dialog).findByText('Dernier gérant.')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: fr.common.cancel }));

    server.failNext('PUT', apiUrl('/cga/users/01usr000000000000000adjoua/roles'), {
      status: 409,
      data: { message: 'Profil verrouillé.', code: 'role_locked', details: {} },
    });
    await user.click(screen.getByRole('button', { name: users.rowActions('Adjoua Comptable') }));
    await user.click(screen.getByRole('menuitem', { name: users.editRoles }));

    const roles = screen.getByRole('dialog', { name: users.rolesDialog.title });

    await user.click(within(roles).getByRole('button', { name: users.rolesDialog.submit }));
    expect(await within(roles).findByText('Profil verrouillé.')).toBeVisible();
    await user.click(within(roles).getByRole('button', { name: fr.common.cancel }));

    for (let attempt = 0; attempt < 2; attempt++) {
      server.failNext('GET', apiUrl('/cga/users'), { status: 500, data: { message: 'Erreur.' } });
    }
    await user.selectOptions(screen.getByLabelText(users.status), 'active');
    expect(await screen.findByText(users.loadError, {}, { timeout: 4000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.common.retry }));
    expect(await screen.findByRole('list', { name: users.caption })).toBeVisible();
  });
});
