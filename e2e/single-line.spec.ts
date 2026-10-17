import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectDocument } from '../src/types';

const outputDir = path.resolve('tmp/single-line-results');
const cable = 'NYM-J 3×2,5 mm²';
const supply = 'Lakásbetáp · 3×400/230 V';

async function readDocument(page: Page, projectId?: string): Promise<ProjectDocument> {
  return page.evaluate(async requestedId => {
    const id = requestedId ?? localStorage.getItem('planner.activeProject');
    if (!id) throw new Error('No active project');
    return new Promise<ProjectDocument>((resolve, reject) => {
      const request = indexedDB.open('villamos-tervezo-local');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const get = db.transaction('projects', 'readonly').objectStore('projects').get(id);
        get.onerror = () => { db.close(); reject(get.error); };
        get.onsuccess = () => { db.close(); if (!get.result?.document) reject(new Error('Missing project')); else resolve(get.result.document); };
      };
    });
  }, projectId);
}

async function openPlanner(page: Page, url = '/') {
  await page.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }));
  await page.goto(url);
  await expect(page.locator('.project-title')).toHaveText(/Dunaparti lakás/);
  await expect(page.getByText('Ezen az eszközön mentve', { exact: true })).toBeVisible();
}

async function tab(page: Page, name: string) {
  await page.locator('.view-tabs').getByRole('button', { name, exact: true }).click();
}

async function configureGraph(page: Page): Promise<ProjectDocument> {
  const original = await readDocument(page);
  const main = original.data.devices.find(device => device.code === 'Q1')!;
  const rcd = original.data.devices.find(device => device.code === 'FI1')!;
  await tab(page, 'Elosztó');
  await page.getByLabel('Betáplálás megnevezése', { exact: true }).fill(supply);
  await page.getByLabel('Q1 táplálása', { exact: true }).selectOption('supply');
  await page.getByLabel('FI1 táplálása', { exact: true }).selectOption(`device:${main.id}`);
  await page.getByLabel('QF1 táplálása', { exact: true }).selectOption(`device:${rcd.id}`);
  await tab(page, 'Áramkörök');
  await page.getByLabel('ÁK1 kábele', { exact: true }).fill(cable);
  await page.getByLabel('ÁK1 teljesítménye', { exact: true }).fill('1234.5');
  await page.getByLabel('ÁK1 fogyasztótípusa', { exact: true }).selectOption('socket');
  await expect.poll(async () => {
    const circuit = (await readDocument(page)).data.circuits[0];
    return { cable: circuit.cable, powerW: circuit.powerW, loadType: circuit.loadType };
  }).toEqual({ cable, powerW: 1234.5, loadType: 'socket' });
  const document = await readDocument(page);
  expect(document.data.boards[0].connections).toHaveLength(3);
  expect(document.data.devices.map(device => [device.id, device.code])).toEqual(original.data.devices.map(device => [device.id, device.code]));
  return document;
}

async function exportArchive(page: Page, filename: string) {
  await page.getByRole('button', { name: 'Mentés és export', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: /Projektfájl mentése/ }).click();
  const download = await downloading;
  const destination = path.join(outputDir, filename);
  await download.saveAs(destination);
  await expect(page.locator('.busy-overlay')).toHaveCount(0);
  return destination;
}

