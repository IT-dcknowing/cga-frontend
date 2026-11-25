import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { memberRoutes } from '@/features/members/lib/member';
import { reportRoutes } from '@/features/reports/lib/routes';
import { fr } from '@/lib/i18n/fr';
import { demoReportIds, demoReportStates } from '@/test/api-reports';
import { conflict, invalid, ok } from '@/test/api-replies';
import {
  apiUrl,
  demoAccounts,
  demoIds,
  installApiServer,
  type ApiAccount,
} from '@/test/api-server';
import { demoMemberIds } from '@/test/demo-members';
import { renderApp } from '@/test/render-app';

/*
 * `/cga/rapports` et `/cga/rapports/:id` (06-IMPLEMENTATION-PLAN étape 5.8, F-RPT-02 à 07, parcours
 * P6) : liste et « Préparer le rapport T{n} », sections avec leur taux, champs enregistrés en quittant
 * la saisie, propositions de la campagne de clôture, états du portefeuille et anomalies, génération à
 * 100 %, transmission, accusé, correction, versions. Vrai client `http`, backend simulé
 * (`api-reports.ts`).
 */
const labels = fr.reports;

let server: ReturnType<typeof installApiServer>;

afterEach(() => {
  server.restore();
});

/** Secrétaire : prépare le rapport (`reports.prepare`) sans le transmettre. */
const SECRETARY: Record<string, ApiAccount> = {
  '+2250700000022': {
    user: {
      first_name: 'Mariam',
      last_name: 'Secrétaire',
      phone: '+2250700000022',
      email: null,
      notification_preferences: { sms: false, whatsapp: false },
    },
    memberships: [
      {
        id: '01ms0000000000000000000s22',
        role: 'cga_secretary',
        organization: {
          id: demoIds.dck,
          type: 'cga',
          name: 'DC-KNOWING CGA',
          banking_enabled: false,
        },
        member: null,
        unread_notifications: 0,
      },
    ],
  },
};

async function open(entry: string, phone = '0700000002', membership: string = demoIds.manager) {
  server = installApiServer({ accounts: { ...demoAccounts, ...SECRETARY } });
  server.signIn(phone, membership);

  const session = await httpAuthApi.currentSession();
  const user = userEvent.setup({ delay: null });
  const view = renderApp({ api: httpAuthApi, session, entry });

  return { user, ...view };
}

function lastPatch(): unknown {
  return server.requests.filter((request) => request.method === 'PATCH').at(-1)?.body;
}

describe('/cga/rapports · liste (5.8)', { timeout: 30_000 }, () => {
  it('rapports avec statut, retard et avancement ; « Préparer le rapport T4 2026 » ouvre le rapport', async () => {
    const { user, router } = await open(reportRoutes.list);

    const list = await screen.findByRole('list', { name: labels.caption });
    const rows = within(list).getAllByRole('link');

    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Rapport du 3e trimestre 2026');
    expect(rows[0]).toHaveTextContent(labels.lateShort);
    expect(rows[0]).toHaveTextContent('Brouillon');
    expect(rows[2]).toHaveTextContent('Transmis');

    await user.click(screen.getByRole('button', { name: labels.prepare('4', '2026') }));

    expect(await screen.findByText(labels.created('Rapport du 4e trimestre 2026'))).toBeVisible();
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/cga\/rapports\/01rpt/);
    });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Rapport du 4e trimestre 2026' }),
    ).toBeVisible();
  });

  it('rapports indisponibles : bandeau puis « Réessayer »', async () => {
    server = installApiServer();
    for (let attempt = 0; attempt < 2; attempt++) {
      server.failNext('GET', apiUrl('/cga/quarterly-reports'), {
        status: 500,
        data: { message: 'panne' },
      });
    }
    server.signIn('0700000002', demoIds.manager);
    const session = await httpAuthApi.currentSession();
    const user = userEvent.setup({ delay: null });

    renderApp({ api: httpAuthApi, session, entry: reportRoutes.list });
    expect(await screen.findByText(labels.loadError, {}, { timeout: 5_000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.common.retry }));
    expect(await screen.findByRole('list', { name: labels.caption })).toBeVisible();
  });
});

