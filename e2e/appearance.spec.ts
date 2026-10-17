import { expect, test } from '@playwright/test';

test('theme follows system initially and explicit appearance choices survive reopening', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByLabel('Téma', { exact: true }).selectOption('light');
  await page.getByLabel('Betűméret', { exact: true }).selectOption('large');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByLabel('Betűméret', { exact: true })).toHaveValue('large');
  await expect(page.locator('html')).toHaveCSS('font-size', '20px');
  await expect(page.locator('.brand-gecko-light')).toBeVisible();
  await expect(page.locator('.brand-gecko-dark')).toBeHidden();
  await page.getByLabel('Téma', { exact: true }).selectOption('dark');
  await expect(page.locator('.brand-gecko-dark')).toBeVisible();
  await expect(page.locator('.brand-gecko-light')).toBeHidden();
});

test('large mobile workspace retains canvas, readable controls and reachable appearance settings', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('Téma', { exact: true }).selectOption('dark');
  await page.getByLabel('Betűméret', { exact: true }).selectOption('large');
  await page.getByRole('button', { name: /^Mintaprojekt kipróbálása / }).click();
  await expect(page.locator('.floor-device')).toHaveCount(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect((await page.locator('.floor-workspace').boundingBox())!.height).toBeGreaterThan(200);
  for (const button of await page.locator('.drawing-tools>button, .floor-zoom-tools>button').all()) {
    const box = await button.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole('button', { name: 'Eszköztár megnyitása', exact: true }).click();
  const textSize = page.locator('.sidebar').getByLabel('Betűméret', { exact: true });
  await textSize.scrollIntoViewIfNeeded();
  await expect(textSize).toBeVisible();
  await expect(textSize).toHaveValue('large');
  await textSize.selectOption('standard');
  await expect(page.locator('html')).toHaveCSS('font-size', '16px');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
