import { expect, test } from '@playwright/test';

test('ignores a pending Drive file listing after disconnecting the account', async ({ page }) => {
  // Hold the service response so the account can be disconnected before it arrives.
  await page.route('**/src/services/drive.ts*', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
      let connected = true;
      window.pendingDriveLists = [];
      export const isDriveConfigured = () => true;
      export const isDriveConnected = () => connected;
      export const connectDrive = async () => { connected = true; };
      export const disconnectDrive = () => { connected = false; };
      export const listDriveProjects = () => new Promise(resolve => window.pendingDriveLists.push(() => resolve([
        { id: 'remote-project', name: 'Pending remote project.vgecko', modifiedTime: '2026-10-18T12:00:00Z' }
      ])));
      export const openFromDrive = async () => { throw new Error('Unexpected open'); };
      export const pickDriveProject = async () => { throw new Error('Unexpected picker'); };
      export const saveToDrive = async () => { throw new Error('Unexpected save'); };
    `
    })
  );
  await page.goto('/');
  await page.getByRole('button', { name: /^Projekt megnyitása / }).click();
  await page.getByRole('button', { name: 'Google Drive', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Leválasztás', exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { pendingDriveLists: unknown[] }).pendingDriveLists.length))
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Leválasztás', exact: true }).click();
  await page.evaluate(() =>
    (window as unknown as { pendingDriveLists: (() => void)[] }).pendingDriveLists.forEach((resolve) => resolve())
  );
  await expect(page.getByRole('button', { name: 'Google Drive csatlakoztatása', exact: true })).toBeVisible();
  await expect(page.locator('.drive-file-list button')).toHaveCount(0);
});
