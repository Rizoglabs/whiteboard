import { expect, type Locator, type Page } from '@playwright/test';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface DocShape {
  id: string;
  type: string;
  rect: Rect;
  fill: string;
  stroke: string;
  strokeWidth: number;
}
export interface WhiteboardDoc {
  version: number;
  shapes: Record<string, DocShape>;
  order: string[];
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}
/** Must match INITIAL_CAMERA in src/ui/App.tsx. */
export const INITIAL_CAMERA: Camera = { x: -80, y: -80, zoom: 1 };

/** Read the persisted document straight from IndexedDB (bypasses the UI). */
export async function readDoc(page: Page): Promise<WhiteboardDoc | null> {
  return page.evaluate(
    () =>
      new Promise<WhiteboardDoc | null>((resolve, reject) => {
        const req = indexedDB.open('whiteboard-db', 1);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('documents', 'readonly');
          const get = tx.objectStore('documents').get('main');
          get.onsuccess = () => {
            const v = (get.result ?? null) as WhiteboardDoc | null;
            db.close();
            resolve(v);
          };
          get.onerror = () => reject(get.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function readShapes(page: Page): Promise<DocShape[]> {
  const doc = await readDoc(page);
  if (!doc) return [];
  return doc.order.map((id) => doc.shapes[id]).filter(Boolean);
}

export function statusbar(page: Page): Locator {
  return page.locator('.statusbar');
}

export async function expectShapeCount(page: Page, n: number): Promise<void> {
  const word = n === 1 ? 'shape' : 'shapes';
  await expect(statusbar(page).getByText(`${n} ${word}`, { exact: true })).toBeVisible();
}

export async function expectSelectedCount(page: Page, n: number): Promise<void> {
  await expect(statusbar(page).getByText(`${n} selected`, { exact: true })).toBeVisible();
}

export async function expectZoom(page: Page, pct: string): Promise<void> {
  await expect(statusbar(page).getByText(pct, { exact: true })).toBeVisible();
}

/** Wait until the debounced autosave has flushed ("Saved ✓"). */
export async function waitSaved(page: Page): Promise<void> {
  await expect(page.getByText('Saved ✓', { exact: true })).toBeVisible({ timeout: 15_000 });
}

export async function canvasBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  return box;
}

/** World coordinates -> CSS pixels relative to the page. */
export async function worldToScreen(
  page: Page,
  wx: number,
  wy: number,
  cam: Camera = INITIAL_CAMERA,
): Promise<{ x: number; y: number }> {
  const box = await canvasBox(page);
  return {
    x: box.x + (wx - cam.x) * cam.zoom,
    y: box.y + (wy - cam.y) * cam.zoom,
  };
}

export function toolButton(page: Page, name: string): Locator {
  return page.getByRole('button', { name, exact: true });
}

/** Draw a rectangle with world-space corners (x1,y1)-(x2,y2). Leaves the shape selected. */
export async function createRect(
  page: Page,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  steps = 5,
): Promise<void> {
  await toolButton(page, 'Rectangle').click();
  const a = await worldToScreen(page, x1, y1);
  const b = await worldToScreen(page, x2, y2);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps });
  await page.mouse.up();
}

/** Numeric assertion with tolerance for float rounding across the pipeline. */
export function closeTo(actual: number, expected: number, epsilon = 1.5): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(epsilon);
}
