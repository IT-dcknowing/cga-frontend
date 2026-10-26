import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { memberSpaceRoutes } from '@/features/member-space/lib/routes';
import { spaces } from '@/features/auth/lib/destination';
import { formatAmount } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import { fieldByLabel } from '@/test/fields';
import { renderApp } from '@/test/render-app';

/*
 * Espace adhérent, étape 3.10 (06-IMPLEMENTATION-PLAN, 03-APPFLOW §5.2) : `/adherent/documents`
 * (PDF seulement, badge « Annulé », RG-DOC-04) et `/adherent/honoraires` depuis l'accueil (échéances,
 * paiements, « Déclarer un paiement » avec preuve obligatoire, F-PAY-03). Vrai client `http`,
 * backend simulé (`api-member-finance.ts`).
 */
const documents = fr.memberSpace.documents;
const fees = fr.memberSpace.fees;
const declare = fees.declare;

let server: ReturnType<typeof installApiServer>;

afterEach(() => {
  server.restore();
});

async function open(entry: string) {
  server = installApiServer();
  server.signIn('0700000012', demoIds.memberOwner);

  const session = await httpAuthApi.currentSession();
  const user = userEvent.setup({ delay: null });
  const view = renderApp({ api: httpAuthApi, session, entry });

  return { user, ...view };
}

/** Texte tel que Testing Library le compare : espaces insécables des montants ramenés à un espace. */
function spaced(text: string): string {
  return text.replace(/\s+/g, ' ');
}

function writes(suffix: string) {
  return server.requests.filter(
    (request) => request.method !== 'GET' && new URL(request.url).pathname.endsWith(suffix),
  );
}

const JOURNEY = { timeout: 15_000 };

describe('/adherent/documents (3.10, RG-DOC-04)', JOURNEY, () => {
  it('ses documents en PDF : n°, date, statut ; un document annulé garde son badge « Annulé »', async () => {
    await open(memberSpaceRoutes.documents);

    const list = within(await screen.findByRole('list', { name: documents.caption }));
    const cancelled = list.getByText('Attestation d’adhésion 2025').closest('li') as HTMLElement;

    expect(list.getByText('CTR-DCK-2026-00001 · 12/01/2026')).toBeVisible();
    expect(within(cancelled).getByText(fr.status.document.cancelled)).toBeVisible();
    expect(
      list.getByRole('link', { name: documents.download('Contrat d’adhésion') }),
    ).toHaveAttribute('href', 'https://files.test/contrat.pdf');
    // Jamais de version Word dans l'espace adhérent.
    expect(list.queryByText(fr.members.documents.docx)).toBeNull();
  });

  it('panne : bandeau et « Réessayer »', async () => {
    server = installApiServer();
    server.signIn('0700000012', demoIds.memberOwner);
    for (let attempt = 0; attempt < 2; attempt++) {
      server.failNext('GET', apiUrl('/member/documents'), {
        status: 500,
        data: { message: 'Erreur.' },
      });
    }

    const session = await httpAuthApi.currentSession();
    const user = userEvent.setup({ delay: null });

    renderApp({ api: httpAuthApi, session, entry: memberSpaceRoutes.documents });
    expect(await screen.findByText(documents.loadError, {}, { timeout: 4000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.common.retry }));
    expect(await screen.findByRole('list', { name: documents.caption })).toBeVisible();
  });
});

