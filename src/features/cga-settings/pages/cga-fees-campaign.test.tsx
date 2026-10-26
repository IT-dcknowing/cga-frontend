import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { cgaSettingsRoutes } from '@/features/cga-settings/lib/routes';
import { formatAmount } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';
import { createCgaBackend } from '@/test/api-cga';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import { fieldByLabel } from '@/test/fields';
import { renderApp } from '@/test/render-app';

/*
 * `/cga/parametres`, étape 3.9 (06-IMPLEMENTATION-PLAN, 03-APPFLOW §4.3) : onglets « Barème »
 * (F-PAY-01 : droit d'adhésion, honoraires RME et TEE, périodicité) et « Campagne d'attestations »
 * (RG-DOC-06, 07 : éligibles, déjà émises, bloquées exclues, lancement en file). « Règles » attend
 * l'API des paramètres. Vrai client `http`, backend simulé (`api-cga.ts`).
 */
const fees = fr.cgaSettings.fees;
const campaign = fr.cgaSettings.campaign;

let server: ReturnType<typeof installApiServer>;
let cga: ReturnType<typeof createCgaBackend>;

afterEach(() => {
  server.restore();
});

const accesses = {
  gerant: ['0700000002', demoIds.manager],
  expert: ['0700000003', demoIds.multiDck],
} as const;

async function open(tab: string, who: keyof typeof accesses = 'gerant', eligible = 12) {
  cga = createCgaBackend(undefined, { eligible });
  server = installApiServer({ cga });

  const [phone, membershipId] = accesses[who];

  server.signIn(phone, membershipId);

  const session = await httpAuthApi.currentSession();
  const user = userEvent.setup({ delay: null });
  const view = renderApp({
    api: httpAuthApi,
    session,
    entry: `${cgaSettingsRoutes.root}?onglet=${tab}`,
  });

  return { user, ...view };
}

/** Texte tel que Testing Library le compare : espaces insécables des montants ramenés à un espace. */
function spaced(text: string): string {
  return text.replace(/\s+/g, ' ');
}

function valueOf(label: string): string | null {
  const term = screen.getAllByRole('term').find((item) => item.textContent === label);

  return term?.nextElementSibling?.textContent ?? null;
}

function writes(suffix: string) {
  return server.requests.filter(
    (request) => request.method !== 'GET' && new URL(request.url).pathname.endsWith(suffix),
  );
}

const JOURNEY = { timeout: 15_000 };

describe('/cga/parametres · Barème (3.9, F-PAY-01)', JOURNEY, () => {
  it('F-PAY-01 · barème en lecture : droit d’adhésion, honoraires par régime avec périodicité et date', async () => {
    await open('bareme');

    expect(await screen.findByText(fees.intro)).toBeVisible();
    expect(spaced(valueOf(fees.entryFee) ?? '')).toBe(
      spaced(`${formatAmount(25000)}${fees.since('01/01/2026')}`),
    );
    expect(spaced(valueOf(fees.regime('RME')) ?? '')).toBe(
      spaced(`${formatAmount(20000)} · Mensuelle${fees.since('01/01/2026')}`),
    );
    expect(spaced(valueOf(fees.regime('TEE')) ?? '')).toBe(
      spaced(`${formatAmount(15000)} · Trimestrielle${fees.since('01/01/2026')}`),
    );
  });

  it('« Modifier » : montants entiers exigés, refus du serveur (422) sous le champ, puis le barème enregistré', async () => {
    const { user } = await open('bareme');

    await user.click(await screen.findByRole('button', { name: fr.organization.edit }));

    const form = screen.getByRole('button', { name: fees.save }).closest('form') as HTMLElement;

    await user.clear(fieldByLabel(form, fees.entryFee));
    await user.type(fieldByLabel(form, fees.entryFee), '30 000 F');
    await user.click(within(form).getByRole('button', { name: fees.save }));
    expect(await within(form).findByText(fr.cgaSettings.centre.integer)).toBeVisible();
    expect(writes('/cga/fee-schedule')).toHaveLength(0);

    await user.clear(fieldByLabel(form, fees.entryFee));
    await user.type(fieldByLabel(form, fees.entryFee), '30000');

    const rme = within(screen.getByRole('group', { name: fees.regime('RME') }));

    await user.clear(rme.getByLabelText(new RegExp(fees.amount.replace(/[()]/g, '.'))));
    await user.type(rme.getByLabelText(new RegExp(fees.amount.replace(/[()]/g, '.'))), '22000');
    await user.selectOptions(rme.getByLabelText(new RegExp(fees.periodicity)), 'quarterly');

    server.failNext('PUT', apiUrl('/cga/fee-schedule'), {
      status: 422,
      data: {
        message: 'Invalide.',
        errors: { 'fees.RME.amount': ['Le montant dépasse le plafond.'] },
      },
    });
    await user.click(within(form).getByRole('button', { name: fees.save }));
    expect(await within(form).findByText('Le montant dépasse le plafond.')).toBeVisible();

    await user.click(within(form).getByRole('button', { name: fees.save }));
    expect(await screen.findByText(fees.saved)).toBeInTheDocument();
    expect(writes('/cga/fee-schedule').at(-1)?.body).toEqual({
      entry_fee: 30000,
      fees: {
        RME: { amount: 22000, periodicity: 'quarterly' },
        TEE: { amount: 15000, periodicity: 'quarterly' },
      },
    });
    expect(spaced(valueOf(fees.regime('RME')) ?? '')).toContain(
      spaced(`${formatAmount(22000)} · Trimestrielle`),
    );
  });

  it('l’expert-comptable consulte le barème sans le modifier ; panne : bandeau et « Réessayer »', async () => {
    const view = await open('bareme', 'expert');

    expect(await screen.findByText(fees.intro)).toBeVisible();
    expect(screen.queryByRole('button', { name: fr.organization.edit })).toBeNull();
    view.unmount();
    server.restore();

    cga = createCgaBackend();
    server = installApiServer({ cga });
    server.signIn('0700000002', demoIds.manager);
    for (let attempt = 0; attempt < 2; attempt++) {
      server.failNext('GET', apiUrl('/cga/fee-schedule'), {
        status: 500,
        data: { message: 'Erreur.' },
      });
    }

    const session = await httpAuthApi.currentSession();
    const user = userEvent.setup({ delay: null });

    renderApp({ api: httpAuthApi, session, entry: `${cgaSettingsRoutes.root}?onglet=bareme` });
    expect(await screen.findByText(fees.loadError, {}, { timeout: 4000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.common.retry }));
    expect(await screen.findByText(fees.intro)).toBeVisible();
  });
});