function legacyFixture() {
  return {
    v: 2, project: { name: 'Minta · v2 kapcsolatpróba', author: 'Helyi QA', date: '2026-01-01' },
    rows: [{ mods: 18 }, { mods: 18 }], nid: 100,
    comps: [
      { id: 'old-supply', type: 'supply', row: 0, x: 0, poles: '3P+N', name: 'Régi betáp', cable: 'NYY-J 5×16 mm²' },
      { id: 'old-main', type: 'main', row: 0, x: 4, poles: '4P', name: 'Leválasztó', rating: 63 },
      { id: 'old-rcd', type: 'rccb', row: 0, x: 8, poles: '4P', name: 'ÁVK', rating: 40, sens: 30, rtype: 'A' },
      { id: 'old-mcb', type: 'mcb', row: 1, x: 0, poles: '1P', name: '<script>alert("qa")</script> & konyha', rating: 16, curve: 'B', cable, loadType: 'socket', power: 1234.5 },
      { id: 'old-rcbo', type: 'rcbo', row: 1, x: 2, poles: '3P+N', name: 'Mosógép', rating: 16, curve: 'C', sens: 30, rtype: 'A', cable: 'NYM-J 5×2,5 mm²', loadType: 'other', power: 0 },
    ],
    wires: [
      { id: 'old-w1', a: { c: 'old-supply', s: 'bottom' }, b: { c: 'old-main', s: 'top' } },
      { id: 'old-w2', a: { c: 'old-rcd', s: 'top' }, b: { c: 'old-main', s: 'bottom' } },
      { id: 'old-w3', a: { c: 'old-rcd', s: 'bottom' }, b: { c: 'old-mcb', s: 'top' } },
      { id: 'old-w4', a: { c: 'old-rcd', s: 'bottom' }, b: { c: 'old-rcbo', s: 'top' } },
      { id: 'old-cycle', a: { c: 'old-rcbo', s: 'bottom' }, b: { c: 'old-main', s: 'top' } },
      { id: 'old-parallel', a: { c: 'old-main', s: 'bottom' }, b: { c: 'old-rcd', s: 'top' } },
      { id: 'old-ambiguous', a: { c: 'old-mcb', s: 'top' }, b: { c: 'old-rcbo', s: 'top' } },
      { id: 'old-self', a: { c: 'old-mcb', s: 'bottom' }, b: { c: 'old-mcb', s: 'top' } },
    ],
  };
}

test.beforeAll(async () => { await mkdir(outputDir, { recursive: true }); });

test('edits shared board and circuit data, keeps stable device identities, translates and downloads the actual SVG', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openPlanner(page);
  const configured = await configureGraph(page);
  await tab(page, 'Egyvonalas');
  const svg = page.locator('.single-line-svg svg');
  await expect(svg.locator('[data-connection-id]')).toHaveCount(3);
  await expect(svg.locator('[data-device-id]')).toHaveCount(6);
  await expect(svg).toContainText(supply);
  await expect(svg).toContainText(cable);
  await expect(svg).toContainText(/1\s?234,5 W/);
  const breaker = configured.data.devices.find(device => device.code === 'QF1')!;
  await svg.locator(`[data-device-id="${breaker.id}"]`).click();
  await expect(page.getByLabel('Eszköz azonosítója', { exact: true })).toHaveValue('QF1');
  await page.getByLabel('Eszköz neve', { exact: true }).fill('Konyha & pult <A>');
  await expect(svg).toContainText('Konyha & pult <A>');
  await page.getByLabel('Nyelv / Language', { exact: true }).selectOption('en');
  await expect(page.getByRole('heading', { name: 'Single-line diagram', exact: true })).toBeVisible();
  await expect(svg).toContainText('1,234.5 W');
  await expect(svg).toContainText(cable);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download SVG', exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/-single-line\.svg$/);
  const filename = path.join(outputDir, 'shared-diagram-en.svg');
  await download.saveAs(filename);
  const source = await readFile(filename, 'utf8');
  expect(source).toContain('xmlns="http://www.w3.org/2000/svg"');
  expect(source.match(/data-connection-id=/g)).toHaveLength(3);
  expect(source).toContain('Konyha &amp; pult &lt;A&gt;');
  expect(source).toContain(cable);
  expect(source).toContain('1,234.5 W');
  expect(source).not.toMatch(/<script|<foreignObject|https?:\/\/(?!www\.w3\.org)/i);
  await page.getByRole('button', { name: 'Fit diagram', exact: true }).click();
  await page.screenshot({ path: path.join(outputDir, 'single-line-desktop.png'), fullPage: true });
  await mkdir(path.resolve('tmp/legacy-results'), { recursive: true });
  await page.getByRole('button', { name: 'Save and export', exact: true }).click();
  const pdfDownloading = page.waitForEvent('download');
  await page.getByRole('button', { name: /Detailed technical PDF/ }).click();
  const pdf = await pdfDownloading;
  await pdf.saveAs(path.resolve('tmp/legacy-results/diagram-en.pdf'));
  await expect(page.locator('.busy-overlay')).toHaveCount(0);
  const document = await readDocument(page);
  expect(document.data.devices.map(device => [device.id, device.code])).toEqual(configured.data.devices.map(device => [device.id, device.code]));
  expect(document.data.circuits[0]).toMatchObject({ cable, powerW: 1234.5, loadType: 'socket' });
  expect(errors).toEqual([]);
});

