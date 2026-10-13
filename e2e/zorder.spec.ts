import { expect, test } from '@playwright/test';
import {
  createRect,
  expectShapeCount,
  readDoc,
  toolButton,
  waitSaved,
  worldToScreen,
} from './helpers';

async function orderOf(page: Parameters<typeof readDoc>[0]): Promise<string[]> {
  const doc = await readDoc(page);
  return doc ? doc.order : [];
}

test.describe('z-order', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expectShapeCount(page, 0);
    await createRect(page, 0, 0, 40, 40); // a
    await createRect(page, 60, 0, 100, 40); // b
    await createRect(page, 120, 0, 160, 40); // c
    await waitSaved(page);
    expect(await orderOf(page)).toHaveLength(3);
  });

  test('bring forward / send backward via panel buttons', async ({ page }) => {
    const before = await orderOf(page);
    // Select the backmost shape (a) by clicking it.
    const p = await worldToScreen(page, 20, 20);
    await page.mouse.click(p.x, p.y);
    await page.getByRole('button', { name: 'Bring forward (Ctrl+])' }).click();
    await waitSaved(page);
    const after = await orderOf(page);
    expect(after).toEqual([before[1], before[0], before[2]]);

    await page.getByRole('button', { name: 'Send backward (Ctrl+[)' }).click();
    await waitSaved(page);
    expect(await orderOf(page)).toEqual(before);
  });

  test('bring to front / send to back', async ({ page }) => {
    const before = await orderOf(page);
    const p = await worldToScreen(page, 20, 20);
    await page.mouse.click(p.x, p.y);
    await page.getByRole('button', { name: 'Bring to front' }).click();
    await waitSaved(page);
    expect(await orderOf(page)).toEqual([before[1], before[2], before[0]]);

    await toolButton(page, 'Undo').click();
    await waitSaved(page);
    expect(await orderOf(page)).toEqual(before);
  });

  test('keyboard Ctrl+] reorders the selection', async ({ page }) => {
    const before = await orderOf(page);
    const p = await worldToScreen(page, 80, 20);
    await page.mouse.click(p.x, p.y); // select b
    await page.keyboard.press('ControlOrMeta+]');
    await waitSaved(page);
    expect(await orderOf(page)).toEqual([before[0], before[2], before[1]]);
  });
});
