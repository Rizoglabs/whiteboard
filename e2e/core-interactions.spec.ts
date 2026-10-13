import { test, expect } from '@playwright/test';
import {
  canvasBox,
  closePanel,
  closeTo,
  createRect,
  expectSelectedCount,
  expectShapeCount,
  expectZoom,
  readShapes,
  toolButton,
  waitSaved,
  worldToScreen,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitSaved(page);
});

test('create selects the new shape and persists its geometry', async ({ page }) => {
  await createRect(page, 100, 100, 200, 180);
  await expectShapeCount(page, 1);
  await expectSelectedCount(page, 1);
  await waitSaved(page);
  const shapes = await readShapes(page);
  expect(shapes).toHaveLength(1);
  closeTo(shapes[0].rect.x, 100);
  closeTo(shapes[0].rect.y, 100);
  closeTo(shapes[0].rect.w, 100);
  closeTo(shapes[0].rect.h, 80);
});

test('click selects a shape; click on empty space deselects', async ({ page }) => {
  await createRect(page, 100, 100, 200, 180);
  await createRect(page, 300, 300, 380, 360);
  await closePanel(page);
  const a = await worldToScreen(page, 150, 140);
  await page.mouse.click(a.x, a.y);
  await expectSelectedCount(page, 1);
  const empty = await worldToScreen(page, 600, 600);
  await page.mouse.click(empty.x, empty.y);
  await expectSelectedCount(page, 0);
});

test('shift-click toggles multi-select', async ({ page }) => {
  await createRect(page, 100, 100, 200, 180);
  await createRect(page, 300, 300, 380, 360);
  await closePanel(page);
  const a = await worldToScreen(page, 150, 140);
  await page.mouse.click(a.x, a.y);
  await expectSelectedCount(page, 1);
  const b = await worldToScreen(page, 340, 330);
  await page.keyboard.down('Shift');
  await page.mouse.click(b.x, b.y);
  await page.keyboard.up('Shift');
  await expectSelectedCount(page, 2);
  await closePanel(page); // panel re-opens on multi-select; clear it before the toggle-off click
  await page.keyboard.down('Shift');
  await page.mouse.click(a.x, a.y);
  await page.keyboard.up('Shift');
  await expectSelectedCount(page, 1);
});

test('marquee selects every intersecting shape', async ({ page }) => {
  await createRect(page, 100, 100, 160, 160);
  await createRect(page, 300, 300, 360, 360);
  await closePanel(page);
  const p1 = await worldToScreen(page, 50, 50);
  const p2 = await worldToScreen(page, 400, 400);
  await page.mouse.move(p1.x, p1.y);
  await page.mouse.down();
  await page.mouse.move(p2.x, p2.y, { steps: 8 });
  await page.mouse.up();
  await expectSelectedCount(page, 2);
});

test('shift-marquee adds to the existing selection', async ({ page }) => {
  await createRect(page, 100, 100, 160, 160);
  await createRect(page, 300, 300, 360, 360);
  await closePanel(page);
  const a = await worldToScreen(page, 130, 130);
  await page.mouse.click(a.x, a.y);
  await expectSelectedCount(page, 1);
  const p1 = await worldToScreen(page, 250, 250);
  const p2 = await worldToScreen(page, 400, 400);
  await page.mouse.move(p1.x, p1.y);
  await page.keyboard.down('Shift');
  await page.mouse.down();
  await page.mouse.move(p2.x, p2.y, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expectSelectedCount(page, 2);
});

test('drag moves the shape by the pointer delta', async ({ page }) => {
  await createRect(page, 100, 100, 200, 180);
  await closePanel(page);
  const c = await worldToScreen(page, 150, 140);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 60, c.y + 40, { steps: 5 });
  await page.mouse.up();
  await waitSaved(page);
  const shapes = await readShapes(page);
  expect(shapes).toHaveLength(1);
  closeTo(shapes[0].rect.x, 160);
  closeTo(shapes[0].rect.y, 140);
});

test('dragging the SE handle resizes the shape', async ({ page }) => {
  await createRect(page, 100, 100, 200, 180);
  const h = await worldToScreen(page, 200, 180);
  await page.mouse.move(h.x, h.y);
  await page.mouse.down();
  const t = await worldToScreen(page, 260, 220);
  await page.mouse.move(t.x, t.y, { steps: 5 });
  await page.mouse.up();
  await waitSaved(page);
  const shapes = await readShapes(page);
  expect(shapes).toHaveLength(1);
  closeTo(shapes[0].rect.x, 100);
  closeTo(shapes[0].rect.y, 100);
  closeTo(shapes[0].rect.w, 160);
  closeTo(shapes[0].rect.h, 120);
});

test('Delete key removes the selected shape', async ({ page }) => {
  await createRect(page, 100, 100, 200, 180);
  await page.keyboard.press('Delete');
  await expectShapeCount(page, 0);
  await waitSaved(page);
  expect(await readShapes(page)).toHaveLength(0);
});