describe(
  '/cga/rapports/:id · préparation et génération (5.8, parcours P6)',
  { timeout: 30_000 },
  () => {
    it('RG-RPT-02 · sections et taux, champ enregistré en quittant la saisie, génération à 100 %', async () => {
      const { user } = await open(reportRoutes.detail(demoReportIds.q3));

      expect(await screen.findByText(labels.deadline('31/10/2026', '15/11/2026'))).toBeVisible();
      expect(screen.getByText(labels.late)).toBeVisible();
      expect(
        screen.getByLabelText(labels.sectionProgress(labels.sections.section_4, '92')),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: labels.actions.generate })).toBeDisabled();
      expect(screen.getByText(labels.actions.generateHint)).toBeVisible();

      const promotion = screen.getByLabelText(labels.fields.promotion);

      await user.type(promotion, 'Néant');
      await user.tab();

      await waitFor(() => {
        expect(lastPatch()).toEqual({ content: { promotion: 'Néant' } });
      });
      expect(await screen.findByText(labels.saved)).toBeVisible();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: labels.actions.generate })).toBeEnabled();
      });

      await user.click(screen.getByRole('button', { name: labels.actions.generate }));
      expect(await screen.findByText(labels.actions.generated('1'))).toBeVisible();
      expect(await screen.findByRole('link', { name: 'Rapport PDF' })).toHaveAttribute(
        'href',
        'https://files.test/rapport-v1.pdf',
      );
      expect(screen.getByRole('link', { name: 'Classeur de compatibilité Excel' })).toBeVisible();
      expect(screen.getByRole('button', { name: labels.actions.transmit })).toBeVisible();
    });

    it('RG-OBL-12 · nombres proposés par la campagne de clôture, impôts des dirigeants, date du rapport', async () => {
      const { user } = await open(reportRoutes.detail(demoReportIds.q3));

      const smt = await screen.findByLabelText(labels.fields.smt_established);

      expect(smt).toHaveValue(3);
      expect(screen.getByText(labels.proposal('4', '2025'))).toBeVisible();
      await user.click(
        within(smt.closest('div[class*="grid"]') as HTMLElement).getByRole('button', {
          name: labels.useProposal,
        }),
      );
      await waitFor(() => {
        expect(lastPatch()).toEqual({ content: { smt_established: 4 } });
      });

      const its = screen.getByLabelText(labels.peopleTaxes.field('ITS', 'Koffi Gérant'));

      await user.clear(its);
      await user.type(its, '150000');
      await user.tab();
      await waitFor(() => {
        expect(lastPatch()).toEqual({
          people_taxes: [{ person_id: demoReportIds.director, its: 150000, igr: 0, cnps: 45000 }],
        });
      });

      const date = screen.getByLabelText(labels.reportDate);

      await user.clear(date);
      await user.type(date, '2026-10-25');
      await user.tab();
      await waitFor(() => {
        expect(lastPatch()).toEqual({ report_date: '2026-10-25' });
      });

      // Sections 1 à 3 : rappel de la fiche permanente (étape 5.7).
      const profileLinks = screen.getAllByRole('link', { name: labels.updateProfile });

      expect(profileLinks).toHaveLength(3);
      expect(profileLinks[0]).toHaveAttribute('href', reportRoutes.permanentProfile);
    });

    it('RG-RPT-11 · états du portefeuille CGA par CDI et anomalies avec lien vers le dossier ; aperçu', async () => {
      const { user } = await open(reportRoutes.detail(demoReportIds.q3));

      const table = await screen.findByRole('table', { name: labels.states.summaryCaption });

      expect(within(table).getByRole('rowheader', { name: 'CDI Plateau' })).toBeVisible();
      expect(within(table).getByRole('rowheader', { name: labels.states.noOffice })).toBeVisible();
      expect(
        within(screen.getByRole('list', { name: labels.states.sheetsCaption })).getByText(
          labels.states.count('3'),
        ),
      ).toBeVisible();
      expect(screen.getByText('1 adhérent sans CDI')).toBeVisible();
      expect(
        screen.getByRole('link', { name: labels.states.openMember('QUINCAILLERIE BAMBA') }),
      ).toHaveAttribute('href', memberRoutes.detail(demoMemberIds.bamba));

      await user.click(screen.getByRole('button', { name: labels.actions.preview }));
      const preview = await screen.findByRole('dialog', {
        name: labels.preview.title('Rapport du 3e trimestre 2026'),
      });

      expect(await within(preview).findByText('DC-KNOWING CGA')).toBeVisible();
      expect(within(preview).getByText('Le portefeuille progresse de 3 adhérents.')).toBeVisible();
      await user.click(
        within(preview).getAllByRole('button', { name: fr.common.close }).at(-1) as HTMLElement,
      );
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).toBeNull();
      });
    });
  },
);

