import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { fr } from '@/lib/i18n/fr';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import { fieldByLabel } from '@/test/fields';
import { renderApp } from '@/test/render-app';

/*
 * `/plateforme`, onglet « Modèles de documents » (étape 3.12, F-ADM-02, RG-DATA-03) : versions par
 * type, dépôt avec contrôle des variables, aperçu avec des données de test, activation avec la date
 * de validation du CNCGA. Vrai client `http`, backend simulé (`api-templates.ts`).
 */
const labels = fr.templates;
const ENTRY = '/plateforme?onglet=modeles';
const CONTRACT = labels.line('Contrat d’adhésion', '2026.1');

let server: ReturnType<typeof installApiServer>;

afterEach(() => {
  server.restore();
  vi.restoreAllMocks();
});

async function open() {
  server = installApiServer();
  server.signIn('0700000009', demoIds.platformAdmin);

  const session = await httpAuthApi.currentSession();
  const user = userEvent.setup({ delay: null });
  const view = renderApp({ api: httpAuthApi, session, entry: ENTRY });

  return { user, ...view };
}

type User = ReturnType<typeof userEvent.setup>;

async function action(user: User, line: string, item: string) {
  await user.click(screen.getByRole('button', { name: labels.rowActions(line) }));
  await user.click(screen.getByRole('menuitem', { name: item }));
}

