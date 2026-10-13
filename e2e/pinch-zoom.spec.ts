import { test, expect, type Page } from '@playwright/test';
import { expectShapeCount, waitSaved } from './helpers';

/**
 * Pinch-to-zoom on touch devices (two fingers) and wheel zoom on desktop.
 * Touch gestures are driven through CDP so both fingers hit the page at once.
 */

async function readZoomPct(page: Page): Promise<number> {
  const text = await page.locator('.zoom-pill .zoom-pct').textContent();
  const m = text?.match(/(\d+)%/);
  if (!m) throw new Error(`cannot parse zoom from "${text}"`);
  return parseInt(m[1], 10);
}

interface TouchPoint {
  x: number;
  y: number;
  id: number;
}

/** Spread two fingers apart (pinch out) or bring them together (pinch in). */
async function pinch(page: Page, cx: number, cy: number, from: number, to: number) {
  // The whole gesture must run on one CDP session: the protocol requires
  // touchStart before any other touch event on the same session.
  const cdp = await page.context().newCDPSession(page);
  try {
    const p = (spread: number): TouchPoint[] => [
      { x: cx - spread / 2, y: cy, id: 1 },
      { x: cx + spread / 2, y: cy, id: 2 },
    ];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p(from)[0]] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: p(from) });
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: p(from + ((to - from) * i) / steps),
      });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await cdp.detach();
  }
  await page.waitForTimeout(300);
}

test.describe('pinch-to-zoom (mobile)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitSaved(page);
  });

  test('pinch out zooms in, pinch in zooms out', async ({ page }) => {
    expect(await readZoomPct(page)).toBe(100);
    await pinch(page, 195, 400, 100, 200); // fingers spread 100 -> 200
    const zoomedIn = await readZoomPct(page);
    expect(zoomedIn).toBeGreaterThan(100);

    await pinch(page, 195, 400, 200, 100); // fingers close 200 -> 100
    const zoomedOut = await readZoomPct(page);
    expect(zoomedOut).toBeLessThan(zoomedIn);
  });

  test('pinch creates no shapes and changes no selection', async ({ page }) => {
    await pinch(page, 195, 400, 100, 220);
    await expectShapeCount(page, 0);
    await expect(page.locator('.statusbar').getByText('0 selected', { exact: true })).toBeVisible();
  });

  test('moving both fingers together pans the camera without zooming', async ({ page }) => {
    const before = await readZoomPct(page);
    const cdp = await page.context().newCDPSession(page);
    const at = (dx: number): TouchPoint[] => [
      { x: 150 + dx, y: 400, id: 1 },
      { x: 250 + dx, y: 400, id: 2 },
    ];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at(0)[0]] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
    for (let i = 1; i <= 5; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i * 12) });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    await page.waitForTimeout(300);
    // Same spread => zoom unchanged, but the camera panned.
    expect(await readZoomPct(page)).toBe(before);
  });
});

test.describe('wheel zoom (desktop)', () => {
  test('scroll up zooms in, scroll down zooms out', async ({ page }) => {
    await page.goto('/');
    await waitSaved(page);
    expect(await readZoomPct(page)).toBe(100);

    await page.mouse.move(640, 360);
    await page.mouse.wheel(0, -240); // scroll up -> zoom in
    const zoomedIn = await readZoomPct(page);
    expect(zoomedIn).toBeGreaterThan(100);

    await page.mouse.wheel(0, 480); // scroll down -> zoom out
    const zoomedOut = await readZoomPct(page);
    expect(zoomedOut).toBeLessThan(zoomedIn);
  });
});
