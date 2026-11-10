import { expect, test } from '@playwright/test';

/*
 * Captures d'écrans pour la validation visuelle du design (maquette v4.1).
 * 4 écrans clés : Connexion, Tableau de bord CGA, Mes obligations adhérent, Legal Flow (échéances).
 * Captures sur ordinateur (1280px) et mobile (375px).
 */
const stage = process.env.SNAPSHOT_STAGE || 'before';

test.describe('Captures d’écrans visuelles', () => {
  test('01 - Écran de connexion (ordinateur et 375px)', async ({ page, isMobile }) => {
    if (isMobile) {
      await page.setViewportSize({ width: 375, height: 667 });
    }
    const mode = isMobile ? '375px' : 'desktop';

    await page.goto('/connexion');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `screenshots/${stage}/${mode}-01-connexion.png`,
      fullPage: true,
    });
  });

  test('02 - Tableau de bord CGA (ordinateur et 375px)', async ({ page, isMobile }) => {
    if (isMobile) {
      await page.setViewportSize({ width: 375, height: 667 });
    }
    const mode = isMobile ? '375px' : 'desktop';

    await page.goto('/connexion');
    await page.getByLabel(/Téléphone ou e-mail/).fill('gerant@dc-knowing.ci');
    await page.getByLabel(/^Mot de passe/).fill('demo1234');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page).toHaveURL(/\/cga\/tableau-de-bord/);
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `screenshots/${stage}/${mode}-02-dashboard-cga.png`,
      fullPage: true,
    });
  });

  test('03 - Mes obligations adhérent (ordinateur et 375px)', async ({ page, isMobile }) => {
    if (isMobile) {
      await page.setViewportSize({ width: 375, height: 667 });
    }
    const mode = isMobile ? '375px' : 'desktop';

    await page.goto('/connexion');
    await page.getByLabel(/Téléphone ou e-mail/).fill('adherent@inc.ci');
    await page.getByLabel(/^Mot de passe/).fill('demo1234');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await page.goto('/adherent/obligations');
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `screenshots/${stage}/${mode}-03-obligations-adherent.png`,
      fullPage: true,
    });
  });

  test('04 - Legal Flow CGA (ordinateur et 375px)', async ({ page, isMobile }) => {
    if (isMobile) {
      await page.setViewportSize({ width: 375, height: 667 });
    }
    const mode = isMobile ? '375px' : 'desktop';

    await page.goto('/connexion');
    await page.getByLabel(/Téléphone ou e-mail/).fill('gerant@dc-knowing.ci');
    await page.getByLabel(/^Mot de passe/).fill('demo1234');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await page.goto('/cga/echeances');
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `screenshots/${stage}/${mode}-04-legal-flow.png`,
      fullPage: true,
    });
  });
});

