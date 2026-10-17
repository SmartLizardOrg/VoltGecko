import { expect, type Page } from '@playwright/test';

export async function chooseSample(page: Page) {
  await page.locator('.start-actions').getByRole('button', { name: /^(Mintaprojekt kipróbálása|Try sample project)/ }).click();
  await expect(page.locator('.app-shell')).toBeVisible();
}

export async function reopenRecentProject(page: Page) {
  await page.locator('.start-projects li button').first().click();
  await expect(page.locator('.app-shell')).toBeVisible();
}
