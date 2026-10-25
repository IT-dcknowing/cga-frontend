import { expect, test } from '@playwright/test';

/*
 * Parcours de connexion (F-AUTH-01, 03-APPFLOW §2). Le serveur des parcours démarre avec le
 * bouchon (`VITE_API_STUB=true`, playwright.config.ts) : aucun appel réseau réel.
 */
test('la racine ouvre la page de connexion aux couleurs de la charte', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/connexion$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Connexion' })).toBeVisible();
  await expect(page.getByText('République de Côte d’Ivoire · Dispositif CGA')).toBeVisible();
  await expect(page.getByLabel(/Téléphone ou e-mail/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Mot de passe oublié' })).toBeVisible();
});

test('un mot de passe refusé affiche « Identifiants incorrects » sous le formulaire', async ({
  page,
}) => {
  await page.goto('/connexion');

  await page.getByLabel(/Téléphone ou e-mail/).fill('gerant@dc-knowing.ci');
  await page.getByLabel(/^Mot de passe/).fill('mauvais');
  await page.getByRole('button', { name: 'Se connecter' }).click();

  await expect(page.getByRole('alert')).toContainText('Identifiants incorrects');
  await expect(page.getByLabel(/Téléphone ou e-mail/)).toHaveValue('gerant@dc-knowing.ci');
});

test('le gérant d’un seul CGA rejoint le tableau de bord de son centre', async ({ page }) => {
  await page.goto('/connexion');

  await page.getByLabel(/Téléphone ou e-mail/).fill('gerant@dc-knowing.ci');
  await page.getByLabel(/^Mot de passe/).fill('demo1234');
  await page.getByRole('button', { name: 'Se connecter' }).click();

  await expect(page).toHaveURL(/\/cga\/tableau-de-bord$/);
});
