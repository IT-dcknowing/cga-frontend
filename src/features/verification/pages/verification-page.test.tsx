import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { fr } from '@/lib/i18n/fr';
import { apiUrl, installApiServer } from '@/test/api-server';
import { renderApp } from '@/test/render-app';

/*
 * `/verifier/:jeton` (étape 3.11, F-DOC-04, RG-DOC-09) : page publique, sans compte ; document
 * valide, annulé, code inconnu, limite de consultations. Vrai client `http`, backend simulé.
 */
const labels = fr.verification;

let server: ReturnType<typeof installApiServer>;

afterEach(() => {
  server.restore();
});

function valueOf(label: string): string | null {
  const term = screen.getAllByRole('term').find((item) => item.textContent === label);

  return term?.nextElementSibling?.textContent ?? null;
}

function open(code: string) {
  server = installApiServer();

  return renderApp({ api: httpAuthApi, session: null, entry: `/verifier/${code}` });
}

describe('/verifier/:jeton (3.11, RG-DOC-09)', () => {
  it('RG-DOC-09 · document valide, sans compte : bandeau vert, type, date, émetteur, adhérent, n°', async () => {
    open('valide-0123456789');

    expect(await screen.findByText(labels.valid)).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: labels.title })).toBeVisible();
    expect(valueOf(labels.type)).toBe('Attestation d’adhésion');
    expect(valueOf(labels.issuedOn)).toBe('12/01/2026');
    expect(valueOf(labels.issuer)).toBe('DC-KNOWING CGA');
    expect(valueOf(labels.member)).toBe('BOULANGERIE ADJOUA');
    expect(valueOf(labels.membershipNumber)).toBe('2026-DCK-0001');
    expect(server.requests.some((request) => request.url.endsWith('/me'))).toBe(false);
  });

  it('RG-DOC-08 · document annulé : bandeau rouge avec la date d’annulation', async () => {
    open('annule-0123456789');

    expect(await screen.findByText(labels.cancelled('01/02/2026'))).toBeVisible();
    expect(screen.queryByText(labels.valid)).toBeNull();
  });

  it('code inconnu : « Aucun document ne correspond à ce code », sans autre action', async () => {
    open('inconnu');

    expect(await screen.findByText(labels.unknown)).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('trop de consultations (429) puis panne : message et « Réessayer »', async () => {
    server = installApiServer();
    server.failNext('GET', apiUrl('/public/verify/valide-0123456789'), {
      status: 429,
      data: { message: 'Trop de requêtes.' },
    });
    server.failNext('GET', apiUrl('/public/verify/valide-0123456789'), {
      status: 500,
      data: { message: 'Erreur.' },
    });

    const user = userEvent.setup({ delay: null });

    renderApp({ api: httpAuthApi, session: null, entry: '/verifier/valide-0123456789' });
    expect(await screen.findByText(labels.tooMany)).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.common.retry }));
    expect(await screen.findByText(labels.loadError)).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.common.retry }));
    expect(await screen.findByText(labels.valid)).toBeVisible();
  });
});
