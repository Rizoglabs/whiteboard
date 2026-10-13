import { expect, test } from '@playwright/test';
import {
  createRect,
  expectSelectedCount,
  expectShapeCount,
  readShapes,
  toolButton,
  waitSaved,
  worldToScreen,
} from './helpers';

test.describe('properties panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expectShapeCount(page, 0);
    await createRect(page, 100, 100, 200, 180);
    await waitSaved(page);
  });

  test('changing fill applies to the selected shape and undoes', async ({ page }) => {
    const panel = page.getByLabel('Shape properties');
    await expect(panel).toBeVisible();
    await page.getByRole('button', { name: 'Color #dbeafe' }).click();
    await waitSaved(page);
    let shapes = await readShapes(page);
    expect(shapes[0].fill).toBe('#dbeafe');

    await toolButton(page, 'Undo').click();
    await waitSaved(page);
    shapes = await readShapes(page);
    expect(shapes[0].fill).toBe('#fef3c7');

    await toolButton(page, 'Redo').click();
    await waitSaved(page);
    shapes = await readShapes(page);
    expect(shapes[0].fill).toBe('#dbeafe');
  });

  test('stroke width and opacity sliders work', async ({ page }) => {
    await page.getByLabel('Stroke width').fill('9');
    await page.getByLabel('Opacity').fill('50');
    await waitSaved(page);
    const shapes = await readShapes(page);
    expect(shapes[0].strokeWidth).toBe(9);
    expect(shapes[0].opacity).toBe(0.5);
  });

  test('font size and alignment apply to text shapes', async ({ page }) => {
    await toolButton(page, 'Text').click();
    const p = await worldToScreen(page, 300, 300);
    await page.mouse.click(p.x, p.y);
    await page.keyboard.type('styled');
    await page.keyboard.press('Enter');
    await expectSelectedCount(page, 1);

    const panel = page.getByLabel('Shape properties');
    await expect(panel).toBeVisible();
    await page.getByLabel('Font size').fill('40');
    await page.getByRole('button', { name: 'Align center' }).click();
    await waitSaved(page);
    const shapes = await readShapes(page);
    const text = shapes.find((s) => s.type === 'text') as unknown as {
      fontSize: number;
      align: string;
    };
    expect(text.fontSize).toBe(40);
    expect(text.align).toBe('center');
  });

  test('panel closes when selection is cleared', async ({ page }) => {
    const panel = page.getByLabel('Shape properties');
    await expect(panel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  });
});
