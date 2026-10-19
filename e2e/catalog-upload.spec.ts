import { expect, test, type Page } from '@playwright/test';
import { encodeProject } from '../src/data/archive';
import { createProject } from '../src/data/project';
import type { ProjectDocument } from '../src/types';
import { reopenRecentProject } from './startup';

async function readDocument(page: Page): Promise<ProjectDocument> {
  return page.evaluate(async () => {
    const id = localStorage.getItem('planner.activeProject');
    return new Promise<ProjectDocument>((resolve, reject) => {
      const opening = indexedDB.open('villamos-tervezo-local');
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const db = opening.result;
        const reading = db.transaction('projects', 'readonly').objectStore('projects').get(id!);
        reading.onerror = () => { db.close(); reject(reading.error); };
        reading.onsuccess = () => { db.close(); resolve(reading.result.document); };
      };
    });
  });
}

async function openBlankProject(page: Page) {
  const document = createProject('Eszköztár és alaprajz ellenőrzés');
  await page.goto('/');
  await page.locator('.start-actions').getByRole('button', { name: /^Projekt megnyitása/ }).click();
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Projektfájl kiválasztása', exact: true }).click();
  await (await choosing).setFiles({
    name: 'ures.vgecko', mimeType: 'application/zip',
    buffer: Buffer.from(await (await encodeProject(document)).arrayBuffer()),
  });
  await expect(page.locator('.floor-upload-empty')).toBeVisible();
  return document;
}

async function pngFile(page: Page, name = 'alaprajz.png', color = '#e6e6e6') {
  const data = await page.evaluate(color => {
    const canvas = document.createElement('canvas');
    canvas.width = 1000; canvas.height = 700;
    const context = canvas.getContext('2d')!;
    context.fillStyle = color; context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#383838'; context.lineWidth = 5; context.strokeRect(50, 50, 900, 600);
    return canvas.toDataURL('image/png').split(',')[1];
  }, color);
  return { name, mimeType: 'image/png', buffer: Buffer.from(data, 'base64') };
}

async function dropPng(page: Page, name: string, color: string) {
  const file = await pngFile(page, name, color);
  const transfer = await page.evaluateHandle(({ name, type, bytes }) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], name, { type }));
    return transfer;
  }, { name: file.name, type: file.mimeType, bytes: Array.from(file.buffer) });
  await page.locator('.floor-workspace').dispatchEvent('dragenter', { dataTransfer: transfer });
  await expect(page.locator('.floor-drop-hint')).toBeVisible();
  await page.locator('.floor-workspace').dispatchEvent('drop', { dataTransfer: transfer });
  await transfer.dispose();
  await expect(page.locator('.floor-drop-hint')).toHaveCount(0);
}

async function placeAt(page: Page, x: number, y: number) {
  const point = await page.locator('.floor-svg').evaluate((element, position) => {
    const matrix = (element as SVGSVGElement).getScreenCTM()!;
    const screen = new DOMPoint(position.x, position.y).matrixTransform(matrix);
    return { x: screen.x, y: screen.y };
  }, { x, y });
  await page.mouse.click(point.x, point.y);
}

test('uploads from the empty drawing and keeps its sheet identity and background across reloads', async ({ page }) => {
  const original = await openBlankProject(page);
  const choosing = page.waitForEvent('filechooser');
  // Click the drawing outside the central upload button as users can click anywhere on an empty sheet.
  await page.locator('.floor-svg').click({ position: { x: 65, y: 65 } });
  await (await choosing).setFiles(await pngFile(page));
  await expect.poll(async () => (await readDocument(page)).data.sheets[0].backgroundAssetId).toBeTruthy();
  const current = await readDocument(page);
  expect(current.data.sheets).toHaveLength(1);
  expect(current.data.sheets[0].id).toBe(original.data.sheets[0].id);
  expect(current.assets[current.data.sheets[0].backgroundAssetId!].name).toBe('alaprajz.png');
  await expect(page.locator('.floor-upload-empty')).toHaveCount(0);
  await expect(page.locator('.floor-svg > image')).toHaveAttribute('href', /^data:image\/png;base64,/);
  const reopenedPicker = page.waitForEvent('filechooser', { timeout: 600 }).then(() => true, () => false);
  await placeAt(page, 500, 350);
  expect(await reopenedPicker).toBe(false);
  await page.reload(); await reopenRecentProject(page);
  expect((await readDocument(page)).data.sheets).toEqual(current.data.sheets);
  await expect(page.locator('.floor-svg > image')).toHaveAttribute('href', /^data:image\/png;base64,/);
});