describe(
  '/cga/rapports/:id · transmission, accusé, correction (5.8, F-RPT-04 à 06)',
  { timeout: 30_000 },
  () => {
    it('RG-RPT-04 · transmission, accusé de réception puis correction en nouvelle version', async () => {
      const { user } = await open(reportRoutes.detail(demoReportIds.q2));

      await user.click(await screen.findByRole('button', { name: labels.actions.transmit }));
      const transmit = await screen.findByRole('dialog', { name: labels.transmit.title });

      await user.selectOptions(within(transmit).getByRole('combobox'), 'email');
      await user.type(within(transmit).getByLabelText(labels.transmit.reference), 'ENV-2026-07');
      await user.click(within(transmit).getByRole('button', { name: labels.transmit.submit }));

      expect(await screen.findByText(labels.transmit.done)).toBeVisible();
      expect(await screen.findByText(/Transmis le .* \(E-mail\) par Koffi Gérant/)).toBeVisible();
      expect(
        await screen.findByRole('link', { name: 'Bordereau de transmission PDF' }),
      ).toBeVisible();

      await user.click(screen.getByRole('button', { name: labels.actions.acknowledge }));
      const acknowledge = await screen.findByRole('dialog', { name: labels.acknowledge.title });

      await user.click(
        within(acknowledge).getByRole('button', { name: labels.acknowledge.submit }),
      );
      expect(within(acknowledge).getAllByText(fr.members.create.errors.required)).toHaveLength(2);
      await user.type(
        within(acknowledge).getByLabelText(new RegExp(labels.acknowledge.reference)),
        'SP-778',
      );
      await user.upload(
        within(acknowledge).getByLabelText(new RegExp(labels.acknowledge.file)),
        new File(['%PDF'], 'accuse.pdf', { type: 'application/pdf' }),
      );
      await user.click(
        within(acknowledge).getByRole('button', { name: labels.acknowledge.submit }),
      );

      expect(await screen.findByText(labels.acknowledge.done)).toBeVisible();
      expect(await screen.findByRole('link', { name: labels.acknowledgementFile })).toHaveAttribute(
        'href',
        'https://files.test/accuse-rapport.pdf',
      );

      await user.click(screen.getByRole('button', { name: labels.actions.correct }));
      const correct = await screen.findByRole('dialog', { name: labels.correct.title });

      await user.click(within(correct).getByRole('button', { name: labels.correct.submit }));
      expect(within(correct).getByText(fr.members.create.errors.required)).toBeVisible();
      await user.type(
        within(correct).getByLabelText(new RegExp(labels.correct.reason)),
        'Erreur sur les états TEE',
      );
      await user.click(within(correct).getByRole('button', { name: labels.correct.submit }));

      expect(await screen.findByText(labels.correct.done('2'))).toBeVisible();
      expect(
        await screen.findByText(labels.versions.reason('Erreur sur les états TEE')),
      ).toBeVisible();
    });

    it('secrétaire : prépare sans transmettre ; rapport transmis en lecture seule', async () => {
      await open(reportRoutes.detail(demoReportIds.q1), '0700000022', '01ms0000000000000000000s22');

      expect(await screen.findByText(labels.readOnly)).toBeVisible();
      expect(screen.getByLabelText(labels.fields.trainings)).toBeDisabled();
      expect(screen.queryByRole('button', { name: labels.actions.correct })).toBeNull();
      expect(screen.queryByRole('button', { name: labels.actions.generate })).toBeNull();
    });

    it('rapport introuvable : bandeau d’erreur', async () => {
      server = installApiServer();
      for (let attempt = 0; attempt < 2; attempt++) {
        server.failNext('GET', apiUrl(`/cga/quarterly-reports/${demoReportIds.q1}`), {
          status: 500,
          data: { message: 'panne' },
        });
      }
      server.signIn('0700000002', demoIds.manager);
      const session = await httpAuthApi.currentSession();

      renderApp({ api: httpAuthApi, session, entry: reportRoutes.detail(demoReportIds.q1) });
      expect(await screen.findByText(labels.detailError, {}, { timeout: 5_000 })).toBeVisible();
    });
  },
);

