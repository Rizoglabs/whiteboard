import { expect, test } from '@playwright/test';
import {
  canvasBox,
  closePanel,
  expectSelectedCount,
  expectShapeCount,
  readShapes,
  toolButton,
  waitSaved,
  worldToScreen,
} from './helpers';

test.describe('new shape tools', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expectShapeCount(page, 0);
  });

  test('creates an ellipse by dragging', async ({ page }) => {
    await toolButton(page, 'Ellipse').click();
    const a = await worldToScreen(page, 100, 100);
    const b = await worldToScreen(page, 200, 160);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 5 });
    await page.mouse.up();
    await expectShapeCount(page, 1);
    await expectSelectedCount(page, 1);
    await waitSaved(page);
    const shapes = await readShapes(page);
    expect(shapes[0].type).toBe('ellipse');
    expect(shapes[0].rect).toMatchObject({ x: 100, y: 100, w: 100, h: 60 });
  });

  test('creates a line by dragging', async ({ page }) => {
    await toolButton(page, 'Line').click();
    const a = await worldToScreen(page, 300, 300);
    const b = await worldToScreen(page, 420, 340);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 5 });
    await page.mouse.up();
    await expectShapeCount(page, 1);
    await waitSaved(page);
    const shapes = await readShapes(page);
    expect(shapes[0].type).toBe('line');
    const line = shapes[0] as unknown as { x1: number; y1: number; x2: number; y2: number };
    expect(line.x1).toBeCloseTo(300, 0);
    expect(line.y1).toBeCloseTo(300, 0);
    expect(line.x2).toBeCloseTo(420, 0);
    expect(line.y2).toBeCloseTo(340, 0);
  });

  test('creates an arrow by dragging', async ({ page }) => {
    await toolButton(page, 'Arrow').click();
    const a = await worldToScreen(page, 500, 500);
    const b = await worldToScreen(page, 600, 520);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 5 });
    await page.mouse.up();
    await expectShapeCount(page, 1);
    await waitSaved(page);
    const shapes = await readShapes(page);
    expect(shapes[0].type).toBe('arrow');
  });

  test('tiny line drags are discarded', async ({ page }) => {
    await toolButton(page, 'Line').click();
    const a = await worldToScreen(page, 300, 300);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + 1, a.y + 1);
    await page.mouse.up();
    await expectShapeCount(page, 0);
  });

  test('arrow endpoints snap to nearby shape corners', async ({ page }) => {
    // A rectangle first, then start the arrow right next to its corner.
    await toolButton(page, 'Rectangle').click();
    const r1 = await worldToScreen(page, 100, 100);
    const r2 = await worldToScreen(page, 200, 200);
    await page.mouse.move(r1.x, r1.y);
    await page.mouse.down();
    await page.mouse.move(r2.x, r2.y, { steps: 3 });
    await page.mouse.up();
    await expectShapeCount(page, 1);
    await closePanel(page);

    await toolButton(page, 'Arrow').click();
    // Start 5 world units away from the rect corner (100,100) — within snap radius.
    const a = await worldToScreen(page, 105, 105);
    const b = await worldToScreen(page, 400, 400);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 5 });
    await page.mouse.up();
    await expectShapeCount(page, 2);
    await waitSaved(page);
    const shapes = await readShapes(page);
    const arrow = shapes.find((s) => s.type === 'arrow') as unknown as {
      x1: number;
      y1: number;
    };
    expect(arrow.x1).toBe(100);
    expect(arrow.y1).toBe(100);
  });
});

test.describe('text tool', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expectShapeCount(page, 0);
  });

  test('click creates a text box and commits typed text with Enter', async ({ page }) => {
    await toolButton(page, 'Text').click();
    const p = await worldToScreen(page, 200, 200);
    await page.mouse.click(p.x, p.y);
    const editor = page.getByLabel('Edit text');
    await expect(editor).toBeVisible();
    await page.keyboard.type('hello whiteboard');
    await page.keyboard.press('Enter');
    await expect(editor).toBeHidden();
    await expectShapeCount(page, 1);
    await expectSelectedCount(page, 1);
    await waitSaved(page);
    const shapes = await readShapes(page);
    expect(shapes[0].type).toBe('text');
    expect((shapes[0] as unknown as { text: string }).text).toBe('hello whiteboard');
  });

  test('Shift+Enter inserts a newline, Escape cancels', async ({ page }) => {
    await toolButton(page, 'Text').click();
    const p = await worldToScreen(page, 200, 200);
    await page.mouse.click(p.x, p.y);
    await page.keyboard.type('line one');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('line two');
    await page.keyboard.press('Enter');
    await waitSaved(page);
    const shapes = await readShapes(page);
    expect((shapes[0] as unknown as { text: string }).text).toBe('line one\nline two');

    // Escape on a fresh empty box removes the husk.
    await toolButton(page, 'Text').click();
    const q = await worldToScreen(page, 400, 400);
    await page.mouse.click(q.x, q.y);
    await expect(page.getByLabel('Edit text')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('Edit text')).toBeHidden();
    await expectShapeCount(page, 1);
  });

  test('double-click edits existing text', async ({ page }) => {
    await toolButton(page, 'Text').click();
    const p = await worldToScreen(page, 200, 200);
    await page.mouse.click(p.x, p.y);
    const editor = page.getByLabel('Edit text');
    await page.keyboard.type('first');
    await page.keyboard.press('Enter');
    await expectShapeCount(page, 1);
    await waitSaved(page);

    // Double-click the middle of the text shape (the fitted box is shorter
    // than the original click point, so target its center).
    const shapes = await readShapes(page);
    const r = shapes[0].rect;
    const center = await worldToScreen(page, r.x + r.w / 2, r.y + r.h / 2);
    await page.mouse.dblclick(center.x, center.y);
    await expect(editor).toBeVisible();
    await expect(editor).toHaveValue('first');
    await page.keyboard.press('End');
    await page.keyboard.type(' second');
    await page.keyboard.press('Enter');
    await waitSaved(page);
    const shapes2 = await readShapes(page);
    expect((shapes2[0] as unknown as { text: string }).text).toBe('first second');
  });

  test('drag creates a sized text box', async ({ page }) => {
    await toolButton(page, 'Text').click();
    const box = await canvasBox(page);
    void box;
    const a = await worldToScreen(page, 100, 100);
    const b = await worldToScreen(page, 400, 160);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByLabel('Edit text')).toBeVisible();
    await page.keyboard.type('sized');
    await page.keyboard.press('Enter');
    await waitSaved(page);
    const shapes = await readShapes(page);
    expect(shapes[0].rect.w).toBeCloseTo(300, 0);
  });
});
