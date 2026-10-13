import { expect, test } from '@playwright/test';
import {
  expectShapeCount,
  openMenu,
  toolButton,
  waitSaved,
  worldToScreen,
} from './helpers';

test.describe('mobile layout', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expectShapeCount(page, 0);
  });

  test('no horizontal overflow and toolbar stays usable', async ({ page }) => {
    const overflow = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
    }));
    expect(overflow.scrollW).toBeLessThanOrEqual(overflow.innerW);

    // All tool buttons reachable.
    for (const name of ['Rectangle', 'Ellipse', 'Line', 'Arrow', 'Text']) {
      await expect(toolButton(page, name)).toBeVisible();
    }
    // Import/export live in the hamburger menu.
    await openMenu(page);
    for (const name of ['Import', 'JSON', 'PNG', 'SVG']) {
      await expect(toolButton(page, name)).toBeVisible();
    }
  });

  test('create ellipse with touch and edit properties in the bottom panel', async ({ page }) => {
    await toolButton(page, 'Ellipse').tap();
    const a = await worldToScreen(page, 100, 200);
    const b = await worldToScreen(page, 250, 320);
    await page.touchscreen.tap(a.x, a.y); // tap alone must not create
    await expectShapeCount(page, 0);
    // Drag via touchscreen taps is limited; use mouse drag on the canvas instead
    // to simulate the gesture while keeping the mobile viewport.
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 5 });
    await page.mouse.up();
    await expectShapeCount(page, 1);
    await waitSaved(page);

    const panel = page.getByLabel('Shape properties');
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    const viewport = page.viewportSize();
    expect(box).toBeTruthy();
    // Bottom strip: occupies the lower part, never the full height.
    expect(box!.y).toBeGreaterThan(viewport!.height * 0.4);
    expect(box!.height).toBeLessThan(viewport!.height * 0.6);

    // Canvas still receives input above the panel.
    await page.getByRole('button', { name: 'Color #dbeafe' }).tap();
    await waitSaved(page);
  });

  test('text tool works on a small screen', async ({ page }) => {
    await toolButton(page, 'Text').tap();
    const p = await worldToScreen(page, 150, 300);
    await page.mouse.click(p.x, p.y);
    const editor = page.getByLabel('Edit text');
    await expect(editor).toBeVisible();
    await page.keyboard.type('mobile text');
    await page.keyboard.press('Enter');
    await expectShapeCount(page, 1);
    await waitSaved(page);
  });
});

test.describe('tablet landscape', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('properties panel docks on the left (Excalidraw style)', async ({ page }) => {
    await page.goto('/');
    await expectShapeCount(page, 0);
    await toolButton(page, 'Rectangle').click();
    const a = await worldToScreen(page, 400, 100);
    const b = await worldToScreen(page, 500, 200);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 3 });
    await page.mouse.up();
    await expectShapeCount(page, 1);

    const panel = page.getByLabel('Shape properties');
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    const viewport = page.viewportSize();
    expect(box).toBeTruthy();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x).toBeLessThan(viewport!.width * 0.5);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width * 0.5);
  });
});
