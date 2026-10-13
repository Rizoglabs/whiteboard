import { describe, expect, it } from 'vitest';
import {
  addShapeAction,
  deleteShapesAction,
  History,
  moveShapesAction,
  resizeShapeAction,
} from './history';
import { emptyDocument, type RectangleShape } from './scene';

function rectShape(id: string, x: number, y: number, w = 50, h = 40): RectangleShape {
  return {
    id,
    type: 'rectangle',
    rect: { x, y, w, h },
    fill: '#fff',
    stroke: '#000',
    strokeWidth: 2,
  };
}

describe('History add/undo/redo', () => {
  it('adds, undoes and redoes a shape', () => {
    const h = new History(emptyDocument());
    expect(h.canUndo).toBe(false);

    h.execute(addShapeAction(rectShape('a', 10, 10)));
    expect(h.document.order).toEqual(['a']);
    expect(h.canUndo).toBe(true);

    h.undo();
    expect(h.document.order).toEqual([]);
    expect(h.canRedo).toBe(true);

    h.redo();
    expect(h.document.order).toEqual(['a']);
    expect(h.document.shapes['a'].rect).toEqual({ x: 10, y: 10, w: 50, h: 40 });
  });

  it('clears the redo stack on a new action', () => {
    const h = new History(emptyDocument());
    h.execute(addShapeAction(rectShape('a', 0, 0)));
    h.undo();
    expect(h.canRedo).toBe(true);
    h.execute(addShapeAction(rectShape('b', 0, 0)));
    expect(h.canRedo).toBe(false);
    expect(h.document.order).toEqual(['b']);
  });

  it('undo/redo on empty stacks are no-ops', () => {
    const h = new History(emptyDocument());
    expect(() => h.undo()).not.toThrow();
    expect(() => h.redo()).not.toThrow();
  });
});

describe('History move', () => {
  it('restores the original rect on undo', () => {
    const h = new History(emptyDocument());
    h.execute(addShapeAction(rectShape('a', 10, 10)));
    h.execute(
      moveShapesAction([{ id: 'a', from: { x: 10, y: 10, w: 50, h: 40 }, to: { x: 99, y: 99, w: 50, h: 40 } }]),
    );
    expect(h.document.shapes['a'].rect.x).toBe(99);

    h.undo();
    expect(h.document.shapes['a'].rect).toEqual({ x: 10, y: 10, w: 50, h: 40 });

    h.redo();
    expect(h.document.shapes['a'].rect.x).toBe(99);
  });
});

describe('History resize', () => {
  it('restores the original rect on undo', () => {
    const h = new History(emptyDocument());
    h.execute(addShapeAction(rectShape('a', 10, 10)));
    h.execute(resizeShapeAction('a', { x: 10, y: 10, w: 50, h: 40 }, { x: 10, y: 10, w: 200, h: 5 }));
    expect(h.document.shapes['a'].rect.w).toBe(200);

    h.undo();
    expect(h.document.shapes['a'].rect).toEqual({ x: 10, y: 10, w: 50, h: 40 });
  });
});

describe('History delete', () => {
  it('restores shapes and z-order on undo', () => {
    const h = new History(emptyDocument());
    h.execute(addShapeAction(rectShape('a', 0, 0)));
    h.execute(addShapeAction(rectShape('b', 10, 10)));
    h.execute(deleteShapesAction(h.document, ['a']));

    expect(h.document.order).toEqual(['b']);

    h.undo();
    expect(h.document.order).toEqual(['a', 'b']);
    expect(h.document.shapes['a']).toBeDefined();

    h.redo();
    expect(h.document.order).toEqual(['b']);
  });
});

describe('History loadDocument', () => {
  it('replaces the document and clears stacks', () => {
    const h = new History(emptyDocument());
    h.execute(addShapeAction(rectShape('a', 0, 0)));
    const other = emptyDocument();
    h.loadDocument(other);
    expect(h.document).toBe(other);
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
  });
});
