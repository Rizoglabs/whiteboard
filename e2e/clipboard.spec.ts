import { expect, test } from '@playwright/test';
import {
  createRect,
  expectSelectedCount,
  expectShapeCount,
  readShapes,
  waitSaved,
} from './helpers';

test.describe('clipboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expectShapeCount(page, 0);
    await createRect(page, 100, 100, 200, 180);
    await waitSaved(page);
  });

  test('Ctrl+C / Ctrl+V pastes a copy offset down-right', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+c');
    await page.keyboard.press('ControlOrMeta+v');
    await expectShapeCount(page, 2);
    await expectSelectedCount(page, 1); // the pasted copy is selected
    await waitSaved(page);
    const shapes = await readShapes(page);
    expect(shapes[0].id).not.toBe(shapes[1].id);
    expect(shapes[1].rect.x).toBe(shapes[0].rect.x + 24);
    expect(shapes[1].rect.y).toBe(shapes[0].rect.y + 24);
    expect(shapes[1].fill).toBe(shapes[0].fill);
  });

  test('Ctrl+D duplicates in one undoable step', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+d');
    await expectShapeCount(page, 2);
    await page.keyboard.press('ControlOrMeta+z');
    await expectShapeCount(page, 1);
  });

  test('Ctrl+A selects everything', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+c');
    await page.keyboard.press('ControlOrMeta+v');
    await page.keyboard.press('Escape'); // clear selection
    await expectSelectedCount(page, 0);
    await page.keyboard.press('ControlOrMeta+a');
    await expectSelectedCount(page, 2);
  });

  test('paste with empty clipboard does nothing', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+v');
    await expectShapeCount(page, 1);
  });
});
