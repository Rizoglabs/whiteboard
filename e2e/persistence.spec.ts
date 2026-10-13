import { test, expect } from '@playwright/test';
import {
  createRect,
  expectSelectedCount,
  expectShapeCount,
  readShapes,
  waitSaved,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitSaved(page);
});

test('autosave debounces rapid actions into a single write', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __putCount: number }).__putCount = 0;
    const proto = IDBObjectStore.prototype;
    const orig = proto.put;
    proto.put = function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ): IDBRequest<IDBValidKey> {
      (window as unknown as { __putCount: number }).__putCount += 1;
      return orig.call(this, value, key);
    };
  });
  await page.reload();
  await waitSaved(page);

  // Two back-to-back creates must collapse into one debounced save.
  await createRect(page, 100, 100, 200, 180, 2);
  await createRect(page, 300, 300, 380, 360, 2);
  await page.waitForTimeout(1500);
  const puts = await page.evaluate(
    () => (window as unknown as { __putCount: number }).__putCount,
  );
  expect(puts).toBe(1);
  await expectShapeCount(page, 2);
  await waitSaved(page);
});

test('save status transitions through saving to saved', async ({ page }) => {
  await createRect(page, 100, 100, 200, 180);
  await expect(page.getByText('Saving…', { exact: true })).toBeVisible({ timeout: 3000 });
  await waitSaved(page);
});

test('document is restored after reload', async ({ page }) => {
  await createRect(page, 100, 100, 200, 180);
  await createRect(page, 300, 300, 380, 360);
  await waitSaved(page);
  const before = (await readShapes(page)).map((s) => s.rect);
  await page.reload();
  await waitSaved(page);
  await expectShapeCount(page, 2);
  await expectSelectedCount(page, 0);
  const after = (await readShapes(page)).map((s) => s.rect);
  expect(after).toEqual(before);
});

test('IndexedDB failure surfaces a save error in the UI', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
  });
  await page.reload();
  const err = page.locator('.save-error');
  await expect(err).toContainText('Save failed', { timeout: 10_000 });
});

test('corrupt stored document is ignored on load', async ({ page }) => {
  // Seed garbage directly into the store, then load a second page in the
  // same context (so page 1's beforeunload flush cannot overwrite it).
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('whiteboard-db', 1);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('documents', 'readwrite');
          tx.objectStore('documents').put({ garbage: true, version: 999 }, 'main');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );
  const page2 = await page.context().newPage();
  await page2.goto('/');
  await expect(page2.getByText('0 shapes', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page2.getByText('Saved ✓', { exact: true })).toBeVisible();
  await page2.close();
});
