import { expect, test, type Locator, type Page } from '@playwright/test';
import { makeDevice } from '../src/catalog';
import { encodeProject } from '../src/data/archive';
import { createProject } from '../src/data/project';
import type { Point, ProjectDocument } from '../src/types';
import { reopenRecentProject } from './startup';

function cabinetFixture() {
  const document = createProject('Unified cabinet');
  const device = (id: string, code: string, moduleWidth = 1) => ({
    ...makeDevice('breaker', []), id, code, moduleWidth
  });
  document.data.devices = [device('main', 'Q1', 2), device('first', 'QF1'), device('second', 'QF2'), device('fractional', 'XT1', 29 / 18)];
  document.data.boards[0].rows = [
    { id: 'upper', name: 'Upper row', capacity: 12, placements: [{ deviceId: 'main', start: 0 }, { deviceId: 'first', start: 3 }, { deviceId: 'second', start: 5 }, { deviceId: 'fractional', start: 8.25 }] },
    { id: 'lower', name: 'Lower row', capacity: 12, placements: [] }
  ];
  document.data.boards[0].wiring = {
    buses: [], infeeds: [], wires: [
      { id: 'automatic', label: 'Automatic', from: { kind: 'device', deviceId: 'main', side: 'bottom', pole: 0 }, to: { kind: 'device', deviceId: 'first', side: 'top', pole: 0 } },
      { id: 'manual', label: 'Manual', color: '#12ABef', from: { kind: 'device', deviceId: 'first', side: 'bottom', pole: 0 }, to: { kind: 'device', deviceId: 'second', side: 'bottom', pole: 0 }, points: [{ x: 239, y: 270 }, { x: 331, y: 270 }] }
    ]
  };
  return document;
}

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
        get.onerror = () => { db.close(); reject(get.error); };
        get.onsuccess = () => { db.close(); resolve(get.result.document); };
      };
    });
  });
}

async function openCabinet(page: Page, document = cabinetFixture(), language = 'hu', theme = 'light') {
  await page.addInitScript(({ language, theme }) => {
    localStorage.setItem('planner.language', language);
    localStorage.setItem('planner.theme', theme);
  }, { language, theme });
  await page.goto('/');
  await page.locator('.start-actions').getByRole('button', { name: /^(Projekt megnyitása|Open project)/ }).click();
  const selecting = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /^(Projektfájl kiválasztása|Choose project file)$/ }).click();
  await (await selecting).setFiles({ name: 'unified.vgecko', mimeType: 'application/zip', buffer: Buffer.from(await (await encodeProject(document)).arrayBuffer()) });
  await page.locator('.view-tabs').getByRole('button', { name: /^(Elosztó|Distribution board)$/ }).click();
  await expect(page.locator('.wiring-diagram')).toBeVisible();
}

const body = (page: Page, id: string) => page.locator(`.wiring-device-group[data-device-id="${id}"] rect.wiring-device`);
const grip = (page: Page, id: string) => page.locator(`.wiring-device-grip[data-device-id="${id}"]`);

async function svgPosition(page: Page, point: Point): Promise<Point> {
  return page.locator('.wiring-diagram').evaluate((element, point) => {
    const matrix = (element as SVGSVGElement).getScreenCTM();
    if (!matrix) throw new Error('SVG is not rendered');
    const position = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    return { x: position.x, y: position.y };
  }, point);
}

