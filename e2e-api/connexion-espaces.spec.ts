import { expect, test, type Page } from '@playwright/test';
import { apiBaseUrl, apiRootUrl } from './api-env';

/*
 * Connexion, choix d'espace et menus sur l'API réelle (backend de la plateforme), à l'adresse
 * `VITE_API_BASE_URL` de `.env` (F-AUTH-01, F-AUTH-04, RG-ROLE-07, 03-APPFLOW §1-3, 02-TRD §6.1).
 * Comptes du `DemoSeeder` (`SEED_DEMO=true`), mot de passe `Demo-Cga-2026`. Chaque compte ne se
 * connecte qu'une fois par passage : l'API limite les essais de connexion.
 */
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'Demo-Cga-2026';

async function signIn(page: Page, phone: string, password = PASSWORD) {
  await page.getByLabel(/Téléphone ou e-mail/).fill(phone);
  await page.getByLabel(/^Mot de passe/).fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

async function openUserMenu(page: Page, firstName: string) {
  await page.getByRole('banner').getByRole('button', { name: firstName }).click();
}

function menu(page: Page) {
  return page.getByRole('navigation', { name: 'Menu principal' }).getByRole('link');
}

test('le gérant d’un seul CGA se connecte, voit le menu de ses droits, garde sa session au rechargement, puis se déconnecte', async ({
  page,
  context,
}) => {
  await page.goto('/connexion');

  const login = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url() === `${apiBaseUrl}/auth/login`,
  );
  const csrf = page.waitForRequest(`${apiRootUrl}/sanctum/csrf-cookie`);
  await signIn(page, '0700000002');
  await csrf;
  expect((await login).postDataJSON()).toEqual({ identifier: '0700000002', password: PASSWORD });

  // 03-APPFLOW §1 : un seul espace, tableau de bord directement.
  await expect(page).toHaveURL(/\/cga\/tableau-de-bord$/);
  await expect(page.getByRole('banner')).toContainText('DC-KNOWING CGA · Gérant');

  // RG-ROLE-07 : le menu suit les droits effectifs de /me ; le gérant a tout, sauf la bancabilité
  // tant que le module n'est pas activé.
  await expect(menu(page)).toHaveText([
    'Tableau de bord',
    'Adhérents',
    'Échéances',
    'Clôture annuelle',
    'Rapport trimestriel',
    'Factures',
    'Préoccupations',
    'Formations',
    'Communications',
    'Cotisation CNCGA',
    'Gestion interne',
    'Statistiques',
    'Paramètres',
  ]);

  // 02-TRD §6.1, §6.7 : session dans un cookie HttpOnly, aucun jeton dans le navigateur.
  const cookies = await context.cookies(apiRootUrl);
  expect(cookies.some((cookie) => cookie.httpOnly && cookie.name !== 'XSRF-TOKEN')).toBe(true);
  expect(cookies.find((cookie) => cookie.name === 'XSRF-TOKEN')?.httpOnly).toBe(false);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);

  await page.reload();
  await expect(page).toHaveURL(/\/cga\/tableau-de-bord$/);
  await expect(page.getByRole('banner')).toContainText('DC-KNOWING CGA · Gérant');

  await openUserMenu(page, 'Koffi');
  await page.getByRole('menuitem', { name: 'Déconnexion' }).click();
  await expect(page).toHaveURL(/\/connexion$/);

  // Session fermée côté serveur : l'espace n'est plus accessible.
  await page.goto('/cga/tableau-de-bord');
  await expect(page).toHaveURL(/\/connexion\?retour=%2Fcga%2Ftableau-de-bord$/);
});

test('F-AUTH-01 · des identifiants refusés affichent « Identifiants incorrects » sous le formulaire', async ({
  page,
}) => {
  // Numéro inconnu, différent à chaque passage : la limitation des essais ne bloque aucun compte.
  const unknownPhone = `0799${String(Date.now()).slice(-6)}`;
  await page.goto('/connexion');

  await signIn(page, unknownPhone, 'mauvais-mot-de-passe');

  await expect(page.getByRole('alert')).toContainText('Identifiants incorrects');
  await expect(page).toHaveURL(/\/connexion$/);
  await expect(page.getByLabel(/Téléphone ou e-mail/)).toHaveValue(unknownPhone);
});