test('toolbar Delete removes selection and disables when empty', async ({ page }) => {
  await createRect(page, 100, 100, 200, 180);
  await toolButton(page, 'Delete').click();
  await expectShapeCount(page, 0);
  await expect(toolButton(page, 'Delete')).toBeDisabled();
});

test('undo/redo buttons walk the history', async ({ page }) => {
  await createRect(page, 100, 100, 200, 180);
  await createRect(page, 300, 300, 380, 360);
  await expectShapeCount(page, 2);
  await toolButton(page, 'Undo').click();
  await expectShapeCount(page, 1);
  await toolButton(page, 'Undo').click();
  await expectShapeCount(page, 0);
  await expect(toolButton(page, 'Undo')).toBeDisabled();
  await toolButton(page, 'Redo').click();
  await expectShapeCount(page, 1);
  await toolButton(page, 'Redo').click();
  await expectShapeCount(page, 2);
  await waitSaved(page);
  expect(await readShapes(page)).toHaveLength(2);
});

test('undo/redo keyboard shortcuts work', async ({ page }) => {
  await createRect(page, 100, 100, 200, 180);
  await page.keyboard.press('Control+z');
  await expectShapeCount(page, 0);
  await page.keyboard.press('Control+Shift+z');
  await expectShapeCount(page, 1);
});

test('toolbar zoom in/out/reset', async ({ page }) => {
  await toolButton(page, 'Zoom in').click();
  await expectZoom(page, '125%');
  await toolButton(page, 'Zoom in').click();
  await expectZoom(page, '156%');
  await toolButton(page, 'Reset zoom').click();
  await expectZoom(page, '100%');
  await toolButton(page, 'Zoom out').click();
  await expectZoom(page, '80%');
});

test('wheel zoom clamps to 10%..800%', async ({ page }) => {
  const box = await canvasBox(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -5000);
  await expectZoom(page, '800%');
  await page.mouse.wheel(0, 5000);
  await expectZoom(page, '10%');
});

test('pan tool moves the camera', async ({ page }) => {
  await createRect(page, 100, 100, 200, 180);
  await closePanel(page);
  const box = await canvasBox(page);
  await toolButton(page, 'Pan').click();
  const sx = box.x + box.width / 2;
  const sy = box.y + box.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 100, sy, { steps: 5 });
  await page.mouse.up();
  // Camera.x: -80 -> -180. Draw at the same screen spot as the first rect.
  await toolButton(page, 'Rectangle').click();
  const a = { x: box.x + 180, y: box.y + 180 };
  const b = { x: box.x + 280, y: box.y + 260 };
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.up();
  await waitSaved(page);
  const shapes = await readShapes(page);
  expect(shapes).toHaveLength(2);
  closeTo(shapes[1].rect.x, 0); // 180 + (-180)
  closeTo(shapes[1].rect.y, 100); // 180 + (-80)
});

test('space+drag pans the camera', async ({ page }) => {
  await createRect(page, 100, 100, 200, 180);
  await closePanel(page);
  const box = await canvasBox(page);
  const sx = box.x + 200;
  const sy = box.y + 200;
  await page.keyboard.down('Space');
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 80, sy + 40, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  // Camera: (-80,-80) -> (-160,-120). Draw at fixed screen coords.
  await toolButton(page, 'Rectangle').click();
  const a = { x: box.x + 180, y: box.y + 180 };
  const b = { x: box.x + 230, y: box.y + 230 };
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.up();
  await waitSaved(page);
  const shapes = await readShapes(page);
  expect(shapes).toHaveLength(2);
  closeTo(shapes[1].rect.x, 20); // 180 + (-160)
  closeTo(shapes[1].rect.y, 60); // 180 + (-120)
});

test('middle-drag pans the camera', async ({ page }) => {
  await createRect(page, 100, 100, 200, 180);
  await closePanel(page);
  const box = await canvasBox(page);
  const sx = box.x + 200;
  const sy = box.y + 200;
  await page.mouse.move(sx, sy);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(sx + 80, sy, { steps: 5 });
  await page.mouse.up({ button: 'middle' });
  await toolButton(page, 'Rectangle').click();
  const a = { x: box.x + 180, y: box.y + 180 };
  const b = { x: box.x + 230, y: box.y + 230 };
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.up();
  await waitSaved(page);
  const shapes = await readShapes(page);
  expect(shapes).toHaveLength(2);
  closeTo(shapes[1].rect.x, 20); // camera.x: -80 -> -160
  closeTo(shapes[1].rect.y, 100); // camera.y unchanged
});

test('Escape cancels an in-progress create', async ({ page }) => {
  await toolButton(page, 'Rectangle').click();
  const a = await worldToScreen(page, 100, 100);
  const b = await worldToScreen(page, 200, 180);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expectShapeCount(page, 0);
});
