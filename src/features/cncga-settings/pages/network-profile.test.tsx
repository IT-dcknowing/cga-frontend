import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { cncgaSettingsRoutes } from '@/features/cncga-settings/lib/routes';
import { fr } from '@/lib/i18n/fr';
import { demoIds, installApiServer } from '@/test/api-server';
import { renderApp } from '@/test/render-app';

/*
 * Onglet « Identité du CNCGA » de `/cncga/parametres`, étape 6.9 (06-IMPLEMENTATION-PLAN, PRD F-DOC-01,
 * décision 0008) : fiche du CNCGA, émetteur des reçus et factures de cotisation, sans agrément ni
 * expert-comptable ; signature de la Présidente et cachet déposés. Backend simulé (`api-cga.ts`).
 */
const labels = fr.cgaSettings.centre;
const PAGE = `${cncgaSettingsRoutes.root}?onglet=identite`;

let server: ReturnType<typeof installApiServer>;

afterEach(() => {
  server.restore();
});

async function open(phone = '0700000001', membership = demoIds.president) {
  server = installApiServer();
  server.signIn(phone, membership);

  const session = await httpAuthApi.currentSession();
  const user = userEvent.setup({ delay: null });
  const view = renderApp({ api: httpAuthApi, session, entry: PAGE });

  return { user, ...view };
}

function png(name: string): File {
  return new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' });
}

describe('/cncga/parametres · Identité du CNCGA (6.9)', { timeout: 20_000 }, () => {
  it('fiche sans agrément ni expert-comptable ; enregistrement, puis signature et cachet : fiche complète', async () => {
    const { user } = await open();

    expect(
      await screen.findByRole('tab', { name: fr.cncgaSettings.tabs.identite }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(
      await screen.findByText(
        labels.incomplete(
          `${labels.images.networkKinds.signature}, ${labels.fields.stamp_file_id}`,
        ),
      ),
    ).toBeVisible();
    expect(screen.queryByText(labels.fields.agreement_number)).toBeNull();
    expect(screen.queryByText(labels.fields.expert_name)).toBeNull();

    await user.click(screen.getByRole('button', { name: fr.organization.edit }));
    expect(screen.queryByLabelText(labels.fields.agreement_number)).toBeNull();
    expect(screen.queryByLabelText(labels.fields.expert_name)).toBeNull();
    await user.click(screen.getByRole('button', { name: labels.save }));

    expect(await screen.findByText(labels.saved)).toBeVisible();
    const put = server.requests.find(
      (request) => request.method === 'PUT' && request.url.endsWith('/network/profile'),
    );

    expect(put?.body).not.toHaveProperty('agreement_number');
    expect(put?.body).not.toHaveProperty('expert_name');
    expect(put?.body).toMatchObject({
      numbering_abbreviation: 'CNCGA',
      signatory_title: 'La Présidente',
    });

    await user.upload(
      screen.getByLabelText(labels.images.choose(labels.images.networkKinds.signature)),
      png('signature.png'),
    );
    expect(
      await screen.findByText(labels.images.uploaded(labels.images.networkKinds.signature)),
    ).toBeVisible();
    await user.upload(
      screen.getByLabelText(labels.images.choose(labels.images.kinds.stamp)),
      png('cachet.png'),
    );

    await waitFor(() => {
      expect(screen.getByText(/Fiche complète depuis le/)).toBeVisible();
    });
  });

  it('le gestionnaire du réseau la modifie ; le membre du bureau n’y a pas accès', async () => {
    const manager = await open('0700000003', demoIds.multiCncga);

    expect(await screen.findByRole('button', { name: fr.organization.edit })).toBeVisible();
    manager.unmount();
    server.restore();

    await open('0700000013', demoIds.board);

    expect(await screen.findByText(fr.errorScreens.forbiddenTitle)).toBeVisible();
    expect(screen.queryByRole('tab', { name: fr.cncgaSettings.tabs.identite })).toBeNull();
  });
});
