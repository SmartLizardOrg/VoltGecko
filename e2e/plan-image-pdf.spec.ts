import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { getDocument, OPS, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { makeDevice } from '../src/catalog';
import { encodeProject } from '../src/data/archive';
import { createProject } from '../src/data/project';

async function downloadPdf(page: Page, testInfo: TestInfo, professional: boolean, filename: string) {
  await page.getByRole('button', { name: 'Mentés és export', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: professional ? /Részletes szakmai PDF/ : /PDF a megrendelőnek/ }).click();
  const destination = testInfo.outputPath(filename);
  await (await downloading).saveAs(destination);
  await expect(page.locator('.busy-overlay')).toHaveCount(0);
  const loading = getDocument({ data: new Uint8Array(await readFile(destination)), useSystemFonts: true });
  const pdf = await loading.promise;
  try {
    const first = await pdf.getPage(1), content = await first.getTextContent(), operators = await first.getOperatorList();
    const text = content.items.map(item => 'str' in item ? item.str : '').join(' ');
    const images = operators.fnArray.flatMap((operator, index) => operator === OPS.paintImageXObject ? [operators.argsArray[index]] : []);
    let matrix = [1, 0, 0, 1, 0, 0];
    const stack: number[][] = [];
    const frames: { x: number; y: number; width: number; height: number; maxAlpha: number }[] = [];
    operators.fnArray.forEach((operator, index) => {
      const args = operators.argsArray[index];
      if (operator === OPS.save) stack.push([...matrix]);
      if (operator === OPS.restore) matrix = stack.pop() ?? matrix;
      if (operator === OPS.transform) matrix = Util.transform(matrix, args);
      if (operator === OPS.paintImageXObject) {
        const image = first.objs.get(args[0]);
        let maxAlpha = image.kind === 3 ? 0 : 255;
        if (image.kind === 3) for (let pixel = 3; pixel < image.data.length; pixel += 4) maxAlpha = Math.max(maxAlpha, image.data[pixel]);
        frames.push({ x: matrix[4], y: matrix[5], width: Math.hypot(matrix[0], matrix[1]), height: Math.hypot(matrix[2], matrix[3]), maxAlpha });
      }
    });
    // Keep review copies outside Playwright's per-run directory for rendered PDF QA.
    await mkdir('tmp/pdfs', { recursive: true });
    return { text, images, frames, bytes: await readFile(destination), destination };
  } finally { await loading.destroy(); }
}

test('exports both PDF audiences in the selected view with centered, transparent photos and a matching legend', async ({ page }, testInfo) => {
  await page.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }));
  await page.goto('/');
  const assets = await page.evaluate(() => {
    const photo = document.createElement('canvas'); photo.width = 200; photo.height = 100;
    const context = photo.getContext('2d')!;
    context.fillStyle = '#e65629'; context.fillRect(40, 10, 150, 80);
    context.clearRect(60, 25, 25, 50);
    context.fillStyle = '#4c798c'; context.fillRect(105, 25, 65, 50);
    const background = document.createElement('canvas'); background.width = 1000; background.height = 700;
    const back = background.getContext('2d')!;
    back.fillStyle = '#d6e6df'; back.fillRect(0, 0, 1000, 700);
    back.strokeStyle = '#a5b9b0'; back.lineWidth = 3;
    back.strokeRect(40, 40, 920, 620); back.strokeRect(400, 40, 3, 620);
    return { photo: photo.toDataURL('image/png'), background: background.toDataURL('image/png') };
  });
  const doc = createProject('Képes PDF ellenőrzés');
  doc.data.floorPlanDisplay = 'images'; doc.data.boards = [];
  doc.assets.product = { id: 'product', name: 'termekkep.png', mime: 'image/png', data: assets.photo };
  doc.assets.background = { id: 'background', name: 'alaprajz.png', mime: 'image/png', data: assets.background };
  doc.assets.broken = { id: 'broken', name: 'serult-kep.png', mime: 'image/png', data: 'data:image/png;base64,YnJva2Vu' };
  doc.data.devices = ['L1', 'L2', 'D1', 'D2'].map((code, index) => ({ ...makeDevice(index >= 2 ? 'outlet' : 'light', []), id: code, code }));
  doc.data.devices[0].planImage = { assetId: 'product', size: 240, opacity: 0.5 };
  doc.data.devices[1].planImage = { assetId: 'product', size: 240, opacity: 1 };
  doc.data.devices[3].planImage = { assetId: 'broken', size: 80, opacity: 1 };
  Object.assign(doc.data.sheets[0], { width: 1000, height: 700, backgroundAssetId: 'background', placements: [
    { deviceId: 'L1', x: 20, y: 20, rotation: 90 },
    { deviceId: 'L2', x: 980, y: 680, rotation: 45 },
    { deviceId: 'D1', x: 500, y: 350, rotation: 0 },
    { deviceId: 'D2', x: 700, y: 350, rotation: 0 },
  ] });
  await page.locator('.start-actions').getByRole('button', { name: /^Projekt megnyitása/ }).click();
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Projektfájl kiválasztása', exact: true }).click();
  await (await choosing).setFiles({ name: 'kepek.vgecko', mimeType: 'application/zip', buffer: Buffer.from(await (await encodeProject(doc)).arrayBuffer()) });
  await expect(page.getByTestId('floor-device-image')).toHaveCount(2);
  await expect(page.getByTestId('floor-missing-image')).toHaveCount(2);
  await page.getByRole('button', { name: 'Teljes tervlap', exact: true }).click();
  const canvasBounds = await page.locator('.floor-svg').boundingBox();
  if (!canvasBounds) throw new Error('Floor plan is not visible');
  for (const image of await page.getByTestId('floor-device-image').all()) {
    const bounds = await image.boundingBox();
    if (!bounds) throw new Error('Plan image is not visible');
    expect(bounds.x).toBeGreaterThanOrEqual(canvasBounds.x);
    expect(bounds.y).toBeGreaterThanOrEqual(canvasBounds.y);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(canvasBounds.x + canvasBounds.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(canvasBounds.y + canvasBounds.height);
  }

  for (const professional of [false, true]) {
    const result = await downloadPdf(page, testInfo, professional, `images-${professional ? 'professional' : 'client'}.pdf`);
    expect(result.text).toContain('Valós képek');
    expect(result.text).toContain('VALÓS KÉPEK');
    expect(result.text).toContain('Nincs alaprajzi kép hozzárendelve');
    expect(result.text).not.toContain('JELMAGYARÁZAT');
    for (const code of ['L1', 'L2', 'D1', 'D2']) expect(result.text).toContain(code);
    // Background + two photographs + missing and unreadable image markers + the legend entry.
    expect(result.images).toHaveLength(6);
    expect(result.images[1][2] / result.images[1][1]).toBeCloseTo(2, 2); // 2:1 source rotated through 90 degrees.
    expect(result.images[2][2] / result.images[2][1]).toBeCloseTo(1, 2); // 45-degree contained photograph.
    const [background, firstPhoto, secondPhoto] = result.frames;
    expect(firstPhoto.maxAlpha).toBe(128);
    expect(secondPhoto.maxAlpha).toBe(255);
    for (const [photo, worldX, worldY] of [[firstPhoto, 20, 20], [secondPhoto, 980, 680]] as const) {
      expect(photo.x + photo.width / 2).toBeCloseTo(background.x + background.width * worldX / 1000, 3);
      expect(photo.y + photo.height / 2).toBeCloseTo(background.y + background.height * (700 - worldY) / 700, 3);
      // Both maximum-size images extend beyond the sheet; the PDF must keep the full rotated image inside the drawing field.
      const pointsPerMm = 72 / 25.4;
      expect(photo.x).toBeGreaterThan(18 * pointsPerMm);
      expect(photo.x + photo.width).toBeLessThan(402 * pointsPerMm);
      expect(photo.y).toBeGreaterThan(49 * pointsPerMm);
      expect(photo.y + photo.height).toBeLessThan(239 * pointsPerMm);
    }
    expect(result.bytes.toString('latin1')).toContain('/SMask');
    await copyFile(result.destination, path.resolve('tmp/pdfs', `plan-images-${professional ? 'professional' : 'client'}.pdf`));
  }

  await page.getByRole('button', { name: 'Rajzjelek', exact: true }).click();
  await expect(page.getByTestId('floor-device-image')).toHaveCount(0);
  const symbols = await downloadPdf(page, testInfo, false, 'symbols-client.pdf');
  expect(symbols.text).toContain('Rajzjelek');
  expect(symbols.text).toContain('JELMAGYARÁZAT');
  expect(symbols.text).not.toContain('VALÓS KÉPEK');
  expect(symbols.text).not.toContain('Nincs alaprajzi kép hozzárendelve');
  await copyFile(symbols.destination, path.resolve('tmp/pdfs/plan-symbols-client.pdf'));
});