describe('/cga/parametres · Campagne d’attestations (3.9, RG-DOC-06, 07, 10)', JOURNEY, () => {
  it('RG-DOC-07 · éligibles, déjà émises, bloquées avec motif ; lancement confirmé, production en file', async () => {
    const { user } = await open('campagne');

    expect(await screen.findByRole('heading', { name: campaign.title('2026') })).toBeVisible();
    expect(valueOf(campaign.eligible)).toBe('12');
    expect(valueOf(campaign.issued)).toBe('3');
    expect(valueOf(campaign.blocked)).toBe('1');

    const blocked = within(screen.getByRole('list', { name: campaign.blockedTitle }));

    expect(blocked.getByText('IMPRIMERIE KONÉ · 2026-DCK-0012')).toBeVisible();
    expect(
      blocked.getByText(
        campaign.blockedLine('20/10/2026', 'Honoraires impayés', 'Relances sans réponse'),
      ),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: campaign.launch('2026') }));

    const dialog = screen.getByRole('dialog', { name: campaign.launch('2026') });

    expect(within(dialog).getByText(campaign.summary('12', '1'))).toBeVisible();
    expect(
      within(dialog).getByText(campaign.blockedEffect('IMPRIMERIE KONÉ', 'Honoraires impayés')),
    ).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: campaign.submit }));

    expect(await screen.findByText(campaign.launched('12'))).toBeInTheDocument();
    expect(writes('/cga/certificate-campaign')).toHaveLength(1);
    expect(await screen.findByText(campaign.none)).toBeVisible();
    expect(screen.getByRole('button', { name: campaign.launch('2026') })).toBeDisabled();
  });

  it('refus du lancement (409) dans la modale ; panne : bandeau et « Réessayer »', async () => {
    const { user, unmount } = await open('campagne');

    await user.click(await screen.findByRole('button', { name: campaign.launch('2026') }));
    server.failNext('POST', apiUrl('/cga/certificate-campaign'), {
      status: 409,
      data: {
        message: 'Fiche du centre incomplète.',
        code: 'organization_profile_incomplete',
        details: {},
      },
    });

    const dialog = screen.getByRole('dialog', { name: campaign.launch('2026') });

    await user.click(within(dialog).getByRole('button', { name: campaign.submit }));
    expect(await within(dialog).findByText('Fiche du centre incomplète.')).toBeVisible();
    unmount();
    server.restore();

    cga = createCgaBackend();
    server = installApiServer({ cga });
    server.signIn('0700000002', demoIds.manager);
    for (let attempt = 0; attempt < 2; attempt++) {
      server.failNext('GET', apiUrl('/cga/certificate-campaign'), {
        status: 500,
        data: { message: 'Erreur.' },
      });
    }

    const session = await httpAuthApi.currentSession();
    const retry = userEvent.setup({ delay: null });

    renderApp({ api: httpAuthApi, session, entry: `${cgaSettingsRoutes.root}?onglet=campagne` });
    expect(await screen.findByText(campaign.loadError, {}, { timeout: 4000 })).toBeVisible();
    await retry.click(screen.getByRole('button', { name: fr.common.retry }));
    expect(await screen.findByRole('heading', { name: campaign.title('2026') })).toBeVisible();
  });
});
