import { expect, test } from '@playwright/test';
import { apiBaseUrl } from './api-env';

/*
 * Parcours P1 jusqu'à l'invitation du gérant (étape 1.5, 03-APPFLOW §8) sur l'API réelle : la
 * Présidente enregistre un CGA et invite son gérant, puis le suspend et le réactive (F-ORG-06).
 * Chaque passage crée un CGA et un gérant invité de plus dans la base de démonstration, sous des
 * noms et numéros uniques ; aucun CGA du seeder n'est touché.
 */
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'Demo-Cga-2026';

test('P1 · la Présidente enregistre un CGA, invite son gérant, puis le suspend et le réactive', async ({
  page,
}) => {
  // Numéros ivoiriens à 10 chiffres et dénomination uniques à chaque passage.
  const stamp = String(Date.now()).slice(-8);
  const name = `CGA Parcours ${stamp}`;

  await page.goto('/connexion');
  await page.getByLabel(/Téléphone ou e-mail/).fill('0700000001');
  await page.getByLabel(/^Mot de passe/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/cncga\/tableau-de-bord$/);

  await page
    .getByRole('navigation', { name: 'Menu principal' })
    .getByRole('link', { name: 'Membres (CGA)' })
    .click();
  await expect(page.getByRole('row', { name: /DC-KNOWING CGA/ })).toBeVisible();

  await page.getByRole('button', { name: 'Enregistrer un CGA' }).first().click();

  const dialog = page.getByRole('dialog', { name: 'Nouveau CGA' });

  await dialog.getByRole('textbox', { name: 'Dénomination', exact: true }).fill(name);
  await dialog.getByRole('textbox', { name: 'Ville', exact: true }).fill('Korhogo');
  await dialog.getByRole('textbox', { name: 'Téléphone', exact: true }).fill(`05${stamp}`);
  await dialog.getByRole('checkbox', { name: 'Ouvrir l’accès maintenant' }).check();
  await dialog.getByRole('textbox', { name: 'Prénom du gérant' }).fill('Gérant');
  await dialog
    .getByRole('textbox', { name: 'Nom du gérant', exact: true })
    .fill(`Parcours ${stamp}`);
  await dialog.getByRole('textbox', { name: 'Téléphone du gérant' }).fill(`07${stamp}`);

  const creation = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url() === `${apiBaseUrl}/network/organizations`,
  );
  const invitation = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().endsWith('/manager'),
  );
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();

  // Chaque toast (4 s) est vérifié dès la réponse qui le déclenche : le serveur de développement,
  // à un seul processus, peut mettre plusieurs secondes à envoyer l'invitation.
  const created = await creation;

  expect(created.ok()).toBe(true);
  expect(created.request().postDataJSON()).toMatchObject({
    name,
    city: 'Korhogo',
    agreement_status: 'pending',
  });
  await expect(page.getByText('CGA enregistré')).toBeVisible();

  const invited = await invitation;

  expect(invited.ok()).toBe(true);
  expect(invited.request().postDataJSON()).toEqual({
    first_name: 'Gérant',
    last_name: `Parcours ${stamp}`,
    phone: `07${stamp}`,
  });
  await expect(page.getByText('Invitation envoyée au gérant')).toBeVisible();
  await expect(page).toHaveURL(/\/cncga\/membres\/[0-9a-z]{26}$/);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(page.getByText(/Agrément en cours : ce CGA ne peut pas inscrire/)).toBeVisible();

  await page.getByRole('tab', { name: 'Utilisateurs' }).click();
  await expect(page.getByText(`Gérant Parcours ${stamp}`)).toBeVisible();

  // F-ORG-06 : suspension motivée par la Présidente, puis réactivation, tracées dans l'historique.
  await page.getByRole('button', { name: 'Suspendre' }).click();

  const suspension = page.getByRole('dialog', { name: 'Suspendre le CGA' });

  await suspension.getByRole('textbox', { name: 'Motif' }).fill('Parcours de recette');
  await suspension.getByRole('checkbox', { name: `Je confirme la suspension de ${name}` }).check();
  await suspension.getByRole('button', { name: 'Confirmer la suspension' }).click();
  await expect(page.getByText(/Motif : Parcours de recette/)).toBeVisible();

  await page.getByRole('button', { name: 'Réactiver' }).click();

  const reactivation = page.getByRole('dialog', { name: 'Réactiver le CGA' });

  await reactivation.getByRole('textbox', { name: 'Motif' }).fill('Fin du parcours');
  await reactivation.getByRole('button', { name: 'Réactiver' }).click();
  await expect(page.getByText('CGA réactivé')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Suspendre' })).toBeVisible();

  await page.getByRole('tab', { name: 'Identité' }).click();
  await expect(page.getByText('Fin du parcours')).toBeVisible();
});
