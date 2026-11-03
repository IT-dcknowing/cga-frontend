import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { fr } from '@/lib/i18n/fr';
import { demoCenterObligationIds } from '@/test/api-planning';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import { renderApp } from '@/test/render-app';

/*
 * `/cga/gestion-interne`, onglet « Obligations du centre » (06-IMPLEMENTATION-PLAN étape 4.7,
 * F-OBL-07) : liste, ajout, statut modifiable ; réservé au droit internal.manage. Vrai client
 * `http`, backend simulé (`api-planning.ts`).
 */
const labels = fr.obligations.center;
const form = labels.form;

let server: ReturnType<typeof installApiServer>;

afterEach(() => {
  server.restore();
});

async function open(phone = '0700000002', membership: string = demoIds.manager) {
  server = installApiServer();
  server.signIn(phone, membership);

  const session = await httpAuthApi.currentSession();
  const user = userEvent.setup({ delay: null });
  const view = renderApp({ api: httpAuthApi, session, entry: '/cga/gestion-interne' });

  return { user, ...view };
}

describe(
  '/cga/gestion-interne · obligations du centre (4.7, F-OBL-07)',
  { timeout: 20_000 },
  () => {
    it('liste par échéance : type, montant, retard, rappel, notes, statut', async () => {
      await open();

      const list = await screen.findByRole('list', { name: labels.caption });
      const items = within(list).getAllByRole('listitem');

      expect(items.map((item) => item.querySelector('.font-semibold')?.textContent)).toEqual([
        'Renouvellement de l’agrément',
        'CNPS du centre — octobre 2026',
      ]);
      expect(within(items[0]).getByText(labels.overdue, { exact: false })).toBeVisible();
      expect(within(items[0]).getByText(labels.reminder('17/10/2026'))).toBeVisible();
      expect(within(items[0]).getByText('Dossier à déposer à la DGI.')).toBeVisible();
      expect(within(items[1]).getByText(fr.status.obligation.to_pay)).toBeVisible();
    });

    it('ajoute une obligation : champs obligatoires, puis enregistrée', async () => {
      const { user } = await open();

      await screen.findByRole('list', { name: labels.caption });
      await user.click(screen.getByRole('button', { name: labels.add }));
      const dialog = await screen.findByRole('dialog', { name: form.createTitle });

      await user.click(within(dialog).getByRole('button', { name: form.submit }));
      expect(within(dialog).getAllByText(fr.obligations.dialogs.required)).toHaveLength(2);

      await user.type(within(dialog).getByLabelText(new RegExp(form.label)), 'SMT du centre 2025');
      await user.selectOptions(within(dialog).getByLabelText(new RegExp(form.kind)), 'smt');
      await user.type(within(dialog).getByLabelText(new RegExp(form.dueDate)), '2027-05-30');
      await user.type(
        within(dialog).getByLabelText(new RegExp(form.amount.replace(/[()]/g, '.'))),
        '25000',
      );
      await user.type(
        within(dialog).getByLabelText(new RegExp(form.notes)),
        'À déposer avec le bilan.',
      );
      await user.click(within(dialog).getByRole('button', { name: form.submit }));

      expect(await screen.findByText(form.created)).toBeVisible();
      expect(await screen.findByText('SMT du centre 2025')).toBeVisible();
      expect(
        server.planning.center().find((item) => item.label === 'SMT du centre 2025'),
      ).toMatchObject({
        kind: 'smt',
        amount: 25_000,
        status: 'todo',
        notes: 'À déposer avec le bilan.',
      });
    });

    it('modifie le statut ; refus du serveur sous le champ', async () => {
      const { user } = await open();

      await screen.findByRole('list', { name: labels.caption });
      await user.click(
        screen.getByRole('button', { name: labels.edit('CNPS du centre — octobre 2026') }),
      );
      const dialog = await screen.findByRole('dialog', {
        name: form.editTitle('CNPS du centre — octobre 2026'),
      });

      expect(
        within(dialog).getByLabelText(new RegExp(form.amount.replace(/[()]/g, '.'))),
      ).toHaveValue('180000');
      await user.clear(
        within(dialog).getByLabelText(new RegExp(form.amount.replace(/[()]/g, '.'))),
      );
      server.failNext('PUT', apiUrl(`/cga/center-obligations/${demoCenterObligationIds.cnps}`), {
        status: 422,
        data: {
          message: 'Le statut est invalide.',
          errors: { status: ['Le statut est invalide.'] },
        },
      });
      await user.click(within(dialog).getByRole('button', { name: form.submit }));
      expect(await within(dialog).findByText('Le statut est invalide.')).toBeVisible();

      await user.selectOptions(within(dialog).getByLabelText(new RegExp(form.status)), 'paid');
      await user.click(within(dialog).getByRole('button', { name: form.submit }));
      expect(await screen.findByText(form.updated)).toBeVisible();
      expect(
        server.planning.center().find((item) => item.id === demoCenterObligationIds.cnps),
      ).toMatchObject({
        status: 'paid',
        amount: null,
      });
    });

    it('sans le droit internal.manage (comptable) : « Vous n’avez pas accès »', async () => {
      await open('0700000004', demoIds.accountant);

      await waitFor(() => {
        expect(screen.queryByRole('list', { name: labels.caption })).toBeNull();
      });
      expect(
        await screen.findByRole('heading', { name: fr.errorScreens.forbiddenTitle }),
      ).toBeVisible();
    });

    it('échec du chargement : message', async () => {
      server = installApiServer();
      server.signIn('0700000002', demoIds.manager);
      server.failNext('GET', apiUrl('/cga/center-obligations'), { status: 500 });
      server.failNext('GET', apiUrl('/cga/center-obligations'), { status: 500 });
      const session = await httpAuthApi.currentSession();

      renderApp({ api: httpAuthApi, session, entry: '/cga/gestion-interne' });

      expect(await screen.findByText(labels.loadError, {}, { timeout: 5_000 })).toBeVisible();
    });
  },
);
