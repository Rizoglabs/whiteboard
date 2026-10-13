import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearDocument, loadDocument, saveDocument } from './persistence';
import { addShape, emptyDocument, type RectangleShape, type WhiteboardDocument } from './scene';

function sampleDoc(): WhiteboardDocument {
  const shape: RectangleShape = {
    id: 's1',
    type: 'rectangle',
    rect: { x: 12, y: 34, w: 100, h: 60 },
    fill: '#fef3c7',
    stroke: '#b45309',
    strokeWidth: 2,
  };
  return addShape(emptyDocument(), shape);
}

beforeEach(async () => {
  await clearDocument();
});

describe('persistence', () => {
  it('returns null when nothing was saved', async () => {
    expect(await loadDocument()).toBeNull();
  });

  it('round-trips a document through IndexedDB', async () => {
    const doc = sampleDoc();
    await saveDocument(doc);
    const loaded = await loadDocument();
    expect(loaded).toEqual(doc);
  });

  it('latest save wins', async () => {
    await saveDocument(sampleDoc());
    const second = addShape(sampleDoc(), {
      id: 's2',
      type: 'rectangle',
      rect: { x: 0, y: 0, w: 10, h: 10 },
      fill: '#fff',
      stroke: '#000',
      strokeWidth: 1,
    });
    await saveDocument(second);
    const loaded = await loadDocument();
    expect(loaded?.order).toEqual(['s1', 's2']);
  });

  it('clear removes the stored document', async () => {
    await saveDocument(sampleDoc());
    await clearDocument();
    expect(await loadDocument()).toBeNull();
  });
});
