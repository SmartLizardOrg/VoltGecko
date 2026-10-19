import { expect, test, type Page } from '@playwright/test';
import type { ProjectDocument } from '../src/types';
import { chooseSample, reopenRecentProject } from './startup';

async function readDocument(page: Page): Promise<ProjectDocument> {
  return page.evaluate(async () => {
    const id = localStorage.getItem('planner.activeProject');
    return new Promise<ProjectDocument>((resolve, reject) => {
      const request = indexedDB.open('villamos-tervezo-local');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const get = db.transaction('projects', 'readonly').objectStore('projects').get(id!);
        get.onerror = () => { db.close(); reject(get.error); };
        get.onsuccess = () => { db.close(); resolve(get.result.document); };
      };
    });
  });
}

async function imageFile(page: Page, name = 'csillar.png') {
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 120; canvas.height = 60;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#dd632b'; context.fillRect(0, 0, 60, 60);
    context.fillStyle = '#377bc2'; context.fillRect(60, 0, 60, 60);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  return { name, mimeType: 'image/png', buffer: Buffer.from(data, 'base64') };
}

test('switches all sheets between exactly two views and preserves images, settings and placement editing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await chooseSample(page);
  const original = await readDocument(page);
  const lamp = original.data.devices.find(device => device.code === 'L1')!;
  const floorDevice = page.locator('.floor-device').filter({ has: page.locator('text', { hasText: /^L1$/ }) });
  await floorDevice.click();
  const modes = page.getByRole('group', { name: 'Alaprajzi megjelenítés', exact: true });
  await expect(modes.getByRole('button')).toHaveCount(2);
  await expect(modes.getByRole('button', { name: 'Rajzjelek', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Alaprajzi kép feltöltése', { exact: true }).setInputFiles(await imageFile(page));
  await expect.poll(async () => (await readDocument(page)).data.devices.find(device => device.id === lamp.id)?.planImage?.assetId).toBeTruthy();
  await modes.getByRole('button', { name: 'Valós képek', exact: true }).click();
  await expect(page.getByTestId('floor-device-image')).toHaveCount(1);
  await expect(page.getByTestId('floor-missing-image')).toHaveCount(7);
  await expect(page.getByTestId('floor-device-symbol')).toHaveCount(0);
  await page.getByLabel('Képméret az alaprajzon', { exact: true }).fill('120');
  await page.getByLabel('Kép fedettsége (%)', { exact: true }).fill('65');
  const image = floorDevice.getByTestId('floor-device-image');
  await expect(image).toHaveAttribute('width', '120');
  await expect(image).toHaveAttribute('height', '120');
  await expect(image).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet');
  await expect(image).toHaveAttribute('opacity', '0.65');
  expect((await readDocument(page)).data.sheets).toEqual(original.data.sheets);
  expect((await readDocument(page)).data.devices.find(device => device.id === lamp.id)?.photoIds).toEqual(lamp.photoIds);
  await modes.getByRole('button', { name: 'Rajzjelek', exact: true }).click();
  await expect(page.getByTestId('floor-device-symbol')).toHaveCount(8);
  await expect(page.getByTestId('floor-device-image')).toHaveCount(0);
  await modes.getByRole('button', { name: 'Valós képek', exact: true }).click();
  await expect(image).toHaveAttribute('opacity', '0.65');
  await page.locator('.inspector .rotation-button').click();
  await expect(image.locator('..')).toHaveAttribute('transform', 'rotate(90)');

  const point = await floorDevice.evaluate(element => {
    const matrix = (element as SVGGElement).getScreenCTM()!;
    const center = new DOMPoint(0, 0).matrixTransform(matrix);
    return { x: center.x, y: center.y };
  });
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  await page.mouse.move(point.x + 26, point.y + 18, { steps: 5 }); await page.mouse.up();
  const originalPlacement = original.data.sheets[0].placements.find(placement => placement.deviceId === lamp.id)!;
  await expect.poll(async () => (await readDocument(page)).data.sheets[0].placements.find(placement => placement.deviceId === lamp.id)?.x).toBeGreaterThan(originalPlacement.x);

  await page.getByRole('button', { name: 'Üres tervlap hozzáadása', exact: true }).click({ trial: true });
  page.once('dialog', dialog => dialog.accept('Második lap'));
  await page.getByRole('button', { name: 'Üres tervlap hozzáadása', exact: true }).click();
  await expect(modes.getByRole('button', { name: 'Valós képek', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload(); await reopenRecentProject(page);
  await expect(modes.getByRole('button', { name: 'Valós képek', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const saved = await readDocument(page);
  expect(saved.data.floorPlanDisplay).toBe('images');
  expect(saved.data.devices.find(device => device.id === lamp.id)?.planImage).toMatchObject({ size: 120, opacity: 0.65 });
  expect(saved.data.sheets[0].placements.find(placement => placement.deviceId === lamp.id)?.rotation).toBe(90);
  await page.screenshot({ path: 'tmp/qa/plan-images-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('reuses site photos and removes only their floor-plan mapping on a narrow English screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('planner.language', 'en'));
  await page.goto('/'); await chooseSample(page);
  const floorDevice = page.locator('.floor-device').filter({ has: page.locator('text', { hasText: /^L1$/ }) });
  await floorDevice.click();
  await page.locator('.photo-upload input').setInputFiles(await imageFile(page, 'site-photo.png'));
  const selectPhoto = page.getByRole('button', { name: 'Choose floor-plan image: site-photo.png', exact: true });
  await expect(selectPhoto).toBeVisible(); await selectPhoto.click();
  await expect(selectPhoto).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Close selection', exact: true }).click();
  await page.getByRole('button', { name: 'Real images', exact: true }).click();
  await expect(page.getByTestId('floor-device-image')).toHaveCount(1);
  await floorDevice.click();
  await expect(selectPhoto).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Remove floor-plan image', exact: true }).click();
  await expect(page.getByTestId('floor-device-image')).toHaveCount(0);
  await expect(page.getByTestId('floor-missing-image')).toHaveCount(8);
  const current = await readDocument(page), lamp = current.data.devices.find(device => device.code === 'L1')!;
  expect(lamp.photoIds).toHaveLength(1); expect(lamp.planImage).toBeUndefined();
  expect(current.assets[lamp.photoIds[0]]).toBeDefined();
  await page.getByRole('button', { name: 'Close selection', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Symbols', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Real images', exact: true })).toBeVisible();
  await page.screenshot({ path: 'tmp/qa/plan-images-mobile.png', fullPage: true });
});