function docx(name: string) {
  return new File(['PK'], name, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

const JOURNEY = { timeout: 15_000 };

describe('/plateforme · Modèles de documents (3.12, RG-DATA-03)', JOURNEY, () => {
  it('versions : active, validée par le CNCGA, documents émis, fichier ; aperçu avec des données de test', async () => {
    const { user } = await open();

    const list = within(await screen.findByRole('list', { name: labels.caption }));
    const contract = list.getByText(CONTRACT).closest('li') as HTMLElement;

    expect(within(contract).getByText(labels.active)).toBeVisible();
    expect(
      within(contract).getByText(
        `${labels.approved('02/01/2026')} · ${labels.documents('42')} · Modèle provisoire`,
      ),
    ).toBeVisible();
    expect(within(contract).getByRole('link', { name: labels.download })).toHaveAttribute(
      'href',
      'https://files.test/contrat.docx',
    );

    const opened = vi.spyOn(window, 'open').mockImplementation(() => null);

    await action(user, CONTRACT, labels.preview);
    expect(await screen.findByText(labels.previewed('2026.1'))).toBeInTheDocument();
    expect(opened).toHaveBeenCalledWith(
      'https://files.test/apercu-2026.1.pdf',
      '_blank',
      'noopener',
    );
  });

  it('RG-DATA-03 · déposer une version : contrôle, puis activation avec la date de validation ; l’ancienne n’est plus active', async () => {
    const { user } = await open();

    await screen.findByRole('list', { name: labels.caption });
    await user.click(screen.getByRole('button', { name: labels.upload.action }));

    const dialog = screen.getByRole('dialog', { name: labels.upload.title });

    await user.click(within(dialog).getByRole('button', { name: labels.upload.submit }));
    expect(await within(dialog).findAllByText(fr.members.create.errors.required)).toHaveLength(2);

    await user.type(fieldByLabel(dialog, labels.upload.version), '2026.2');
    await user.upload(fieldByLabel(dialog, labels.upload.file), docx('contrat-reel.docx'));
    await user.type(fieldByLabel(dialog, labels.upload.notes), 'Modèle réel DC-KNOWING');
    await user.click(within(dialog).getByRole('button', { name: labels.upload.submit }));

    expect(await within(dialog).findByText(labels.checkValid)).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: labels.upload.finish }));

    const line = labels.line('Contrat d’adhésion', '2026.2');

    await screen.findByText(line);
    await action(user, line, labels.activate.action);

    const activate = screen.getByRole('dialog', { name: labels.activate.title });

    await user.click(within(activate).getByRole('button', { name: labels.activate.submit }));
    expect(await within(activate).findByText(fr.members.create.errors.required)).toBeVisible();
    await user.type(fieldByLabel(activate, labels.activate.approvedOn), '2026-10-25');
    await user.click(within(activate).getByRole('button', { name: labels.activate.submit }));

    expect(await screen.findByText(labels.activate.done('2026.2'))).toBeInTheDocument();
    const fresh = await screen.findByText(line);

    expect(within(fresh.closest('li') as HTMLElement).getByText(labels.active)).toBeVisible();
    expect(
      within(screen.getByText(CONTRACT).closest('li') as HTMLElement).queryByText(labels.active),
    ).toBeNull();
  });

  it('version non conforme : variables manquantes et inconnues, ni aperçu ni activation', async () => {
    const { user } = await open();

    await screen.findByRole('list', { name: labels.caption });
    await user.click(screen.getByRole('button', { name: labels.upload.action }));

    const dialog = screen.getByRole('dialog', { name: labels.upload.title });

    await user.selectOptions(fieldByLabel(dialog, labels.upload.type), 'membership_certificate');
    await user.type(fieldByLabel(dialog, labels.upload.version), '2026.2');
    await user.upload(fieldByLabel(dialog, labels.upload.file), docx('attestation-incomplet.docx'));
    await user.click(within(dialog).getByRole('button', { name: labels.upload.submit }));

    expect(await within(dialog).findByText(labels.checkInvalid)).toBeVisible();
    expect(within(dialog).getByText(labels.missing('member_ncc'))).toBeVisible();
    expect(within(dialog).getByText(labels.unknown('nom_inconnu'))).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: labels.upload.finish }));

    const line = labels.line('Attestation d’adhésion', '2026.2');

    expect(await screen.findByText(line)).toBeVisible();
    expect(screen.queryByRole('button', { name: labels.rowActions(line) })).toBeNull();
  });

  it('refus du serveur : 422 sous le champ au dépôt ; panne de la liste ; 409 à l’aperçu', async () => {
    const { user, unmount } = await open();

    await screen.findByRole('list', { name: labels.caption });
    await user.click(screen.getByRole('button', { name: labels.upload.action }));

    const dialog = screen.getByRole('dialog', { name: labels.upload.title });

    await user.type(fieldByLabel(dialog, labels.upload.version), '2026.1');
    await user.upload(fieldByLabel(dialog, labels.upload.file), docx('contrat.docx'));
    server.failNext('POST', apiUrl('/platform/document-templates'), {
      status: 422,
      data: { message: 'Invalide.', errors: { version: ['Cette version existe déjà.'] } },
    });
    await user.click(within(dialog).getByRole('button', { name: labels.upload.submit }));
    expect(await within(dialog).findByText('Cette version existe déjà.')).toBeVisible();

    server.failNext('POST', apiUrl('/platform/document-templates'), {
      status: 422,
      data: { message: 'Invalide.', errors: { file: ['Le fichier doit être au format DOCX.'] } },
    });
    await user.click(within(dialog).getByRole('button', { name: labels.upload.submit }));
    expect(await within(dialog).findByText('Le fichier doit être au format DOCX.')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: fr.common.cancel }));
    unmount();
    server.restore();

    server = installApiServer();
    server.signIn('0700000009', demoIds.platformAdmin);
    for (let attempt = 0; attempt < 2; attempt++) {
      server.failNext('GET', apiUrl('/platform/document-templates'), {
        status: 500,
        data: { message: 'Erreur.' },
      });
    }

    const session = await httpAuthApi.currentSession();
    const retry = userEvent.setup({ delay: null });

    renderApp({ api: httpAuthApi, session, entry: ENTRY });
    expect(await screen.findByText(labels.loadError, {}, { timeout: 4000 })).toBeVisible();
    await retry.click(screen.getByRole('button', { name: fr.common.retry }));
    await screen.findByRole('list', { name: labels.caption });

    server.failNext(
      'POST',
      apiUrl('/platform/document-templates/01tpl000000000000000000001/preview'),
      {
        status: 409,
        data: { message: 'LibreOffice indisponible.', code: 'pdf_unavailable', details: {} },
      },
    );
    await action(retry, CONTRACT, labels.preview);
    expect(await screen.findByText('LibreOffice indisponible.')).toBeInTheDocument();
  });
});
