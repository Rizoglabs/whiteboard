import { test, expect } from '@playwright/test';
import {
  canvasBox,
  closeTo,
  createRect,
  expectSelectedCount,
  expectShapeCount,
  readShapes,
  toolButton,
  waitSaved,
  worldToScreen,
} from './helpers';

const viewports = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'small-phone', width: 360, height: 740 },
];

for (const vp of viewports) {
  test.describe(`${vp.name} ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('no horizontal overflow, toolbar usable, create works', async ({ page }) => {
      await page.goto('/');
      await waitSaved(page);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);

      const buttons = await page.getByRole('button').all();
      expect(buttons.length).toBeGreaterThan(5);
      for (const btn of buttons) {
        const box = await btn.boundingBox();
        expect(box, `button "${await btn.textContent()}" has a box`).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(-1);
        expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1);
      }

      const cbox = await canvasBox(page);
      expect(cbox.width).toBeGreaterThan(200);
      expect(cbox.height).toBeGreaterThan(200);

      await createRect(page, 100, 100, 220, 200);
      await expectShapeCount(page, 1);
    });
  });
}

test.describe('touch', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test('canvas opts out of browser touch gestures', async ({ page }) => {
    await page.goto('/');
    const touchAction = await page.evaluate(
      () => getComputedStyle(document.querySelector('canvas')!).touchAction,
    );
    expect(touchAction).toBe('none');
  });

  test('single-finger touch drag creates a rectangle', async ({ page }) => {
    await page.goto('/');
    await waitSaved(page);
    await toolButton(page, 'Rectangle').tap();

    const a = await worldToScreen(page, 100, 100);
    const b = await worldToScreen(page, 220, 200);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: a.x, y: a.y, id: 1 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: b.x, y: b.y, id: 1 }],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    await expectShapeCount(page, 1);
    await waitSaved(page);
    const shapes = await readShapes(page);
    expect(shapes).toHaveLength(1);
    closeTo(shapes[0].rect.x, 100);
    closeTo(shapes[0].rect.y, 100);
    closeTo(shapes[0].rect.w, 120);
    closeTo(shapes[0].rect.h, 100);
  });
});

test.describe('pointer robustness (desktop)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('pointercancel discards an in-progress create', async ({ page }) => {
    await page.goto('/');
    await waitSaved(page);
    // Record the real pointer id so the synthetic cancel targets it.
    await page.evaluate(() => {
      (window as unknown as { __pids: number[] }).__pids = [];
      document.querySelector('canvas')!.addEventListener('pointerdown', (e) => {
        (window as unknown as { __pids: number[] }).__pids.push(
          (e as PointerEvent).pointerId,
        );
      });
    });
    await toolButton(page, 'Rectangle').click();
    const a = await worldToScreen(page, 100, 100);
    const b = await worldToScreen(page, 200, 180);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 3 });
    await page.evaluate(() => {
      const pid = (window as unknown as { __pids: number[] }).__pids[0];
      document.querySelector('canvas')!.dispatchEvent(
        new PointerEvent('pointercancel', { pointerId: pid, bubbles: true, cancelable: true }),
      );
    });
    await page.mouse.up();
    await expectShapeCount(page, 0);
    await waitSaved(page);
    expect(await readShapes(page)).toHaveLength(0);
  });

  test('a second pointer during an active drag is ignored', async ({ page }) => {
    await page.goto('/');
    await waitSaved(page);
    await createRect(page, 100, 100, 200, 180);
    // Synthetic pointer events carry fake ids; keep setPointerCapture from throwing.
    await page.evaluate(() => {
      const c = document.querySelector('canvas') as HTMLCanvasElement;
      const orig = c.setPointerCapture.bind(c);
      c.setPointerCapture = (pid: number) => {
        try {
          orig(pid);
        } catch {
          /* synthetic pointer in test harness */
        }
      };
    });
    const center = await worldToScreen(page, 150, 140);
    await page.mouse.move(center.x, center.y);
    await page.mouse.down(); // real pointer: move mode
    await page.mouse.move(center.x + 30, center.y, { steps: 2 });
    // Second finger lands on empty space mid-drag.
    const empty = await worldToScreen(page, 500, 500);
    await page.evaluate(([x, y]: number[]) => {
      document.querySelector('canvas')!.dispatchEvent(
        new PointerEvent('pointerdown', {
          pointerId: 999,
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
        }),
      );
    }, [empty.x, empty.y]);
    await page.mouse.move(center.x + 60, center.y, { steps: 2 });
    await page.mouse.up();
    await waitSaved(page);
    // The real drag must commit fully; selection must survive.
    await expectSelectedCount(page, 1);
    const shapes = await readShapes(page);
    expect(shapes).toHaveLength(1);
    closeTo(shapes[0].rect.x, 160);
    closeTo(shapes[0].rect.y, 100);
  });

  test('drag continues when the pointer leaves the canvas (pointer capture)', async ({
    page,
  }) => {
    await page.goto('/');
    await waitSaved(page);
    await toolButton(page, 'Rectangle').click();
    const a = await worldToScreen(page, 100, 100);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    // Drag up over the toolbar (outside the canvas element).
    await page.mouse.move(a.x + 100, 8, { steps: 5 });
    await page.mouse.up();
    await expectShapeCount(page, 1);
    await waitSaved(page);
    const shapes = await readShapes(page);
    expect(shapes).toHaveLength(1);
    // The drag end point (y=8, above the canvas) must still be tracked.
    closeTo(shapes[0].rect.w, 100, 4);
    expect(shapes[0].rect.y).toBeLessThan(100);
  });
});
