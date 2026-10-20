import { expect, test, type Page } from '@playwright/test';
import type { ProjectDocument } from '../src/types';
import { chooseSample, reopenRecentProject } from './startup';

async function readDocument(page: Page): Promise<ProjectDocument> {
  return page.evaluate(async () => {
    const id = localStorage.getItem('planner.activeProject');
    if (!id) throw new Error('No active project');
    return new Promise<ProjectDocument>((resolve, reject) => {
      const request = indexedDB.open('villamos-tervezo-local');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const get = db.transaction('projects', 'readonly').objectStore('projects').get(id);
        get.onerror = () => {
          db.close();
          reject(get.error);
        };
        get.onsuccess = () => {
          db.close();
          if (!get.result?.document) reject(new Error('No saved document'));
          else resolve(get.result.document);
        };
      };
    });
  });
}

async function openWiring(page: Page) {
  await page.locator('.view-tabs').getByRole('button', { name: 'Elosztó', exact: true }).click();
}

test('reuses a source for diagram and form connections, keeps safeguards and saves the resulting wires', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await chooseSample(page);
  await openWiring(page);
  const original = await readDocument(page);
  const endpoint = (code: string, side = 'top') => ({
    kind: 'device',
    deviceId: original.data.devices.find((device) => device.code === code)!.id,
    side,
    pole: 0
  });
  const source = endpoint('Q1', 'bottom');
  const sourceValue = JSON.stringify(source);
  const from = page.getByLabel('Vezeték kezdőpontja', { exact: true });
  const to = page.getByLabel('Vezeték végpontja', { exact: true });
  const create = page.getByRole('button', { name: 'Vezeték létrehozása', exact: true });
  const mode = page.getByRole('button', { name: 'Folyamatos bekötés', exact: true });
  await expect(mode).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('button', { name: 'Q1 · alsó 1 (L)', exact: true }).click();
  await page.getByRole('button', { name: 'QF1 · felső 1 (L)', exact: true }).click();
  await mode.click();
  await expect(mode).toHaveAttribute('aria-pressed', 'true');
  await expect(from).toHaveValue(sourceValue);
  await expect(to).toHaveValue(JSON.stringify(endpoint('QF1')));
  await create.click();
  await expect(from).toHaveValue(sourceValue);
  await expect(to).toHaveValue('');
  await expect(create).toBeDisabled();

  // A further diagram click replaces only the destination while the source is retained.
  await page.getByRole('button', { name: 'QF2 · felső 1 (L)', exact: true }).click();
  await page.getByRole('button', { name: 'QF3 · felső 1 (L)', exact: true }).click();
  await expect(from).toHaveValue(sourceValue);
  await expect(to).toHaveValue(JSON.stringify(endpoint('QF3')));
  await create.click();
  await to.selectOption(JSON.stringify(endpoint('QF2')));
  await create.click();
  await expect.poll(async () => (await readDocument(page)).data.boards[0].wiring?.wires.length).toBe(3);

  await to.selectOption(JSON.stringify(endpoint('QF1')));
  await create.click();
  await expect(page.getByRole('alert')).toHaveText('Ez a vezeték már szerepel a tervben.');
  await to.selectOption(sourceValue);
  await create.click();
  await expect(page.getByRole('alert')).toHaveText('Két különböző csatlakozópontot válassz.');
  expect((await readDocument(page)).data.boards[0].wiring!.wires).toHaveLength(3);

  await page.getByRole('button', { name: 'Kijelölés törlése', exact: true }).click();
  await expect(from).toHaveValue('');
  await expect(to).toHaveValue('');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await from.selectOption(sourceValue);
  await to.selectOption(JSON.stringify(endpoint('QF1', 'bottom')));
  await mode.click();
  await expect(mode).toHaveAttribute('aria-pressed', 'false');
  await expect(from).toHaveValue(sourceValue);
  await expect(to).toHaveValue(JSON.stringify(endpoint('QF1', 'bottom')));
  await create.click();
  await expect(from).toHaveValue('');
  await expect(to).toHaveValue('');
  await expect.poll(async () => (await readDocument(page)).data.boards[0].wiring?.wires.length).toBe(4);
  const expectedWires = (await readDocument(page)).data.boards[0].wiring!.wires;
  expect(expectedWires.every((wire) => JSON.stringify(wire.from) === sourceValue)).toBe(true);

  await page.reload();
  await reopenRecentProject(page);
  await openWiring(page);
  expect((await readDocument(page)).data.boards[0].wiring!.wires).toEqual(expectedWires);
  await expect(mode).toHaveAttribute('aria-pressed', 'false');
  await expect(from).toHaveValue('');
  expect(errors).toEqual([]);
});
