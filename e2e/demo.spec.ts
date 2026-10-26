import { expect, test } from '@playwright/test';

// Étape 0.4 : la page de démonstration (désormais sur /demo) s'affiche avec la police de la charte, sur ordinateur et sur mobile.
test('la page de démonstration affiche les composants de base', async ({ page, isMobile }) => {
  await page.goto('/demo');

  await expect(page.getByRole('heading', { level: 1, name: 'Composants de base' })).toBeVisible();
  // Attendre le chargement des polices : sous charge, la vérification arrivait avant la police.
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('16px Archivo'))).toBe(true);

  // Tableau sur ordinateur, liste de cartes sur mobile.
  const table = page.getByRole('table', { name: 'Tableau des adhérents' });
  const cards = page.getByRole('list', { name: 'Tableau des adhérents' });
  await expect(isMobile ? cards : table).toBeVisible();
  await expect(isMobile ? table : cards).toBeHidden();

  await page.getByRole('button', { name: 'Suivant' }).click();
  await expect(page.getByText('11–20 sur 28')).toBeVisible();
});

test('les boutons offrent une cible tactile de 44 px sur mobile', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Règle propre au mobile (04-UX-UI §4).');
  await page.goto('/demo');

  const box = await page.getByRole('button', { name: 'Exporter' }).boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
});
