import { describe, expect, it } from 'vitest';
import {
  addShapesAction,
  History,
  moveShapesAction,
  patchShapesAction,
  reorderShapesAction,
  replaceDocumentAction,
  resizeShapeAction,
} from './history';
import {
  addShape,
  emptyDocument,
  makeArrow,
  makeLine,
  makeRectangle,
  makeText,
  type Shape,
} from './scene';

function rect(id: string, x: number): Shape {
  return { ...makeRectangle({ x, y: 0, w: 10, h: 10 }), id };
}

describe('moveShapesAction with lines', () => {
  it('translates line endpoints on move and reverts them', () => {
    const line = makeLine(10, 10, 60, 60);
    let doc = addShape(emptyDocument(), line);
    const h = new History(doc);
    doc = h.document;
    const from = { ...line.rect };
    const to = { ...line.rect, x: line.rect.x + 20, y: line.rect.y + 20 };
    h.execute(moveShapesAction([{ id: line.id, from, to }]));
    const moved = h.document.shapes[line.id];
    expect(moved.type).toBe('line');
    if (moved.type === 'line') {
      expect(moved.x1).toBe(30);
      expect(moved.y2).toBe(80);
    }
    h.undo();
    const back = h.document.shapes[line.id];
    expect(back.type).toBe('line');
    if (back.type === 'line') expect(back.x1).toBe(10);
  });
});

describe('resizeShapeAction with arrows', () => {
  it('remaps arrow endpoints proportionally', () => {
    const arrow = makeArrow(0, 0, 100, 50);
    const h = new History(addShape(emptyDocument(), arrow));
    const from = { ...arrow.rect };
    const to = { x: 0, y: 0, w: 200, h: 50 };
    h.execute(resizeShapeAction(arrow.id, from, to));
    const r = h.document.shapes[arrow.id];
    expect(r.type).toBe('arrow');
    if (r.type === 'arrow') expect(r.x2).toBe(200);
    h.undo();
    const back = h.document.shapes[arrow.id];
    if (back.type === 'arrow') expect(back.x2).toBe(100);
  });
});

describe('patchShapesAction', () => {
  it('applies and reverts property changes', () => {
    const s = makeRectangle({ x: 0, y: 0, w: 10, h: 10 });
    const h = new History(addShape(emptyDocument(), s));
    const after: Shape = { ...s, fill: '#ff0000', strokeWidth: 5 };
    h.execute(patchShapesAction([{ id: s.id, before: s, after }]));
    expect(h.document.shapes[s.id].fill).toBe('#ff0000');
    h.undo();
    expect(h.document.shapes[s.id].fill).toBe(s.fill);
    h.redo();
    expect(h.document.shapes[s.id].strokeWidth).toBe(5);
  });

  it('edits text content', () => {
    const s = makeText({ x: 0, y: 0, w: 100, h: 30 }, 'old');
    const h = new History(addShape(emptyDocument(), s));
    const after: Shape = { ...s, text: 'new' };
    h.execute(patchShapesAction([{ id: s.id, before: s, after }], 'Edit text'));
    const got = h.document.shapes[s.id];
    expect(got.type).toBe('text');
    if (got.type === 'text') expect(got.text).toBe('new');
  });
});

describe('addShapesAction', () => {
  it('adds several shapes and removes them on undo', () => {
    const h = new History(emptyDocument());
    const shapes = [rect('a', 0), rect('b', 20)];
    h.execute(addShapesAction(shapes, 'Paste'));
    expect(h.document.order).toEqual(['a', 'b']);
    h.undo();
    expect(h.document.order).toEqual([]);
  });
});

describe('reorderShapesAction', () => {
  it('reorders and restores order on undo', () => {
    let doc = emptyDocument();
    for (const [id, x] of [['a', 0], ['b', 10], ['c', 20]] as const) {
      doc = addShape(doc, rect(id, x));
    }
    const h = new History(doc);
    h.execute(reorderShapesAction(['a', 'b', 'c'], ['c', 'a', 'b']));
    expect(h.document.order).toEqual(['c', 'a', 'b']);
    h.undo();
    expect(h.document.order).toEqual(['a', 'b', 'c']);
  });
});

describe('replaceDocumentAction', () => {
  it('replaces the document and restores it on undo', () => {
    const before = addShape(emptyDocument(), rect('a', 0));
    const after = addShape(emptyDocument(), rect('z', 99));
    const h = new History(before);
    h.execute(replaceDocumentAction(before, after));
    expect(h.document.order).toEqual(['z']);
    h.undo();
    expect(h.document.order).toEqual(['a']);
  });
});
