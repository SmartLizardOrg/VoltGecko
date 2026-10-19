import { expect, test } from '@playwright/test';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { CATALOG, deviceLabel, makeDevice } from '../src/catalog';
import { encodeProject } from '../src/data/archive';
import { createProject } from '../src/data/project';

test('exports every floor device variant with distinct symbols and a complete, unclipped legend', async ({ page }, testInfo) => {
  await page.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }));
  const doc = createProject('Alaprajzi eszköztár ellenőrzése');
  const entries = CATALOG.filter((entry) => entry.category === 'floor');
  expect(entries).toHaveLength(27);
  doc.data.floorPlanDisplay = 'symbols';
  doc.data.boards = [];
  for (const entry of entries) doc.data.devices.push(makeDevice(entry.kind, doc.data.devices, entry.variant));
  Object.assign(doc.data.sheets[0], {
    width: 1260,
    height: 720,
    placements: doc.data.devices.map((device, index) => ({
      deviceId: device.id,
      x: 100 + index % 9 * 132,
      y: 140 + Math.floor(index / 9) * 200,
      rotation: 0
    }))
  });

  await page.goto('/');
  await page.locator('.start-actions').getByRole('button', { name: /^Projekt megnyitása/ }).click();
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Projektfájl kiválasztása', exact: true }).click();
  await (await choosing).setFiles({
    name: 'teljes-eszkoztar.vgecko',
    mimeType: 'application/zip',
    buffer: Buffer.from(await (await encodeProject(doc)).arrayBuffer())
  });
  await expect(page.locator('.floor-device')).toHaveCount(27);
  await expect(page.getByTestId('floor-device-symbol')).toHaveCount(27);
  await page.getByRole('button', { name: 'Teljes tervlap', exact: true }).click();
  await mkdir('tmp/qa', { recursive: true });
  await page.screenshot({ path: path.resolve('tmp/qa/catalog-desktop.png'), fullPage: true });

  await page.getByRole('button', { name: 'Mentés és export', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: /PDF a megrendelőnek/ }).click();
  const destination = testInfo.outputPath('catalog.pdf');
  await (await downloading).saveAs(destination);
  await expect(page.locator('.busy-overlay')).toHaveCount(0);
  await mkdir('tmp/pdfs', { recursive: true });
  await copyFile(destination, path.resolve('tmp/pdfs/catalog.pdf'));

  const loading = getDocument({ data: new Uint8Array(await readFile(destination)), useSystemFonts: true });
  const pdf = await loading.promise;
  try {
    expect(pdf.numPages).toBeGreaterThanOrEqual(3);
    const firstPage = await pdf.getPage(1);
    const firstContent = await firstPage.getTextContent();
    const firstItems = firstContent.items.filter((item) => 'str' in item);
    const firstText = firstItems.map((item) => item.str).join(' ').replace(/\s+/g, ' ');
    expect(firstText).toContain('Rajzjelek');
    expect(firstText).toContain('JELMAGYARÁZAT');
    expect(firstText).toContain('Teljes jelmagyarázat a következő oldalon.');
    for (const device of doc.data.devices) expect(firstText).toContain(device.code);

    const operators = await firstPage.getOperatorList();
    const paintedImages = operators.fnArray.flatMap((operator, index) =>
      operator === OPS.paintImageXObject ? [operators.argsArray[index][0] as string] : []
    );
    // A blank sheet has one image per device, followed by the eight compact legend icons.
    // A cache keyed only by DeviceKind would reuse the same image for all nine switches.
    expect(paintedImages).toHaveLength(27 + 8);
    const drawingImages = paintedImages.slice(0, 27);
    expect(new Set(drawingImages).size).toBeGreaterThan(20);
    const switchImages = drawingImages.filter((_, index) => doc.data.devices[index].kind === 'switch');
    expect(new Set(switchImages).size).toBe(switchImages.length);

    const pointsPerMm = 72 / 25.4;
    const scale = firstItems.find((item) => item.str.includes('Méretarány nincs beállítva'));
    const continuation = firstItems.find((item) => item.str.includes('Teljes jelmagyarázat'));
    expect(scale).toBeDefined();
    expect(continuation).toBeDefined();
    // PDF text uses a bottom origin: the scale row must sit below the legend and
    // its continuation notice, while staying above the document footer.
    expect(scale!.transform[5] + scale!.height).toBeLessThan(continuation!.transform[5]);
    expect(scale!.transform[5]).toBeGreaterThan(12 * pointsPerMm);
    for (const device of doc.data.devices.slice(0, 8)) {
      const legendLabel = firstItems.find((item) => item.str === deviceLabel(device));
      expect(legendLabel).toBeDefined();
      expect(legendLabel!.transform[5]).toBeGreaterThan(scale!.transform[5] + scale!.height);
    }
    for (const item of firstItems.filter((item) => item.str.trim())) {
      expect(item.transform[4]).toBeGreaterThanOrEqual(18 * pointsPerMm - 1);
      expect(item.transform[4] + item.width).toBeLessThanOrEqual(402 * pointsPerMm + 1);
      expect(item.transform[5]).toBeGreaterThan(6 * pointsPerMm);
    }

    const legendPage = await pdf.getPage(2);
    const legendContent = await legendPage.getTextContent();
    const legendItems = legendContent.items.filter((item) => 'str' in item);
    const legendText = legendItems.map((item) => item.str).join(' ').replace(/\s+/g, ' ');
    expect(legendText).toContain('JELMAGYARÁZAT');
    for (const device of doc.data.devices) expect(legendText).toContain(deviceLabel(device));
    const legendOperators = await legendPage.getOperatorList();
    expect(legendOperators.fnArray.filter((operator) => operator === OPS.paintImageXObject)).toHaveLength(27);
    for (const device of doc.data.devices) {
      const item = legendItems.find((candidate) => candidate.str === deviceLabel(device));
      expect(item).toBeDefined();
      expect(item!.transform[4] + item!.width).toBeLessThanOrEqual(402 * pointsPerMm + 1);
      expect(item!.transform[5]).toBeGreaterThan(12 * pointsPerMm);
    }
  } finally {
    await loading.destroy();
  }
});