test('drops a background into an empty sheet, then adds a new sheet without losing the existing plan', async ({ page }) => {
  const original = await openBlankProject(page);
  await dropPng(page, 'elso-alaprajz.png', '#c8e3db');
  await expect.poll(async () => (await readDocument(page)).data.sheets[0].backgroundAssetId).toBeTruthy();
  await page.locator('.catalog-grid').getByRole('button', { name: 'Dugalj', exact: true }).click();
  await placeAt(page, 300, 300);
  await expect.poll(async () => (await readDocument(page)).data.sheets[0].placements.length).toBe(1);
  const first = await readDocument(page);
  expect(first.data.sheets[0].id).toBe(original.data.sheets[0].id);
  await dropPng(page, 'masodik-alaprajz.png', '#d7cbe6');
  await expect.poll(async () => (await readDocument(page)).data.sheets.length).toBe(2);
  const current = await readDocument(page);
  expect(current.data.sheets[0]).toEqual(first.data.sheets[0]);
  expect(current.assets[first.data.sheets[0].backgroundAssetId!]).toEqual(first.assets[first.data.sheets[0].backgroundAssetId!]);
  expect(current.data.devices).toEqual(first.data.devices);
  expect(current.data.sheets[1].id).not.toBe(first.data.sheets[0].id);
  expect(current.assets[current.data.sheets[1].backgroundAssetId!].name).toBe('masodik-alaprajz.png');
  expect(current.data.sheets[1].placements).toHaveLength(0);
});

test('places distinct switch variants and finds connection devices in a collapsed catalog group', async ({ page }) => {
  await openBlankProject(page);
  const catalog = page.locator('.sidebar-catalog');
  await catalog.getByRole('button', { name: 'Kapcsoló', exact: true }).click();
  await placeAt(page, 350, 350);
  await expect(page.getByTestId('floor-device-symbol')).toHaveCount(1);
  const singlePole = await page.getByTestId('floor-device-symbol').innerHTML();
  await catalog.getByRole('button', { name: 'Váltókapcsoló', exact: true }).click();
  await placeAt(page, 650, 350);
  await expect.poll(async () => (await readDocument(page)).data.devices.length).toBe(2);
  const switches = await readDocument(page);
  expect(switches.data.devices[0].variant).toBeUndefined();
  expect(switches.data.devices[1]).toMatchObject({ code: 'K2', kind: 'switch', variant: 'switch-two-way', name: 'Váltókapcsoló' });
  expect(await page.getByTestId('floor-device-symbol').nth(1).innerHTML()).not.toBe(singlePole);
  await expect(catalog.getByRole('button', { name: /^Csatlakozások/ })).toHaveAttribute('aria-expanded', 'false');
  await expect(catalog.getByRole('button', { name: 'Adatcsatlakozó (RJ45)', exact: true })).not.toBeVisible();
  await page.getByRole('textbox', { name: 'Eszköztár keresése', exact: true }).fill('RJ45');
  await catalog.getByRole('button', { name: 'Adatcsatlakozó (RJ45)', exact: true }).click();
  await placeAt(page, 500, 500);
  await expect.poll(async () => (await readDocument(page)).data.devices.at(-1)?.variant).toBe('custom-data');
  const current = await readDocument(page);
  expect(current.data.devices.at(-1)).toMatchObject({ kind: 'custom', code: 'LAN1', variant: 'custom-data' });
  expect(current.data.sheets[0].placements).toHaveLength(3);
});

test('keeps the mobile catalog heading on separate rows without horizontal overflow', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openBlankProject(page);
  await page.getByRole('button', { name: 'Eszköztár megnyitása', exact: true }).click();
  await expect.poll(async () => (await page.locator('.sidebar').boundingBox())?.x).toBe(0);
  const heading = page.locator('.catalog-heading');
  await expect(heading.getByRole('heading', { name: 'ESZKÖZTÁR', exact: true })).toBeVisible();
  await expect(heading.locator('p')).toHaveText('KATTINTS A HOZZÁADÁSHOZ');
  const title = await heading.locator('h2').boundingBox(), hint = await heading.locator('p').boundingBox();
  expect(title).not.toBeNull(); expect(hint).not.toBeNull();
  expect(hint!.y).toBeGreaterThanOrEqual(title!.y + title!.height - 1);
  expect(await page.locator('.sidebar').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.locator('.catalog-groups').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('catalog-mobile.png'), fullPage: true });
});
