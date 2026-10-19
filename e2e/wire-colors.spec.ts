import { expect, test, type Page } from '@playwright/test';
import { encodeProject } from '../src/data/archive';
import { createProject } from '../src/data/project';
import type { ProjectDocument } from '../src/types';
import { reopenRecentProject } from './startup';

async function readDocument(page: Page): Promise<ProjectDocument> {
  return page.evaluate(async () => {
    const id = localStorage.getItem('planner.activeProject');
    if (!id) throw new Error('No active project');
    return new Promise<ProjectDocument>((resolve, reject) => {
      const request = indexedDB.open('villamos-tervezo-local');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, get = db.transaction('projects', 'readonly').objectStore('projects').get(id);
        get.onerror = () => { db.close(); reject(get.error); };
        get.onsuccess = () => { db.close(); resolve(get.result.document); };
      };
    });
  });
}

test('keeps stored solid colours and persists an explicit two-tone PE wire with accessible presets', async ({ page }) => {
  const doc = createProject('Wire colour palette');
  doc.data.boards[0].wiring = {
    buses: [{ id: 'earth-bus', name: 'PE bus', conductor: 'PE', capacity: 6, position: 'bottom', terminalLabels: [] }],
    infeeds: [{ id: 'earth-source', name: 'Earth electrode', kind: 'earth', poles: ['PE'] }],
    wires: [
      { id: 'old-green', label: 'Legacy green', color: '#70a029', from: { kind: 'infeed', infeedId: 'earth-source', pole: 0 }, to: { kind: 'bus', busId: 'earth-bus', terminal: 0 } },
      { id: 'custom', label: 'Custom hex', color: '#12ABef', from: { kind: 'infeed', infeedId: 'earth-source', pole: 0 }, to: { kind: 'bus', busId: 'earth-bus', terminal: 1 } }
    ]
  };
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('planner.language', 'en'));
  await page.goto('/');
  await page.locator('.start-actions').getByRole('button', { name: /^Open project/ }).click();
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose project file', exact: true }).click();
  await (await choosing).setFiles({ name: 'wire-colours.vgecko', mimeType: 'application/zip', buffer: Buffer.from(await (await encodeProject(doc)).arrayBuffer()) });
  await page.locator('.view-tabs').getByRole('button', { name: 'Distribution board', exact: true }).click();
  await page.getByRole('button', { name: /Detailed wiring/ }).click();

  await page.locator('.wiring-wire-list').getByRole('button', { name: 'Legacy green', exact: true }).click();
  await expect(page.getByLabel('Custom wire colour', { exact: true })).toHaveValue('#70a029');
  await expect(page.locator('.wiring-wire.selected .wiring-wire-line')).toHaveCount(1);
  await expect(page.locator('.wiring-wire.selected .wiring-wire-line')).toHaveAttribute('stroke', '#70a029');
  await expect(page.locator('.wiring-wire-list button').filter({ hasText: 'Legacy green' }).locator('i')).toHaveCSS('background-image', 'none');

  await page.getByLabel('Wire start terminal', { exact: true }).selectOption(JSON.stringify({ kind: 'infeed', infeedId: 'earth-source', pole: 0 }));
  await page.getByLabel('Wire end terminal', { exact: true }).selectOption(JSON.stringify({ kind: 'bus', busId: 'earth-bus', terminal: 2 }));
  await page.getByRole('button', { name: 'Create wire', exact: true }).click();
  await page.getByLabel('Wire label', { exact: true }).fill('New PE link');
  await expect.poll(async () => (await readDocument(page)).data.boards[0].wiring!.wires.at(-1)?.colorPattern).toBe('green-yellow');
  await expect(page.locator('.wiring-wire.selected .wiring-wire-line')).toHaveCount(2);
  await expect(page.locator('.wiring-wire.selected .wiring-wire-stripe')).toHaveAttribute('stroke', '#f2cf1d');
  await expect(page.locator('.wiring-wire.selected .wiring-wire-stripe')).toHaveAttribute('stroke-dasharray', '7 7');
  await expect(page.locator('.wiring-wire-list button').filter({ hasText: 'New PE link' }).locator('i')).toHaveCSS('background-image', /repeating-linear-gradient/);
  for (const color of ['Brown', 'Black', 'Grey', 'Blue', 'Green-yellow']) {
    await expect(page.getByRole('button', { name: `Wire colour: ${color}`, exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Wire colour: Blue', exact: true }).click();
  await expect(page.locator('.wiring-wire.selected .wiring-wire-line')).toHaveCount(1);
  await expect.poll(async () => (await readDocument(page)).data.boards[0].wiring!.wires.at(-1)?.colorPattern).toBeUndefined();
  await page.getByLabel('Custom wire colour', { exact: true }).evaluate((input: HTMLInputElement) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '#c145aa');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect.poll(async () => (await readDocument(page)).data.boards[0].wiring!.wires.at(-1)?.color).toBe('#c145aa');
  await expect(page.locator('.wiring-wire.selected .wiring-wire-line')).toHaveAttribute('stroke', '#c145aa');
  const twoTone = page.getByRole('button', { name: 'Wire colour: Green-yellow', exact: true });
  await twoTone.focus();
  await page.keyboard.press('Space');
  await expect(twoTone).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await readDocument(page)).data.boards[0].wiring!.wires.at(-1)?.colorPattern).toBe('green-yellow');

  await page.reload();
  await reopenRecentProject(page);
  await page.locator('.view-tabs').getByRole('button', { name: 'Distribution board', exact: true }).click();
  await page.getByRole('button', { name: /Detailed wiring/ }).click();
  await page.locator('.wiring-wire-list').getByRole('button', { name: 'New PE link', exact: true }).click();
  await expect(page.locator('.wiring-wire.selected .wiring-wire-stripe')).toHaveAttribute('stroke', '#f2cf1d');
  const saved = (await readDocument(page)).data.boards[0].wiring!.wires;
  expect(saved[0]).toMatchObject({ color: '#70a029' });
  expect(saved[0].colorPattern).toBeUndefined();
  expect(saved[1]).toMatchObject({ color: '#12ABef' });
  expect(saved[1].colorPattern).toBeUndefined();
  expect(saved[2]).toMatchObject({ color: '#2f9e44', colorPattern: 'green-yellow' });
  expect(errors).toEqual([]);
});
