import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { cncgaSettingsRoutes } from '@/features/cncga-settings/lib/routes';
import { fr } from '@/lib/i18n/fr';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import { renderApp } from '@/test/render-app';

/*
 * `/cncga/parametres`, onglet « Catalogue des obligations » (06-IMPLEMENTATION-PLAN étape 4.9,
 * RG-DATA-01, RG-DATA-04) : versions, aperçu d'une nouvelle version (effets en nombres), application
 * après confirmation, validation d'une version provisoire. Vrai client `http`, backend simulé
 * (`api-catalog.ts`).
 */
const labels = fr.obligations.catalogVersions;

let server: ReturnType<typeof installApiServer>;

afterEach(() => {
  server.restore();
});

async function open(phone = '0700000001', membership: string = demoIds.president) {
  server = installApiServer();
  server.signIn(phone, membership);

  const session = await httpAuthApi.currentSession();
  const user = userEvent.setup({ delay: null });
  const view = renderApp({
    api: httpAuthApi,
    session,
    entry: `${cncgaSettingsRoutes.root}?onglet=catalogue`,
  });

  return { user, ...view };
}

function json(name: string): File {
  return new File(['{"version":"2026.2","types":[]}'], name, { type: 'application/json' });
}

describe(
  '/cncga/parametres · catalogue des obligations (4.9, RG-DATA-04)',
  { timeout: 20_000 },
  () => {
    it('versions : en vigueur, provisoire ou validée, dates', async () => {
      await open();

      const list = await screen.findByRole('list', { name: labels.title });
      const [current, previous] = within(list).getAllByRole('listitem');

      expect(
        within(current).getByText(`${labels.version('2026.1')} · ${labels.inForce}`),
      ).toBeVisible();
      expect(within(current).getByText(fr.status.dataStatus.provisional)).toBeVisible();
      expect(within(previous).getByText(fr.status.dataStatus.validated)).toBeVisible();
      expect(
        within(previous).getByText(
          [labels.count('6'), labels.loadedAt('01/07/2025'), labels.validatedAt('10/07/2025')].join(
            ' · ',
          ),
        ),
      ).toBeVisible();
      expect(
        within(previous).queryByRole('button', { name: labels.validate('2025.2') }),
      ).toBeNull();
    });

    it('RG-DATA-04 · aperçu des effets en nombres, puis application après confirmation', async () => {
      const { user } = await open();

      await screen.findByRole('list', { name: labels.title });
      await user.click(screen.getByRole('button', { name: labels.analyse }));
      expect(screen.getByText(labels.fileRequired)).toBeVisible();

      await user.upload(
        screen.getByLabelText(new RegExp(labels.file)),
        json('catalogue-invalide.json'),
      );
      await user.click(screen.getByRole('button', { name: labels.analyse }));
      expect(
        await screen.findByText('Le catalogue est illisible : la clé « version » manque.'),
      ).toBeVisible();

      await user.upload(
        screen.getByLabelText(new RegExp(labels.file)),
        json('catalogue-2026-2.json'),
      );
      await user.click(screen.getByRole('button', { name: labels.analyse }));
      const impact = await screen.findByRole('region', { name: labels.preview.title('2026.2') });

      expect(within(impact).getByText(labels.preview.added('1', 'PAT2'))).toBeVisible();
      expect(within(impact).getByText(labels.preview.changed('1', 'TEE (due_rule)'))).toBeVisible();
      expect(within(impact).getByText(labels.preview.members('55', '3'))).toBeVisible();
      expect(within(impact).getByText(labels.preview.rescheduled('40'))).toBeVisible();

      await user.click(screen.getByRole('button', { name: labels.apply('2026.2') }));
      const dialog = await screen.findByRole('dialog', { name: labels.confirm.title('2026.2') });

      expect(within(dialog).getByText(labels.confirm.body('55'))).toBeVisible();
      await user.click(within(dialog).getByRole('button', { name: labels.apply('2026.2') }));

      expect(await screen.findByText(labels.applied('2026.2', '7', '12'))).toBeVisible();
      await waitFor(() => {
        expect(screen.getByText(`${labels.version('2026.2')} · ${labels.inForce}`)).toBeVisible();
      });
      expect(screen.queryByRole('region', { name: labels.preview.title('2026.2') })).toBeNull();
      expect(server.catalog.versions().map((version) => version.in_force)).toEqual([
        true,
        false,
        false,
      ]);
    });

    it('fichier analysé introuvable à l’application : message ; fichier non JSON refusé', async () => {
      const { user } = await open();

      await screen.findByRole('list', { name: labels.title });
      await user.upload(
        screen.getByLabelText(new RegExp(labels.file)),
        json('catalogue-2026-2.json'),
      );
      await user.click(screen.getByRole('button', { name: labels.analyse }));
      await screen.findByRole('region', { name: labels.preview.title('2026.2') });

      server.failNext('POST', apiUrl('/network/obligation-catalog/apply'), {
        status: 409,
        data: { message: 'Ce fichier a déjà été appliqué.', code: 'catalog_already_applied' },
      });
      await user.click(screen.getByRole('button', { name: labels.apply('2026.2') }));
      await user.click(
        within(
          await screen.findByRole('dialog', { name: labels.confirm.title('2026.2') }),
        ).getByRole('button', { name: labels.apply('2026.2') }),
      );
      expect(await screen.findByText('Ce fichier a déjà été appliqué.')).toBeVisible();

      server.failNext('POST', apiUrl('/network/obligation-catalog/preview'), {
        status: 422,
        data: {
          message: 'Le fichier doit être un catalogue JSON.',
          errors: { file: ['Le fichier doit être un catalogue JSON.'] },
        },
      });
      await user.click(screen.getByRole('button', { name: labels.analyse }));
      expect(await screen.findByText('Le fichier doit être un catalogue JSON.')).toBeVisible();
    });

    it('RG-DATA-01 · valider une version provisoire', async () => {
      const { user } = await open();

      await screen.findByRole('list', { name: labels.title });
      await user.click(screen.getByRole('button', { name: labels.validate('2026.1') }));
      const dialog = await screen.findByRole('dialog', { name: labels.validate('2026.1') });

      expect(within(dialog).getByText(labels.validateBody('7'))).toBeVisible();
      await user.click(within(dialog).getByRole('button', { name: labels.validateShort }));

      expect(await screen.findByText(labels.validated('2026.1', '7'))).toBeVisible();
      expect(server.catalog.versions()[0].status).toBe('validated');
    });

    it('échec du chargement : message', async () => {
      server = installApiServer();
      server.signIn('0700000001', demoIds.president);
      server.failNext('GET', apiUrl('/network/obligation-catalog'), { status: 500 });
      server.failNext('GET', apiUrl('/network/obligation-catalog'), { status: 500 });
      const session = await httpAuthApi.currentSession();

      renderApp({
        api: httpAuthApi,
        session,
        entry: `${cncgaSettingsRoutes.root}?onglet=catalogue`,
      });

      expect(await screen.findByText(labels.loadError, {}, { timeout: 5_000 })).toBeVisible();
    });

    it('membre du bureau sans le droit des référentiels : pas d’onglet catalogue', async () => {
      await open('0700000013', demoIds.board);

      await screen.findByRole('heading', { level: 1 });
      expect(screen.queryByRole('tab', { name: fr.cncgaSettings.tabs.catalogue })).toBeNull();
    });
  },
);