describe('/adherent/honoraires (3.10, F-PAY-03)', JOURNEY, () => {
  it('depuis l’accueil : la carte « Mes honoraires », puis échéances, reste à payer et paiements', async () => {
    const { user, router } = await open(spaces.member.home);

    expect(
      await screen.findByRole('link', { name: fr.memberSpace.home.documentsLink }),
    ).toHaveAttribute('href', memberSpaceRoutes.documents);
    await user.click(screen.getByRole('link', { name: fr.memberSpace.home.feesLink }));

    expect(router.state.location.pathname).toBe(memberSpaceRoutes.fees);
    expect(await screen.findByRole('heading', { level: 1, name: fees.title })).toBeVisible();
    expect(screen.getByText(spaced(formatAmount(17700)))).toBeVisible();

    const charges = within(screen.getByRole('list', { name: fees.charges }));

    expect(charges.getByText('Honoraires · 01/10/2026 – 31/10/2026')).toBeVisible();
    expect(charges.getByText(fr.status.charge.paid)).toBeVisible();

    const payments = within(screen.getByRole('list', { name: fees.payments }));

    expect(payments.getByText(/REC-DCK-2026-00001/)).toBeVisible();
  });

  it('« Déclarer un paiement » : montant, date et preuve exigés ; refus (422) sous le champ ; puis « À confirmer »', async () => {
    const { user } = await open(memberSpaceRoutes.fees);

    await user.click(await screen.findByRole('button', { name: declare.action }));

    const dialog = screen.getByRole('dialog', { name: declare.title });

    await user.click(within(dialog).getByRole('button', { name: declare.submit }));
    expect(await within(dialog).findByText(fr.members.create.errors.number)).toBeVisible();
    expect(within(dialog).getAllByText(fr.members.create.errors.required)).toHaveLength(2);
    expect(writes('/member/payments')).toHaveLength(0);

    await user.type(fieldByLabel(dialog, declare.amount), '17700');
    await user.type(fieldByLabel(dialog, declare.paidOn), '2026-10-20');
    await user.type(fieldByLabel(dialog, declare.reference), 'OM-OCT');
    await user.upload(
      fieldByLabel(dialog, declare.proof),
      new File(['%PDF-1.4'], 'preuve.pdf', { type: 'application/pdf' }),
    );

    server.failNext('POST', apiUrl('/member/payments'), {
      status: 422,
      data: { message: 'Invalide.', errors: { proof: ['La preuve est illisible.'] } },
    });
    await user.click(within(dialog).getByRole('button', { name: declare.submit }));
    expect(await within(dialog).findByText('La preuve est illisible.')).toBeVisible();

    server.failNext('POST', apiUrl('/member/payments'), {
      status: 422,
      data: { message: 'Invalide.', errors: { paid_on: ['La date ne peut pas être future.'] } },
    });
    await user.click(within(dialog).getByRole('button', { name: declare.submit }));
    expect(await within(dialog).findByText('La date ne peut pas être future.')).toBeVisible();

    await user.click(within(dialog).getByRole('button', { name: declare.submit }));
    expect(await screen.findByText(declare.done)).toBeInTheDocument();

    const body = writes('/member/payments').at(-1)?.body as FormData;

    expect(Object.fromEntries(body.entries())).toMatchObject({
      amount: '17700',
      paid_on: '2026-10-20',
      method: 'mobile_money',
      reference: 'OM-OCT',
    });
    expect(body.get('proof')).toBeInstanceOf(File);
    expect(
      await within(screen.getByRole('list', { name: fees.payments })).findByText(
        fr.status.payment.pending_confirmation,
      ),
    ).toBeVisible();
  });

  it('refus (409) dans la modale ; panne : bandeau et « Réessayer »', async () => {
    const { user, unmount } = await open(memberSpaceRoutes.fees);

    await user.click(await screen.findByRole('button', { name: declare.action }));

    const dialog = screen.getByRole('dialog', { name: declare.title });

    await user.type(fieldByLabel(dialog, declare.amount), '5000');
    await user.type(fieldByLabel(dialog, declare.paidOn), '2026-10-20');
    await user.upload(
      fieldByLabel(dialog, declare.proof),
      new File(['%PDF-1.4'], 'preuve.pdf', { type: 'application/pdf' }),
    );
    server.failNext('POST', apiUrl('/member/payments'), {
      status: 409,
      data: { message: 'Adhésion terminée.', code: 'member_ended', details: {} },
    });
    await user.click(within(dialog).getByRole('button', { name: declare.submit }));
    expect(await within(dialog).findByText('Adhésion terminée.')).toBeVisible();
    unmount();
    server.restore();

    server = installApiServer();
    server.signIn('0700000012', demoIds.memberOwner);
    for (let attempt = 0; attempt < 2; attempt++) {
      server.failNext('GET', apiUrl('/member/charges'), {
        status: 500,
        data: { message: 'Erreur.' },
      });
    }

    const session = await httpAuthApi.currentSession();
    const retry = userEvent.setup({ delay: null });

    renderApp({ api: httpAuthApi, session, entry: memberSpaceRoutes.fees });
    expect(await screen.findByText(fees.loadError, {}, { timeout: 4000 })).toBeVisible();
    await retry.click(screen.getByRole('button', { name: fr.common.retry }));
    expect(await screen.findByRole('heading', { level: 1, name: fees.title })).toBeVisible();
  });
});