test('F-AUTH-01 · un compte désactivé reçoit « Votre accès n’est pas actif »', async ({ page }) => {
  await page.goto('/connexion');

  await signIn(page, '0700000005');

  await expect(page.getByRole('alert')).toContainText(
    'Votre accès n’est pas actif. Contactez votre CGA.',
  );
  await expect(page).toHaveURL(/\/connexion$/);
});

test('RG-ROLE-07 · la Présidente voit tout le menu CNCGA', async ({ page }) => {
  await page.goto('/connexion');
  await signIn(page, '0700000001');

  await expect(page).toHaveURL(/\/cncga\/tableau-de-bord$/);
  await expect(page.getByRole('banner')).toContainText('Président(e)');
  await expect(menu(page)).toHaveText([
    'Tableau de bord',
    'Membres (CGA)',
    'Cotisations',
    'Rapports trimestriels',
    'Préoccupations',
    'Formations & séminaires',
    'Communications',
    'Statistiques',
    'Paramètres',
  ]);
});

test('03-APPFLOW §4.1 · le formateur ne voit que Tableau de bord, Adhérents et Formations', async ({
  page,
}) => {
  await page.goto('/connexion');
  await signIn(page, '0700000007');

  await expect(page).toHaveURL(/\/cga\/tableau-de-bord$/);
  await expect(menu(page)).toHaveText(['Tableau de bord', 'Adhérents', 'Formations']);
});

test('F-AUTH-04 · l’utilisateur multi-rôles choisit son espace, le menu suit ses droits, puis il change d’espace', async ({
  page,
}) => {
  await page.goto('/connexion');
  await signIn(page, '0700000003');

  // 03-APPFLOW §1 : plusieurs espaces, le sélecteur d'abord, sans espace ouvert d'office.
  await expect(page).toHaveURL(/\/choisir-espace$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Choisir un espace' })).toBeVisible();
  const cards = page.getByRole('main').getByRole('button');
  await expect(cards).toHaveCount(3);
  await expect(cards.filter({ hasText: 'DC-KNOWING CGA' })).toContainText('Expert-comptable');
  await expect(cards.filter({ hasText: 'CGA Démo Bouaké' })).toContainText('Comptable');

  // RG-ACC-02 : le choix est enregistré côté serveur, sans nouvelle connexion.
  const space = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url() === `${apiBaseUrl}/me/space`,
  );
  await cards.filter({ hasText: 'DC-KNOWING CGA' }).click();
  expect((await space).status()).toBe(200);

  await expect(page).toHaveURL(/\/cga\/tableau-de-bord$/);
  await expect(page.getByRole('banner')).toContainText('DC-KNOWING CGA · Expert-comptable');
  // L'expert-comptable a la fiche du centre en lecture : « Paramètres » est dans son menu.
  await expect(menu(page).filter({ hasText: 'Paramètres' })).toHaveCount(1);

  // L'espace choisi vit dans la session du serveur : il reste ouvert au rechargement.
  await page.reload();
  await expect(page.getByRole('banner')).toContainText('DC-KNOWING CGA · Expert-comptable');

  await openUserMenu(page, 'Yao');
  await page.getByRole('menuitem', { name: 'Changer d’espace' }).click();
  await expect(
    page.getByRole('main').getByRole('button').filter({ hasText: 'DC-KNOWING CGA' }),
  ).toContainText('Espace ouvert');

  await page.getByRole('main').getByRole('button').filter({ hasText: 'CGA Démo Bouaké' }).click();
  await expect(page.getByRole('banner')).toContainText('CGA Démo Bouaké · Comptable');
  // Le comptable n'a ni la fiche du centre ni la gestion interne (03-APPFLOW §4.1).
  await expect(menu(page).filter({ hasText: 'Paramètres' })).toHaveCount(0);
  await expect(menu(page).filter({ hasText: 'Gestion interne' })).toHaveCount(0);

  await openUserMenu(page, 'Yao');
  await page.getByRole('menuitem', { name: 'Déconnexion' }).click();
  await expect(page).toHaveURL(/\/connexion$/);
});