describe('/cga/rapports · refus du serveur (5.8)', { timeout: 30_000 }, () => {
  it('enregistrement refusé (409, puis 422) et génération refusée : messages du serveur', async () => {
    const { user } = await open(reportRoutes.detail(demoReportIds.q3));
    const path = apiUrl(`/cga/quarterly-reports/${demoReportIds.q3}`);

    await screen.findByLabelText(labels.fields.promotion);
    server.failNext(
      'PATCH',
      path,
      conflict('report_not_editable', 'Ce rapport n’est plus modifiable.'),
    );
    await user.type(screen.getByLabelText(labels.fields.promotion), 'Néant');
    await user.tab();
    // Notification éphémère : présente, même pendant son animation d'entrée.
    expect(await screen.findByText('Ce rapport n’est plus modifiable.')).toBeInTheDocument();
    expect(screen.getByText(labels.saveError)).toBeVisible();

    server.failNext('PATCH', path, invalid({ 'content.tools': 'Le texte est trop long.' }));
    await user.type(screen.getByLabelText(labels.fields.tools), ' et tableurs');
    await user.tab();
    // Notification éphémère : présente, même pendant son animation d'entrée.
    expect(await screen.findByText('Le texte est trop long.')).toBeInTheDocument();

    await user.type(screen.getByLabelText(labels.fields.meetings_partners), ' ');
    await user.clear(screen.getByLabelText(labels.fields.promotion));
    await user.type(screen.getByLabelText(labels.fields.promotion), 'Néant');
    await user.tab();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: labels.actions.generate })).toBeEnabled();
    });
    server.failNext(
      'POST',
      `${path}/generate`,
      conflict('report_incomplete', 'Le rapport n’est pas complet.'),
    );
    await user.click(screen.getByRole('button', { name: labels.actions.generate }));
    // Notification éphémère : présente, même pendant son animation d'entrée.
    expect(await screen.findByText('Le rapport n’est pas complet.')).toBeInTheDocument();
  });

  it('transmission refusée (409 puis 422) et aperçu indisponible', async () => {
    const { user } = await open(reportRoutes.detail(demoReportIds.q2));
    const path = apiUrl(`/cga/quarterly-reports/${demoReportIds.q2}`);

    await user.click(await screen.findByRole('button', { name: labels.actions.transmit }));
    const transmit = await screen.findByRole('dialog', { name: labels.transmit.title });

    server.failNext(
      'POST',
      `${path}/transmit`,
      conflict('report_not_generated', 'Le rapport doit d’abord être généré.'),
    );
    await user.click(within(transmit).getByRole('button', { name: labels.transmit.submit }));
    expect(await within(transmit).findByText('Le rapport doit d’abord être généré.')).toBeVisible();

    server.failNext(
      'POST',
      `${path}/transmit`,
      invalid({ mode: 'Le mode de transmission est invalide.' }),
    );
    await user.click(within(transmit).getByRole('button', { name: labels.transmit.submit }));
    expect(
      await within(transmit).findByText('Le mode de transmission est invalide.'),
    ).toBeVisible();

    await user.clear(within(transmit).getByLabelText(new RegExp(labels.transmit.date)));
    await user.click(within(transmit).getByRole('button', { name: labels.transmit.submit }));
    expect(within(transmit).getByText(fr.members.create.errors.required)).toBeVisible();
    await user.click(within(transmit).getByRole('button', { name: fr.common.cancel }));

    for (let attempt = 0; attempt < 2; attempt++) {
      server.failNext('GET', `${path}/preview`, { status: 500, data: { message: 'panne' } });
    }
    await user.click(screen.getByRole('button', { name: labels.actions.preview }));
    expect(await screen.findByText(labels.preview.loadError, {}, { timeout: 5_000 })).toBeVisible();
  });

  it('« Préparer le rapport » refusé : message du serveur, aucune navigation', async () => {
    const { user, router } = await open(reportRoutes.list);

    server.failNext(
      'POST',
      apiUrl('/cga/quarterly-reports'),
      conflict('report_exists', 'Ce rapport existe déjà.'),
    );
    await user.click(await screen.findByRole('button', { name: labels.prepare('4', '2026') }));

    // Notification éphémère : présente, même pendant son animation d'entrée.
    expect(await screen.findByText('Ce rapport existe déjà.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(reportRoutes.list);
  });
});

