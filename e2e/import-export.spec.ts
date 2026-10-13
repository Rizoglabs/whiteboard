import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  createRect,
  expectShapeCount,
  readShapes,
  toolButton,
  waitSaved,
  worldToScreen,
} from './helpers';

test.describe('import / export', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expectShapeCount(page, 0);
  });

  test('JSON export downloads and re-imports with a full round-trip', async ({ page }) => {
    await createRect(page, 100, 100, 200, 180);
    await toolButton(page, 'Text').click();
    const p = await worldToScreen(page, 300, 300);
    await page.mouse.click(p.x, p.y);
    await page.keyboard.type('roundtrip');
    await page.keyboard.press('Enter');
    await expectShapeCount(page, 2);
    await waitSaved(page);
    const before = await readShapes(page);

    // Export.
    const downloadPromise = page.waitForEvent('download');
    await toolButton(page, 'JSON').click();
    const download = await downloadPromise;
    const tmp = await download.path();
    expect(tmp).toBeTruthy();
    const exported = JSON.parse(fs.readFileSync(tmp!, 'utf-8')) as {
      app: string;
      schemaVersion: number;
      document: { order: string[] };
    };
    expect(exported.app).toBe('rizoglabs-whiteboard');
    expect(exported.document.order).toHaveLength(2);

    // Delete everything, then import the file back.
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Delete');
    await expectShapeCount(page, 0);

    await page.locator('input[type="file"]').setInputFiles(tmp!);
    await expect(page.getByText(/Import berhasil/)).toBeVisible();
    await expectShapeCount(page, 2);
    await waitSaved(page);
    const after = await readShapes(page);
    expect(after.map((s) => s.type).sort()).toEqual(before.map((s) => s.type).sort());
    const textAfter = after.find((s) => s.type === 'text') as unknown as { text: string };
    expect(textAfter.text).toBe('roundtrip');

    // Import is undoable.
    await toolButton(page, 'Undo').click();
    await expectShapeCount(page, 0);
  });

  test('invalid import shows an error and leaves the canvas untouched', async ({ page }) => {
    await createRect(page, 100, 100, 200, 180);
    await waitSaved(page);

    const bad = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wb-')), 'bad.json');
    fs.writeFileSync(bad, '{ this is not valid json !!!');
    await page.locator('input[type="file"]').setInputFiles(bad);
    await expect(page.getByText(/Import gagal/)).toBeVisible();
    await expectShapeCount(page, 1);
    const shapes = await readShapes(page);
    expect(shapes).toHaveLength(1);
    expect(shapes[0].type).toBe('rectangle');
  });

  test('PNG and SVG exports download files', async ({ page }) => {
    await createRect(page, 100, 100, 200, 180);
    await waitSaved(page);

    const pngPromise = page.waitForEvent('download');
    await toolButton(page, 'PNG').click();
    const png = await pngPromise;
    expect(png.suggestedFilename()).toMatch(/\.png$/);
    const pngPath = await png.path();
    expect(fs.statSync(pngPath!).size).toBeGreaterThan(1000);

    const svgPromise = page.waitForEvent('download');
    await toolButton(page, 'SVG').click();
    const svg = await svgPromise;
    expect(svg.suggestedFilename()).toMatch(/\.svg$/);
    const svgText = fs.readFileSync((await svg.path())!, 'utf-8');
    expect(svgText).toContain('<svg');
    expect(svgText).toContain('<rect');
  });

  test('exporting an empty canvas reports the problem instead of downloading', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download', { timeout: 3000 }).catch(() => null);
    await toolButton(page, 'PNG').click();
    const download = await downloadPromise;
    expect(download).toBeNull();
    await expect(page.getByText(/Export PNG gagal/)).toBeVisible();
  });
});
