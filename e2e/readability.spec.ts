import { expect, test } from '@playwright/test';
import { chooseSample } from './startup';

test('reflows large text at an effective 200 percent desktop zoom without losing navigation', async ({ page }) => {
  // A 1512×982 desktop at 200% browser zoom has a 756×491 CSS viewport.
  await page.setViewportSize({ width: 756, height: 491 });
  await page.goto('/');
  await page.getByLabel('Betűméret', { exact: true }).selectOption('large');
  await page.getByLabel('Téma', { exact: true }).selectOption('dark');
  await expect(page.locator('html')).toHaveCSS('font-size', '20px');
  await chooseSample(page);
  for (const name of ['Alaprajz', 'Elosztó', 'Egyvonalas', 'Áramkörök']) {
    await page.locator('.view-tabs').getByRole('button', { name, exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(756);
  }
  await page.getByRole('button', { name: 'Kezdőképernyő', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mivel szeretnél kezdeni?', exact: true })).toBeVisible();
  await expect(page.locator('.start-projects li')).toHaveCount(1);
});

test('keeps visible interface text readable in both themes on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Téma', { exact: true }).selectOption(theme);
    const small = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('button, label, select, input, p, small, span')).filter(element => {
      const box = element.getBoundingClientRect();
      return !element.closest('svg') && box.width > 0 && box.height > 0 && box.top < innerHeight && box.bottom > 0 && element.textContent?.trim() && parseFloat(getComputedStyle(element).fontSize) < 14;
    }).map(element => ({ tag: element.tagName, text: element.textContent?.slice(0, 50), size: getComputedStyle(element).fontSize })));
    expect(small).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  }
  await chooseSample(page);
  await expect(page.locator('.floor-workspace')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