describe(
  '/cga/rapports/:id · rapport modernisé (5.12, RG-RPT-09, RG-RPT-12)',
  { timeout: 30_000 },
  () => {
    it('RG-RPT-12 · indicateur de source des données et graphiques des états avec leurs valeurs', async () => {
      await open(reportRoutes.detail(demoReportIds.q3));

      expect(await screen.findByText(labels.sources.manual)).toBeVisible();
      expect(
        screen.getByText(
          labels.sources.detail(
            labels.sources.item('4', 'saisie'),
            labels.sources.item('6', 'saisie'),
          ),
        ),
      ).toBeVisible();

      const charts = await screen.findByRole('region', { name: labels.charts.title });
      const regimes = within(charts).getByRole('figure', { name: 'Portefeuille CGA par régime' });

      expect(
        within(regimes).getByRole('table', { name: 'Portefeuille CGA par régime' }),
      ).toHaveTextContent('TEE4');
      expect(
        within(charts).getByRole('figure', { name: 'Adhérents actifs par trimestre' }),
      ).toBeInTheDocument();
      expect(
        within(charts).getByRole('figure', { name: 'Paiements des adhérents RME par nature' }),
      ).toBeInTheDocument();
    });

    it('RG-RPT-12 · données Compta Flow signalées', async () => {
      const { user } = await open(reportRoutes.list);

      server.failNext(
        'GET',
        apiUrl(`/cga/quarterly-reports/${demoReportIds.q3}/states`),
        ok({
          ...demoReportStates,
          sources: { revenues: { compta_flow: 3 }, payments: { compta_flow: 2, entry: 1 } },
        }),
      );
      await user.click(
        await screen.findByRole('link', { name: labels.open('Rapport du 3e trimestre 2026') }),
      );

      expect(await screen.findByText(labels.sources.flow)).toBeVisible();
      expect(
        screen.getByText(
          labels.sources.detail(
            labels.sources.item('3', 'Compta Flow'),
            `${labels.sources.item('2', 'Compta Flow')}, ${labels.sources.item('1', 'saisie')}`,
          ),
        ),
      ).toBeVisible();
    });

    it('RG-RPT-09 · synthèse chiffrée proposée par la plateforme, reprise puis modifiable ; aperçu du rapport modernisé', async () => {
      const { user } = await open(reportRoutes.detail(demoReportIds.q3));

      await user.click(await screen.findByRole('button', { name: labels.synthesis.propose }));

      expect(await screen.findByText(labels.synthesis.proposed)).toBeVisible();
      expect(lastPatch()).toEqual({
        qualitative_analysis: {
          synthesis:
            'Au 30/09/2026, le portefeuille compte 5 adhérents actifs (+1 sur le trimestre).',
        },
      });
      await waitFor(() => {
        expect(screen.getByLabelText(new RegExp(labels.qualitative.synthesis))).toHaveValue(
          'Au 30/09/2026, le portefeuille compte 5 adhérents actifs (+1 sur le trimestre).',
        );
      });

      await user.click(screen.getByRole('button', { name: labels.actions.preview }));
      const preview = await screen.findByRole('dialog', {
        name: labels.preview.title('Rapport du 3e trimestre 2026'),
      });

      expect(
        await within(preview).findByRole('table', { name: labels.states.summaryCaption }),
      ).toBeVisible();
      expect(
        within(preview).getByRole('region', { name: labels.charts.title }),
      ).toBeInTheDocument();
      expect(within(preview).getByText(labels.qualitative.title)).toBeVisible();
    });

    it('synthèse indisponible : message, aucun enregistrement', async () => {
      const { user } = await open(reportRoutes.detail(demoReportIds.q3));

      // Les graphiques de la section 5 ont chargé l'aperçu ; la demande de synthèse le relit.
      await screen.findByRole('region', { name: labels.charts.title });
      for (let attempt = 0; attempt < 2; attempt++) {
        server.failNext('GET', apiUrl(`/cga/quarterly-reports/${demoReportIds.q3}/preview`), {
          status: 500,
          data: { message: 'panne' },
        });
      }
      await user.click(screen.getByRole('button', { name: labels.synthesis.propose }));

      expect(await screen.findByText(labels.synthesis.error, {}, { timeout: 5_000 })).toBeVisible();
      expect(server.requests.some((request) => request.method === 'PATCH')).toBe(false);
    });
  },
);
