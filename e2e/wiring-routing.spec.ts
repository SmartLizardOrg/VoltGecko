import { expect, test } from '@playwright/test';
import { makeDevice } from '../src/catalog';
import { encodeProject } from '../src/data/archive';
import { createProject } from '../src/data/project';
import { chooseSample } from './startup';

test('routes same-row connections outside devices and preserves a manual route during unrelated edits', async ({ page }) => {
  await page.goto('/');
  await chooseSample(page);
  await page.locator('.view-tabs').getByRole('button', { name: 'Elosztó', exact: true }).click();
  await page.getByRole('button', { name: 'Részletes huzalozás', exact: false }).click();
  const connect = async (source: string, target: string) => {
    await page.getByRole('button', { name: source, exact: true }).click();
    await page.getByRole('button', { name: target, exact: true }).click();
    await page.getByRole('button', { name: 'Vezeték létrehozása', exact: true }).click();
  };
  await connect('QF1 · felső 1 (L)', 'QF2 · felső 1 (L)');
  await connect('QF1 · alsó 1 (L)', 'QF3 · felső 1 (L)');
  const paths = await page.locator('.wiring-wire-hit').evaluateAll((elements) => elements.map((element) =>
    (element.getAttribute('points') ?? '').split(' ').map((point) => point.split(',').map(Number))
  ));
  expect(paths).toHaveLength(2);
  const bodies = await page.locator('rect.wiring-device').evaluateAll((elements) => elements.map((element) => ({
    x: Number(element.getAttribute('x')), y: Number(element.getAttribute('y')),
    width: Number(element.getAttribute('width')), height: Number(element.getAttribute('height'))
  })));
  for (const points of paths) {
    for (let index = 1; index < points.length; index++) {
      const [x1, y1] = points[index - 1], [x2, y2] = points[index];
      expect(x1 === x2 || y1 === y2).toBe(true);
      const crosses = bodies.some((body) => x1 === x2
        ? x1 > body.x && x1 < body.x + body.width && Math.max(y1, y2) > body.y && Math.min(y1, y2) < body.y + body.height
        : y1 > body.y && y1 < body.y + body.height && Math.max(x1, x2) > body.x && Math.min(x1, x2) < body.x + body.width);
      expect(crosses).toBe(false);
    }
  }
  expect(paths[0][1][1]).toBeLessThan(paths[0][0][1]);
  expect(paths[1][1][1]).toBeGreaterThan(paths[1][0][1]);
  expect(paths[1].at(-2)![1]).toBeLessThan(paths[1].at(-1)![1]);

  await page.locator('.wiring-wire-editor details > summary').click();
  await page.getByLabel('1. töréspont x', { exact: true }).fill('52');
  await page.getByLabel('1. töréspont y', { exact: true }).fill('281');
  const manual = await page.locator('.wiring-wire-hit').nth(1).getAttribute('points');
  await connect('QF2 · alsó 1 (L)', 'QF3 · alsó 1 (L)');
  await expect(page.locator('.wiring-wire-hit').nth(1)).toHaveAttribute('points', manual!);
  // Removing a different wire must also leave an automatic route in its original lane.
  const automatic = await page.locator('.wiring-wire-hit').nth(2).getAttribute('points');
  await page.locator('.wiring-wire-list > button').first().click();
  await page.getByRole('button', { name: 'Vezeték törlése', exact: true }).click();
  await expect(page.locator('.wiring-wire-hit').nth(1)).toHaveAttribute('points', automatic!);
});

test('includes automatic outer gutters in the canvas without moving default supply positions', async ({ page }) => {
  const doc = createProject('Outer routing gutter');
  const left = { ...makeDevice('breaker', []), id: 'left', code: 'QL' };
  const right = { ...makeDevice('breaker', []), id: 'right', code: 'QR' };
  doc.data.devices = [left, right];
  const board = doc.data.boards[0];
  board.rows = [
    { id: 'upper', name: 'Upper row', capacity: 18, placements: [] },
    { id: 'lower', name: 'Lower row', capacity: 18, placements: [{ deviceId: left.id, start: 0 }, { deviceId: right.id, start: 17 }] }
  ];
  board.wiring = {
    buses: [],
    infeeds: [{ id: 'supply', name: 'Supply', kind: 'supply', poles: ['L1', 'L2', 'L3', 'N', 'PE'] }],
    wires: [{ id: 'wire-test', from: { kind: 'device', deviceId: right.id, side: 'top', pole: 0 }, to: { kind: 'device', deviceId: right.id, side: 'bottom', pole: 0 } }]
  };
  await page.goto('/');
  await page.locator('.start-actions').getByRole('button', { name: /^Projekt megnyitása/ }).click();
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Projektfájl kiválasztása', exact: true }).click();
  await (await choosing).setFiles({ name: 'gutter.vgecko', mimeType: 'application/zip', buffer: Buffer.from(await (await encodeProject(doc)).arrayBuffer()) });
  await page.locator('.view-tabs').getByRole('button', { name: 'Elosztó', exact: true }).click();
  await page.getByRole('button', { name: 'Részletes huzalozás', exact: false }).click();
  const drawing = page.locator('.wiring-diagram');
  const points = await page.locator('.wiring-wire-hit').getAttribute('points');
  const coordinates = points!.split(' ').map((point) => point.split(',').map(Number));
  expect(Math.max(...coordinates.map(([x]) => x))).toBeGreaterThan(1048);
  const [x, y, width, height] = (await drawing.getAttribute('viewBox'))!.split(' ').map(Number);
  for (const [px, py] of coordinates) {
    expect(px).toBeGreaterThanOrEqual(x);
    expect(px).toBeLessThan(x + width);
    expect(py).toBeGreaterThanOrEqual(y);
    expect(py).toBeLessThan(y + height);
  }
  const supply = await page.locator('.wiring-source').getAttribute('x');
  await page.locator('.wiring-wire-list > button').click();
  await page.getByLabel('Vezeték felirata', { exact: true }).fill('Visible gutter');
  await expect(page.locator('.wiring-source')).toHaveAttribute('x', supply!);
  await expect(page.locator('.wiring-wire-hit')).toHaveAttribute('points', points!);
  const labelBox = await page.locator('.wiring-wire-label').evaluate((element) => {
    const bounds = (element as SVGGraphicsElement).getBBox();
    return { x: bounds.x, width: bounds.width };
  });
  const labelledBounds = (await drawing.getAttribute('viewBox'))!.split(' ').map(Number);
  expect(labelBox.x + labelBox.width).toBeLessThan(labelledBounds[0] + labelledBounds[2]);
  const scroller = page.locator('.wiring-diagram-scroll');
  await scroller.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
  await scroller.screenshot({ path: 'tmp/wiring-routing.png' });
});