test('restores connection and load fields in a new version and preserves an edited original when its archive is imported', async ({ page }) => {
  test.setTimeout(90_000);
  await openPlanner(page);
  const configured = await configureGraph(page);
  await page.locator('.main-nav').getByRole('button', { name: /Előzmények/ }).click();
  await page.getByLabel('Verzió megjegyzése', { exact: true }).fill('QA: kapcsolatok és fogyasztó');
  await page.locator('.revision-compose').getByRole('button', { name: 'Verzió mentése', exact: true }).click();
  await expect.poll(async () => (await readDocument(page)).revisions.at(-1)?.note).toBe('QA: kapcsolatok és fogyasztó');
  const revisionId = (await readDocument(page)).headRevisionId;
  await tab(page, 'Áramkörök');
  await page.getByLabel('ÁK1 teljesítménye', { exact: true }).fill('99');
  await tab(page, 'Elosztó');
  await page.getByLabel('QF1 táplálása', { exact: true }).selectOption('none');
  await expect.poll(async () => (await readDocument(page)).data.boards[0].connections?.length).toBe(2);
  await page.locator('.main-nav').getByRole('button', { name: /Előzmények/ }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('.timeline article').filter({ has: page.getByRole('heading', { name: 'QA: kapcsolatok és fogyasztó', exact: true }) }).getByRole('button', { name: 'Visszaállítás', exact: true }).click();
  await expect.poll(async () => (await readDocument(page)).revisions.at(-1)?.restoredFrom).toBe(revisionId);
  const restored = await readDocument(page);
  expect(restored.data.boards).toEqual(configured.data.boards);
  expect(restored.data.circuits[0]).toMatchObject({ cable, powerW: 1234.5, loadType: 'socket' });
  const archive = await exportArchive(page, 'single-line-roundtrip.eplan');
  const exported = await readDocument(page);
  await tab(page, 'Áramkörök');
  await page.getByLabel('ÁK1 kábele', { exact: true }).fill('Megőrzendő helyi módosítás');
  await expect.poll(async () => (await readDocument(page)).data.circuits[0].cable).toBe('Megőrzendő helyi módosítás');
  await page.locator('input[accept=".eplan,.json,.zip"]').setInputFiles(archive);
  await expect(page.locator('.project-title')).toContainText('importált másolat');
  const imported = await readDocument(page);
  expect(imported.data.id).not.toBe(exported.data.id);
  expect(imported.data.boards).toEqual(exported.data.boards);
  expect(imported.data.circuits).toEqual(exported.data.circuits);
  expect(imported.revisions.map(revision => ({ ...revision.data, id: exported.data.id }))).toEqual(exported.revisions.map(revision => revision.data));
  const original = await readDocument(page, exported.data.id);
  expect(original.data.circuits[0].cable).toBe('Megőrzendő helyi módosítás');
  await tab(page, 'Egyvonalas');
  await expect(page.locator('.single-line-svg [data-connection-id]')).toHaveCount(3);
});

test('imports inert legacy JSON v2 with every cyclic, parallel and ambiguous edge and its original generic widths', async ({ page }) => {
  const errors: string[] = [];
  const dialogs: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.dismiss(); });
  await openPlanner(page);
  const original = await readDocument(page);
  const fixture = legacyFixture();
  await page.locator('input[accept=".eplan,.json,.zip"]').setInputFiles({ name: 'legacy-v2.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
  await expect(page.locator('.project-title')).toHaveText(fixture.project.name);
  const imported = await readDocument(page);
  expect(imported.data.id).not.toBe(original.data.id);
  expect(imported.data.boards[0].rows.map(row => row.capacity)).toEqual([18, 18]);
  expect(imported.data.devices).toHaveLength(fixture.comps.length);
  expect(imported.data.boards[0].connections).toHaveLength(fixture.wires.length);
  expect(imported.data.devices.find(device => device.kind === 'rcbo')?.moduleWidth).toBe(4);
  expect(imported.data.devices.every(device => device.product === undefined)).toBe(true);
  expect(imported.data.notes).toContain('Helyi QA');
  expect(imported.data.notes).toContain('old-ambiguous');
  expect(imported.data.circuits[0]).toMatchObject({ cable, powerW: 1234.5, loadType: 'socket' });
  expect(imported.data.circuits[1].powerW).toBe(0);
  expect((await readDocument(page, original.data.id)).data).toEqual(original.data);
  await tab(page, 'Egyvonalas');
  const svg = page.locator('.single-line-svg svg');
  await expect(svg.locator('[data-connection-id]')).toHaveCount(fixture.wires.length);
  await expect(svg.locator('[data-device-id]')).toHaveCount(fixture.comps.length);
  await expect(svg).toContainText('<script>alert("qa")</script> & konyha');
  await expect(svg.locator('script,foreignObject')).toHaveCount(0);
  await expect(page.locator('.single-line-issues')).toBeVisible();
  await expect(page.locator('.single-line-issues')).toContainText(/hurok|ciklus/i);
  await page.screenshot({ path: path.join(outputDir, 'legacy-complete-graph.png'), fullPage: true });
  expect(dialogs).toEqual([]);
  expect(errors).toEqual([]);
});

test('reopens the production diagram and edits its source data completely offline', async ({ page, context }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openPlanner(page, 'http://localhost:4173/');
  await expect(page.getByText('Offline használatra kész', { exact: true })).toBeVisible({ timeout: 45_000 });
  await configureGraph(page);
  await tab(page, 'Egyvonalas');
  await expect(page.locator('.single-line-svg [data-connection-id]')).toHaveCount(3);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const externalRequests: string[] = [];
  page.on('request', request => { if (!request.url().startsWith('http://localhost:4173/') && !/^(data:|blob:)/.test(request.url())) externalRequests.push(request.url()); });
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.statusbar').getByText('Offline', { exact: true })).toBeVisible();
  await tab(page, 'Egyvonalas');
  await expect(page.locator('.single-line-svg [data-connection-id]')).toHaveCount(3);
  await expect(page.locator('.single-line-svg')).toContainText(cable);
  await tab(page, 'Áramkörök');
  await page.getByLabel('ÁK1 teljesítménye', { exact: true }).fill('2468');
  await expect.poll(async () => (await readDocument(page)).data.circuits[0].powerW).toBe(2468);
  await page.reload();
  await tab(page, 'Egyvonalas');
  await expect(page.locator('.single-line-svg')).toContainText(/2\s?468 W/);
  await expect(page.locator('.single-line-svg [data-connection-id]')).toHaveCount(3);
  expect(externalRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test.describe('phone single-line planning', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('uses touch to define feeds and inspect and zoom the shared diagram without page overflow', async ({ page }) => {
    await openPlanner(page);
    const configured = await configureGraph(page);
    await tab(page, 'Egyvonalas');
    await expect(page.getByRole('heading', { name: 'Egyvonalas rajz', exact: true })).toBeVisible();
    await expect(page.locator('.single-line-svg [data-connection-id]')).toHaveCount(3);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const before = await page.getByRole('status', { name: 'A rajz nagyítása', exact: true }).textContent();
    await page.getByRole('button', { name: 'Rajz nagyítása', exact: true }).tap();
    await expect(page.getByRole('status', { name: 'A rajz nagyítása', exact: true })).not.toHaveText(before!);
    await page.getByRole('button', { name: 'Rajz illesztése', exact: true }).tap();
    await expect.poll(() => page.locator('.single-line-stage').evaluate(element => {
      const paper = element.querySelector('.single-line-paper') as HTMLElement;
      return paper.offsetWidth - element.clientWidth;
    })).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(outputDir, 'single-line-mobile-diagram.png'), fullPage: true });
    const main = configured.data.devices.find(device => device.code === 'Q1')!;
    await page.locator(`.single-line-svg [data-device-id="${main.id}"]`).tap();
    await expect(page.getByLabel('Eszköz azonosítója', { exact: true })).toHaveValue('Q1');
    await page.screenshot({ path: path.join(outputDir, 'single-line-mobile.png'), fullPage: true });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