async function center(locator: Locator): Promise<Point> {
  await locator.scrollIntoViewIfNeeded();
  const bounds = await locator.boundingBox();
  if (!bounds) throw new Error('No bounds for drag grip');
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

function placement(document: ProjectDocument, id: string) {
  return document.data.boards[0].rows.flatMap(row => row.placements.filter(item => item.deviceId === id).map(item => ({ rowId: row.id, start: item.start })));
}

test('uses one drawing for selection, wiring and a single undoable half-module move between rows', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const original = cabinetFixture();
  await openCabinet(page, original);
  await expect(page.locator('rect.wiring-device')).toHaveCount(4);
  await expect(page.locator('.din-device')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Részletes huzalozás|Detailed wiring/ })).toHaveCount(0);
  expect(Number(await body(page, 'fractional').getAttribute('width'))).toBeCloseTo(29 / 18 * 46 - 4, 4);
  expect(Number(await body(page, 'fractional').getAttribute('x'))).toBeCloseTo(80 + 8.25 * 46, 4);

  await body(page, 'first').click();
  await expect(page.getByLabel('Eszköz azonosítója', { exact: true })).toHaveValue('QF1');
  await expect(body(page, 'first')).toHaveClass(/selected/);
  await page.locator('.wiring-wire-list').getByRole('button', { name: 'Manual', exact: true }).click();
  await expect(body(page, 'first')).not.toHaveClass(/selected/);
  await expect(page.locator('.wiring-wire.selected')).toHaveCount(1);
  await page.getByRole('button', { name: 'QF1 · felső 1 (L)', exact: true }).click();
  await expect(page.getByLabel('Vezeték kezdőpontja', { exact: true })).toHaveValue(JSON.stringify({ kind: 'device', deviceId: 'first', side: 'top', pole: 0 }));

  const automatic = await page.locator('.wiring-wire-hit').first().getAttribute('points');
  const manual = original.data.boards[0].wiring!.wires[1];
  const start = await center(grip(page, 'first'));
  const target = await svgPosition(page, { x: 80 + 4.5 * 46 + 21, y: 130 + 230 + 84 });
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await expect(body(page, 'first')).toHaveAttribute('x', '287');
  await expect(body(page, 'first')).toHaveAttribute('y', '360');
  expect(placement(await readDocument(page), 'first')).toEqual([{ rowId: 'upper', start: 3 }]);
  await page.locator('.wiring-diagram').dispatchEvent('pointerup', { pointerId: 99, pointerType: 'touch', bubbles: true });
  await expect(body(page, 'first')).toHaveAttribute('x', '287');
  expect(placement(await readDocument(page), 'first')).toEqual([{ rowId: 'upper', start: 3 }]);
  await page.mouse.up();
  await expect.poll(async () => placement(await readDocument(page), 'first')).toEqual([{ rowId: 'lower', start: 4.5 }]);
  await expect(page.locator('.wiring-wire-hit').first()).not.toHaveAttribute('points', automatic!);
  expect((await readDocument(page)).data.boards[0].wiring!.wires[1]).toEqual(manual);
  expect((await readDocument(page)).data.boards[0].wiring!.wires[0].points).toBeUndefined();
  await expect(page.locator('rect.wiring-device')).toHaveCount(4);

  await page.getByRole('button', { name: 'Visszavonás', exact: true }).click();
  await expect.poll(async () => placement(await readDocument(page), 'first')).toEqual([{ rowId: 'upper', start: 3 }]);
  await page.getByRole('button', { name: 'Újra', exact: true }).click();
  await expect.poll(async () => placement(await readDocument(page), 'first')).toEqual([{ rowId: 'lower', start: 4.5 }]);
  const saved = (await readDocument(page)).data;
  await page.reload();
  await reopenRecentProject(page);
  await page.locator('.view-tabs').getByRole('button', { name: 'Elosztó', exact: true }).click();
  await expect(body(page, 'first')).toHaveAttribute('y', '360');
  expect((await readDocument(page)).data).toEqual(saved);
  expect(errors).toEqual([]);
});

test('cancels device previews with Escape, pointer cancellation and a release outside a DIN row', async ({ page }) => {
  await openCabinet(page);
  const original = (await readDocument(page)).data;
  for (const cancellation of ['escape', 'pointercancel', 'outside']) {
    const start = await center(grip(page, 'first'));
    const target = await svgPosition(page, { x: 400, y: cancellation === 'outside' ? 315 : 444 });
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 5 });
    if (cancellation === 'escape') await page.keyboard.press('Escape');
    if (cancellation === 'pointercancel') await page.locator('.wiring-diagram').dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', bubbles: true });
    await page.mouse.up();
    await expect(body(page, 'first')).toHaveAttribute('x', '218');
    await expect(body(page, 'first')).toHaveAttribute('y', '130');
    expect((await readDocument(page)).data).toEqual(original);
  }
});

test('keeps the drawing stable when dragging a device whose inspector is open', async ({ page }) => {
  await openCabinet(page);
  await body(page, 'first').click();
  await expect(page.getByLabel('Eszköz azonosítója', { exact: true })).toHaveValue('QF1');
  const start = await center(grip(page, 'first'));
  const before = await page.locator('.wiring-diagram').boundingBox();
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const after = await page.locator('.wiring-diagram').boundingBox();
  expect(after!.x).toBeCloseTo(before!.x, 4);
  expect(after!.y).toBeCloseTo(before!.y, 4);
  await page.mouse.move(start.x + 69, start.y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => placement(await readDocument(page), 'first')).toEqual([{ rowId: 'upper', start: 4.5 }]);
});

test('keeps overflowing and fractional device geometry reachable and handles a cabinet with no rows', async ({ page }) => {
  const document = cabinetFixture();
  document.data.boards[0].rows[0].placements.find(item => item.deviceId === 'fractional')!.start = 24.25;
  await openCabinet(page, document);
  await expect(body(page, 'fractional')).toHaveClass(/invalid/);
  await expect(page.locator('.validation-box').filter({ hasText: 'Ellenőrizendő kiosztás' })).toContainText('túllóg');
  const drawingBounds = (await page.locator('.wiring-diagram').getAttribute('viewBox'))!.split(' ').map(Number);
  const deviceRight = 80 + 24.25 * 46 + 29 / 18 * 46 - 4;
  expect(drawingBounds[0] + drawingBounds[2]).toBeGreaterThan(deviceRight);
  await grip(page, 'fractional').scrollIntoViewIfNeeded();
  await expect(grip(page, 'fractional')).toBeInViewport();
  for (let index = 0; index < 2; index++) {
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Sor törlése', exact: true }).first().click();
  }
  await expect(page.locator('.wiring-row')).toHaveCount(0);
  await expect(page.locator('.wiring-diagram')).toBeVisible();
  await page.getByRole('button', { name: 'Új DIN-sor', exact: true }).click();
  await expect(page.locator('.wiring-row')).toHaveCount(1);
});

