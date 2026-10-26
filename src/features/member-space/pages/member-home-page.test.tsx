import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { spaceRoutes } from '@/features/auth/lib/destination';
import { fr } from '@/lib/i18n/fr';
import { createMembersBackend } from '@/test/api-members';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import { demoMember, demoMemberIds, demoMembers } from '@/test/demo-members';
import { renderApp } from '@/test/render-app';

/*
 * `/adherent/accueil`, version minimale (06-IMPLEMENTATION-PLAN étape 2.11) : message d'accueil, son
 * dossier, son CGA ; fin d'adhésion après une radiation validée. Accès de l'adhérent de démonstration
 * (0700000012, dossier BOULANGERIE ADJOUA) ; vrai client `http`, backend simulé.
 */
const labels = fr.memberSpace.home;

let server: ReturnType<typeof installApiServer>;

afterEach(() => {
  server.restore();
});

async function openHome(members = createMembersBackend()) {
  server = installApiServer({ members });
  server.signIn('0700000012', demoIds.memberOwner);

  const session = await httpAuthApi.currentSession();

  return renderApp({ api: httpAuthApi, session, entry: spaceRoutes.member });
}

function main() {
  return within(screen.getByRole('main'));
}

function valueOf(label: string): string | null {
  const term = screen.getAllByRole('term').find((item) => item.textContent === label);

  return term?.nextElementSibling?.textContent ?? null;
}

// Le premier écran charge l'espace adhérent : délai des parcours (voir la fiche adhérent), assertions
// inchangées ; il dépassait 5 s quand toute la suite tourne en parallèle.
describe('/adherent/accueil · accueil de l’adhérent (2.11)', { timeout: 15_000 }, () => {
  it('bonjour, message d’accueil, son dossier et les contacts de son CGA', async () => {
    await openHome();

    expect(
      await main().findByRole('heading', { level: 1, name: labels.greeting('Sery') }),
    ).toBeVisible();
    expect(main().getByText(labels.welcome('DC-KNOWING CGA'))).toBeVisible();
    expect(main().getByText('BOULANGERIE ADJOUA')).toBeVisible();
    expect(valueOf(labels.fields.number)).toBe('2026-DCK-0001');
    expect(valueOf(labels.fields.adhesionDate)).toBe('10/01/2026');
    expect(valueOf(labels.fields.status)).toBe(fr.status.member.active);
    expect(main().getByRole('link', { name: '+2252722445501' })).toHaveAttribute(
      'href',
      'tel:+2252722445501',
    );
    expect(main().getByRole('link', { name: 'contact@dcknowing.demo' })).toHaveAttribute(
      'href',
      'mailto:contact@dcknowing.demo',
    );
    // RG-PTF-06 : l'apporteur ne figure jamais dans l'espace de l'adhérent.
    expect(main().queryByText('Accessoire 1')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('adhésion terminée : bandeau avec la date de fin et la consultation seule', async () => {
    const radiated = demoMembers().map((member) =>
      member.id === demoMemberIds.adjoua
        ? demoMember({
            ...member,
            status: 'radiated',
            status_label: 'Radié',
            radiation: {
              id: '01rad000000000000000000001',
              status: 'validated',
              status_label: 'Radiation validée',
              initiator: 'member',
              initiator_label: 'Contribuable',
              reason: 'dissatisfaction',
              reason_label: 'Insatisfaction des prestations',
              reason_other: null,
              effective_date: '2026-09-30',
              sp_request_reference: null,
              requested_at: '2026-09-20T09:00:00Z',
              validated_at: '2026-09-25T09:00:00Z',
              validation_reference: null,
              outcome: 'closed',
              outcome_label: 'Dossier clos',
              report_year: 2026,
              report_quarter: 3,
              cancellable_until: null,
              can: { validate: false, cancel: false },
            },
          })
        : member,
    );

    await openHome(createMembersBackend(radiated));

    expect(await screen.findByRole('status')).toHaveTextContent(
      labels.endedUntil('30/09/2026', '31/03/2027'),
    );
  });

  it('adhésion terminée sans date de consultation : la seule date de fin', async () => {
    server = installApiServer();
    server.signIn('0700000012', demoIds.memberOwner);
    server.failNext('GET', apiUrl('/member/home'), {
      status: 200,
      data: {
        data: {
          member: {
            company_name: 'BOULANGERIE ADJOUA',
            sigle: null,
            number: '2026-DCK-0001',
            portfolio: 'cga',
            portfolio_label: 'Portefeuille CGA',
            status: 'radiated',
            status_label: 'Radié',
            regime_label: 'TEE',
            adhesion_date: null,
            ended_on: '2026-09-30',
          },
          access: { role: 'member_owner', role_label: 'Accès principal', read_only_until: null },
          organization: {
            name: 'DC-KNOWING CGA',
            sigle: null,
            address: null,
            city: null,
            phone_1: null,
            phone_2: null,
            email: null,
          },
        },
      },
    });

    const session = await httpAuthApi.currentSession();

    renderApp({ api: httpAuthApi, session, entry: spaceRoutes.member });

    expect(await screen.findByRole('status')).toHaveTextContent(labels.ended('30/09/2026'));
    // Coordonnées absentes : « Non renseigné ».
    expect(valueOf(labels.fields.phone)).toBe(fr.common.notProvided);
    expect(valueOf(labels.fields.email)).toBe(fr.common.notProvided);
  });

  it('panne : bandeau et « Réessayer »', async () => {
    server = installApiServer();
    server.signIn('0700000012', demoIds.memberOwner);
    server.failNext('GET', apiUrl('/member/home'), { status: 500 });
    server.failNext('GET', apiUrl('/member/home'), { status: 500 });

    const session = await httpAuthApi.currentSession();
    const user = userEvent.setup();

    renderApp({ api: httpAuthApi, session, entry: spaceRoutes.member });

    expect(await screen.findByText(labels.loadError, {}, { timeout: 4000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.common.retry }));
    expect(await screen.findByText('BOULANGERIE ADJOUA')).toBeVisible();
  });
});
