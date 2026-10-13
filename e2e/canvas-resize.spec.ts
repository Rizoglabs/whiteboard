import { expect, test, type Page } from '@playwright/test';
import { createRect, expectShapeCount, worldToScreen } from './helpers';

/**
 * Regression test: on mobile the browser chrome (URL bar) showing/hiding
 * changes the viewport height, which resizes the canvas backing store.
 * Resetting canvas.width/height clears its bitmap — the app must schedule a
 * redraw, otherwise all shapes stay invisible until the next interaction.
 */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function samplePixel(page: Page, wx: number, wy: number): Promise<[number, number, number]> {
  const p = await worldToScreen(page, wx, wy);
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('no canvas box');
  return page.evaluate(({ x, y }) => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const d = ctx.getImageData(Math.round(x * dpr), Math.round(y * dpr), 3, 3).data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < 9; i++) {
      r += d[i * 4];
      g += d[i * 4 + 1];
      b += d[i * 4 + 2];
    }
    return [Math.round(r / 9), Math.round(g / 9), Math.round(b / 9)] as [number, number, number];
  }, { x: p.x - box.x, y: p.y - box.y });
}

function isRectFill(px: [number, number, number]): boolean {
  // Default rect fill #fef3c7 = (254, 243, 199).
  return Math.abs(px[0] - 254) < 30 && Math.abs(px[1] - 243) < 30 && Math.abs(px[2] - 199) < 30;
}

test('canvas redraws itself after a viewport resize with no further interaction', async ({ page }) => {
  await page.goto('/');
  await expectShapeCount(page, 0);
  await createRect(page, 100, 300, 200, 380);

  expect(isRectFill(await samplePixel(page, 150, 340))).toBe(true);

  // Simulate the mobile browser chrome showing/hiding.
  await page.setViewportSize({ width: 390, height: 700 });
  await page.waitForTimeout(500);

  // The shape must still be painted without any tap/drag in between.
  expect(isRectFill(await samplePixel(page, 150, 340))).toBe(true);
});
