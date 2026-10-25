import { expect, test, type Page } from '@playwright/test';

/*
 * Parcours de l'étape 0.10 (06-IMPLEMENTATION-PLAN) : connexion, choix et changement d'espace,
 * coques, profil, mot de passe oublié, activation, écrans d'erreur (03-APPFLOW §2, §7). Le serveur
 * des parcours démarre avec le bouchon `VITE_API_STUB` : aucun appel réseau réel. Le bouchon vit en
 * mémoire, donc chaque parcours reste dans l'application après la connexion (pas de rechargement).
 */
const PASSWORD = 'demo1234';

async function signIn(page: Page, identifier: string) {
  await page.getByLabel(/Téléphone ou e-mail/).fill(identifier);
  await page.getByLabel(/^Mot de passe/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

test('un utilisateur multi-rôles choisit son espace, en change, puis se déconnecte', async ({
  page,
}) => {
  await page.goto('/connexion');
  await signIn(page, 'presidente@cncga.ci');

  await expect(page).toHaveURL(/\/choisir-espace$/);
  // Présélection du dernier espace utilisé (03-APPFLOW §1).
  await expect(page.getByRole('button', { name: /DC-KNOWING CGA/ })).toBeFocused();
  await expect(page.getByText('5 non lues')).toBeVisible();

  await page.getByRole('button', { name: /CNCGA/ }).click();
  await expect(page).toHaveURL(/\/cncga\/tableau-de-bord$/);
  await expect(page.getByRole('banner')).toContainText('Président(e)');

  await page.getByRole('button', { name: 'Adjoua' }).click();
  await page.getByRole('menuitem', { name: 'Changer d’espace' }).click();
  await page.getByRole('button', { name: /DC-KNOWING CGA/ }).click();
  await expect(page).toHaveURL(/\/cga\/tableau-de-bord$/);
  await expect(page.getByRole('banner')).toContainText('Expert-comptable');

  await page.getByRole('button', { name: 'Adjoua' }).click();
  await page.getByRole('menuitem', { name: 'Déconnexion' }).click();
  await expect(page).toHaveURL(/\/connexion$/);
  await expect(page.getByText('Votre session a expiré')).toBeHidden();
});

test('le menu suit les droits : la secrétaire n’a pas accès aux paramètres', async ({
  page,
  isMobile,
}) => {
  // Page demandée sans session : connexion, puis retour sur la page (03-APPFLOW §7).
  await page.goto('/cga/parametres');
  await expect(page).toHaveURL(/\/connexion\?retour=%2Fcga%2Fparametres$/);
  await expect(page.getByText('Votre session a expiré')).toBeVisible();

  await signIn(page, 'secretaire@dc-knowing.ci');

  await expect(page).toHaveURL(/\/cga\/parametres$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Vous n’avez pas accès à cette page' }),
  ).toBeVisible();

  if (isMobile) {
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  }

  const menu = isMobile
    ? page.getByRole('dialog', { name: 'Menu principal' })
    : page.getByRole('navigation', { name: 'Menu principal' });

  await expect(menu.getByRole('link', { name: 'Adhérents' })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Paramètres' })).toHaveCount(0);

  await menu.getByRole('link', { name: 'Adhérents' }).click();
  await expect(page).toHaveURL(/\/cga\/adherents$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Adhérents' })).toBeVisible();
});

test('l’adhérent navigue par la barre basse sur mobile, par le menu latéral sur ordinateur', async ({
  page,
  isMobile,
}) => {
  await page.goto('/connexion');
  await signIn(page, 'adherent@inc.ci');
  await expect(page).toHaveURL(/\/adherent\/accueil$/);

  const bottomBar = page.getByRole('navigation', { name: 'Navigation' });

  if (!isMobile) {
    await expect(bottomBar).toBeHidden();
    await page
      .getByRole('navigation', { name: 'Menu principal' })
      .getByRole('link', { name: 'Documents' })
      .click();
    await expect(page).toHaveURL(/\/adherent\/documents$/);

    return;
  }

  await expect(bottomBar).toBeVisible();
  await bottomBar.getByRole('link', { name: 'Obligations' }).click();
  await expect(page).toHaveURL(/\/adherent\/obligations$/);

  await bottomBar.getByRole('button', { name: 'Plus' }).click();
  const sheet = page.getByRole('dialog', { name: 'Plus' });
  await expect(sheet.getByRole('link', { name: 'Formations' })).toBeVisible();
  await sheet.getByRole('link', { name: 'Mon profil' }).click();

  await expect(page).toHaveURL(/\/profil$/);
  await expect(page.getByRole('heading', { name: 'Préférences SMS / WhatsApp' })).toBeVisible();
});

test('le profil modifie le nom et l’en-tête suit', async ({ page }) => {
  await page.goto('/connexion');
  await signIn(page, 'gerant@dc-knowing.ci');
  await expect(page).toHaveURL(/\/cga\/tableau-de-bord$/);

  await page.getByRole('button', { name: 'Koffi' }).click();
  await page.getByRole('menuitem', { name: 'Mon profil' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Mon profil' })).toBeVisible();

  await page.getByLabel(/^Prénom/).fill('Kouadio');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();

  await expect(page.getByText('Profil enregistré')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Kouadio' })).toBeVisible();
});

test('mot de passe oublié : code à 6 chiffres puis retour à la connexion', async ({ page }) => {
  await page.goto('/connexion');
  await page.getByRole('link', { name: 'Mot de passe oublié' }).click();

  await page.getByLabel(/Téléphone ou e-mail/).fill('+2250700000001');
  await page.getByRole('button', { name: 'Recevoir un code' }).click();
  await expect(page.getByText('Si ce compte existe, un code a été envoyé')).toBeVisible();

  await page.getByLabel(/Code à 6 chiffres/).fill('000000');
  await page.getByLabel(/^Nouveau mot de passe/).fill('nouveau-mot');
  await page.getByLabel(/Confirmer le mot de passe/).fill('nouveau-mot');
  await page.getByRole('button', { name: 'Valider' }).click();
  await expect(page.getByRole('alert')).toContainText('Code incorrect (2 essai(s) restant(s))');

  await page.getByLabel(/Code à 6 chiffres/).fill('123456');
  await page.getByRole('button', { name: 'Valider' }).click();

  await expect(page).toHaveURL(/\/connexion$/);
  await expect(page.getByText('Mot de passe modifié')).toBeVisible();
});

test('activation d’un adhérent invité, avec ses consentements', async ({ page }) => {
  await page.goto('/activer/invitation-adherent');

  await expect(
    page.getByText('Bienvenue Sery, DC-KNOWING CGA vous invite en tant que Accès principal.'),
  ).toBeVisible();
  await page.getByLabel(/^Mot de passe/).fill('nouveau-mot');
  await page.getByLabel(/Confirmer le mot de passe/).fill('nouveau-mot');
  await page.getByLabel('J’accepte les conditions d’utilisation').check();
  await page.getByLabel('J’accepte de recevoir des SMS d’information').check();
  await page.getByRole('button', { name: 'Activer mon accès' }).click();

  await expect(page).toHaveURL(/\/adherent\/accueil$/);
});

test('un lien d’activation expiré affiche le contact du CGA', async ({ page }) => {
  await page.goto('/activer/lien-expire');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Ce lien n’est plus valide' }),
  ).toBeVisible();
  await expect(page.getByText(/DC-KNOWING CGA · \+225 27 20 00 00 00/)).toBeVisible();
});

test('une adresse inconnue affiche « Élément introuvable »', async ({ page }) => {
  await page.goto('/nulle-part');

  await expect(page.getByRole('heading', { level: 1, name: 'Élément introuvable' })).toBeVisible();
  await page.getByRole('link', { name: 'Retour à la connexion' }).click();
  await expect(page).toHaveURL(/\/connexion$/);
});
