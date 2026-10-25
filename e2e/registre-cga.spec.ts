import { expect, test, type Page } from '@playwright/test';

/*
 * Parcours P1 jusqu'à l'invitation du gérant (étape 1.5, 03-APPFLOW §8) et suspension d'un CGA
 * (F-ORG-06), sur le bouchon `VITE_API_STUB` : registre de démonstration en mémoire, aucun réseau.
 */
const PASSWORD = 'demo1234';

async function openRegistry(page: Page, isMobile: boolean) {
  await page.goto('/connexion');
  await page.getByLabel(/Téléphone ou e-mail/).fill('presidente@cncga.ci');
  await page.getByLabel(/^Mot de passe/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.getByRole('button', { name: /CNCGA/ }).click();
  await expect(page).toHaveURL(/\/cncga\/tableau-de-bord$/);

  if (isMobile) {
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  }

  const menu = isMobile
    ? page.getByRole('dialog', { name: 'Menu principal' })
    : page.getByRole('navigation', { name: 'Menu principal' });

  await menu.getByRole('link', { name: 'Membres (CGA)' }).click();
  await expect(page).toHaveURL(/\/cncga\/membres$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Membres (CGA)' })).toBeVisible();
}

/** Ligne du tableau sur ordinateur, carte de la liste sur mobile (04-UX-UI §5.2). */
function registryEntry(page: Page, isMobile: boolean, name: string) {
  return isMobile
    ? page.getByRole('list', { name: 'Registre des CGA du réseau' }).getByRole('listitem').filter({
        hasText: name,
      })
    : page.getByRole('row', { name: new RegExp(name) });
}

test('P1 · la Présidente enregistre un CGA et invite son gérant', async ({ page, isMobile }) => {
  await openRegistry(page, isMobile);
  await expect(registryEntry(page, isMobile, 'DC-KNOWING CGA')).toBeVisible();

  await page.getByRole('button', { name: 'Enregistrer un CGA' }).first().click();

  const dialog = page.getByRole('dialog', { name: 'Nouveau CGA' });

  await dialog.getByRole('textbox', { name: 'Dénomination', exact: true }).fill('CGA du Nord');
  await dialog.getByRole('textbox', { name: 'Ville', exact: true }).fill('Korhogo');
  await dialog.getByRole('textbox', { name: 'Téléphone', exact: true }).fill('0700000020');
  await dialog.getByRole('checkbox', { name: 'Ouvrir l’accès maintenant' }).check();
  await dialog.getByRole('textbox', { name: 'Prénom du gérant' }).fill('Awa');
  await dialog.getByRole('textbox', { name: 'Nom du gérant', exact: true }).fill('Koné');
  await dialog.getByRole('textbox', { name: 'Téléphone du gérant' }).fill('0700000030');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();

  await expect(page.getByText('CGA enregistré')).toBeVisible();
  await expect(page.getByText('Invitation envoyée au gérant')).toBeVisible();
  await expect(page).toHaveURL(/\/cncga\/membres\/[0-9a-z]{26}$/);
  await expect(page.getByRole('heading', { level: 1, name: 'CGA du Nord' })).toBeVisible();
  // RG-ORG-03 : sans agrément, le CGA est créé « en cours » et ne peut pas inscrire d'adhérents.
  await expect(page.getByText(/Agrément en cours : ce CGA ne peut pas inscrire/)).toBeVisible();

  // Le gérant invité apparaît dans l'onglet Utilisateurs.
  await page.getByRole('tab', { name: 'Utilisateurs' }).click();
  await expect(page.getByText('Awa Koné')).toBeVisible();
  await expect(page.getByText('Invité', { exact: true })).toBeVisible();
});

test('F-ORG-06 · la Présidente suspend un CGA avec motif, puis le réactive', async ({
  page,
  isMobile,
}) => {
  await openRegistry(page, isMobile);
  await registryEntry(page, isMobile, 'DC-KNOWING CGA').click();
  await expect(page.getByRole('heading', { level: 1, name: 'DC-KNOWING CGA' })).toBeVisible();

  await page.getByRole('button', { name: 'Suspendre' }).click();

  const suspension = page.getByRole('dialog', { name: 'Suspendre le CGA' });

  await expect(suspension.getByText('Ses agents ne pourront plus que consulter.')).toBeVisible();
  await suspension.getByRole('textbox', { name: 'Motif' }).fill('Rapports non transmis');
  await suspension
    .getByRole('checkbox', { name: 'Je confirme la suspension de DC-KNOWING CGA' })
    .check();
  await suspension.getByRole('button', { name: 'Confirmer la suspension' }).click();

  await expect(page.getByText('CGA suspendu', { exact: true })).toBeVisible();
  await expect(page.getByText(/Motif : Rapports non transmis/)).toBeVisible();

  await page.getByRole('button', { name: 'Réactiver' }).click();

  const reactivation = page.getByRole('dialog', { name: 'Réactiver le CGA' });

  await reactivation.getByRole('textbox', { name: 'Motif' }).fill('Rapports reçus');
  await reactivation.getByRole('button', { name: 'Réactiver' }).click();

  await expect(page.getByText('CGA réactivé')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Suspendre' })).toBeVisible();
});