test('keeps a half-module body at its physical width and moves its grip with the keyboard', async ({ page }) => {
  const document = cabinetFixture();
  document.data.devices.find(device => device.id === 'fractional')!.moduleWidth = 0.5;
  await openCabinet(page, document);
  await expect(body(page, 'fractional')).toHaveAttribute('width', '19');
  const handle = grip(page, 'fractional');
  await handle.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => placement(await readDocument(page), 'fractional')).toEqual([{ rowId: 'upper', start: 9 }]);
  await expect(body(page, 'fractional')).toHaveAttribute('width', '19');
});

test.describe('phone cabinet editing', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('closes a touch-selected device inspector without reopening it', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await openCabinet(page, cabinetFixture(), 'en', 'dark');
    await body(page, 'main').tap();
    await expect(page.getByLabel('Device identifier', { exact: true })).toHaveValue('Q1');
    await page.getByRole('button', { name: 'Close selection', exact: true }).tap();
    await expect(page.locator('.inspector.has-selection')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
  test('keeps the board internally scrollable and supports touch selection with keyboard placement', async ({ page, browserName }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await openCabinet(page, cabinetFixture(), 'en', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByLabel('Wire start terminal', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const scroller = page.locator('.wiring-diagram-scroll');
    expect(await scroller.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
    await expect(grip(page, 'main')).toHaveCSS('touch-action', 'none');
    await expect(grip(page, 'main')).toHaveJSProperty('tagName', 'BUTTON');
    await expect(page.locator('.wiring-diagram')).toHaveCSS('touch-action', 'pan-x pan-y');
    if (browserName === 'chromium') {
      const session = await page.context().newCDPSession(page);
      const start = await center(grip(page, 'main'));
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x, y: start.y, id: 1 }] });
      for (const delta of [23, 46, 69]) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + delta, y: start.y, id: 1 }] });
      await expect(body(page, 'main')).toHaveAttribute('x', '149');
      expect(placement(await readDocument(page), 'main')).toEqual([{ rowId: 'upper', start: 0 }]);
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect.poll(async () => placement(await readDocument(page), 'main')).toEqual([{ rowId: 'upper', start: 1.5 }]);
      expect(await scroller.evaluate(element => element.scrollLeft)).toBe(0);
      await session.detach();
    }
    if (browserName !== 'chromium') await body(page, 'main').tap();
    await expect(page.getByLabel('Device identifier', { exact: true })).toHaveValue('Q1');
    const inspector = page.locator('.inspector.has-selection');
    const row = inspector.getByLabel('Device row', { exact: true });
    await row.tap();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(row).toHaveValue('lower');
    const position = inspector.getByLabel('Starting module space', { exact: true });
    await position.tap();
    expect(await position.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2) === element;
    })).toBe(true);
    await position.fill('2.5');
    await expect.poll(async () => placement(await readDocument(page), 'main')).toEqual([{ rowId: 'lower', start: 1.5 }]);
    await inspector.screenshot({ path: testInfo.outputPath('cabinet-phone-position-en-dark.png') });
    const close = page.getByRole('button', { name: 'Close selection', exact: true });
    await close.tap();
    await expect(page.locator('.inspector.has-selection')).toHaveCount(0);
    if (browserName === 'chromium') {
      await scroller.evaluate(element => { element.scrollTop = 0; });
      await scroller.scrollIntoViewIfNeeded();
      const bounds = await scroller.boundingBox();
      if (!bounds) throw new Error('No cabinet scroll area');
      const session = await page.context().newCDPSession(page);
      const y = bounds.y + 60;
      const x = bounds.x + bounds.width - 35;
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      for (const delta of [35, 75, 120, 160]) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - delta, y, id: 1 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await session.detach();
    } else await scroller.evaluate(element => { element.scrollLeft = element.scrollWidth; });
    await expect.poll(() => scroller.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await scroller.screenshot({ path: testInfo.outputPath('cabinet-phone-en-dark.png') });
    expect(errors).toEqual([]);
  });
});

for (const [language, theme] of [['hu', 'light'], ['en', 'dark']]) {
  test(`renders the unified cabinet in ${language} with the ${theme} theme`, async ({ page }, testInfo) => {
    await openCabinet(page, cabinetFixture(), language, theme);
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('rect.wiring-device')).toHaveCount(4);
    await page.locator('.wiring-diagram-scroll').screenshot({ path: testInfo.outputPath(`cabinet-${language}-${theme}.png`) });
  });
}
