import { describe, expect, it } from 'vitest';
import {
  bringForward,
  bringToFront,
  cloneShape,
  makeArrow,
  makeEllipse,
  makeLine,
  makeRectangle,
  makeText,
  resizedShape,
  sendBackward,
  sendToBack,
  shapeHit,
  translatedShape,
} from './scene';

describe('shape factories', () => {
  it('creates an ellipse with defaults', () => {
    const s = makeEllipse({ x: 0, y: 0, w: 40, h: 30 });
    expect(s.type).toBe('ellipse');
    expect(s.opacity).toBe(1);
    expect(s.id).toMatch(/^shape-/);
  });

  it('creates a line with endpoints and a derived bbox', () => {
    const s = makeLine(10, 20, 60, 80);
    expect(s.type).toBe('line');
    expect(s.x1).toBe(10);
    expect(s.y2).toBe(80);
    expect(s.rect.x).toBe(10);
    expect(s.rect.w).toBe(50);
    expect(s.fill).toBe('none');
  });

  it('creates text with defaults', () => {
    const s = makeText({ x: 0, y: 0, w: 200, h: 40 }, 'hello');
    expect(s.type).toBe('text');
    expect(s.text).toBe('hello');
    expect(s.fontSize).toBe(24);
    expect(s.align).toBe('left');
  });
});

describe('translatedShape', () => {
  it('moves a rectangle rect', () => {
    const s = makeRectangle({ x: 0, y: 0, w: 10, h: 10 });
    const m = translatedShape(s, 5, -3);
    expect(m.rect).toMatchObject({ x: 5, y: -3 });
  });

  it('moves line endpoints together with the bbox', () => {
    const s = makeLine(10, 20, 60, 80);
    const m = translatedShape(s, 5, 5);
    expect(m.type).toBe('line');
    if (m.type === 'line') {
      expect(m.x1).toBe(15);
      expect(m.y1).toBe(25);
      expect(m.x2).toBe(65);
      expect(m.y2).toBe(85);
    }
    expect(m.rect.x).toBe(15);
  });
});

describe('resizedShape', () => {
  it('resizes a rectangle bbox', () => {
    const s = makeRectangle({ x: 0, y: 0, w: 10, h: 10 });
    const r = resizedShape(s, { x: 0, y: 0, w: 30, h: 20 });
    expect(r.rect).toMatchObject({ w: 30, h: 20 });
  });

  it('remaps arrow endpoints proportionally', () => {
    const s = makeArrow(0, 0, 100, 50);
    const r = resizedShape(s, { x: 0, y: 0, w: 200, h: 50 });
    expect(r.type).toBe('arrow');
    if (r.type === 'arrow') {
      expect(r.x2).toBe(200);
      expect(r.y2).toBe(50);
      expect(r.x1).toBe(0);
    }
  });
});

describe('shapeHit', () => {
  it('hit-tests ellipse by inscribed ellipse, not bbox corners', () => {
    const s = makeEllipse({ x: 0, y: 0, w: 100, h: 100 });
    expect(shapeHit(s, 50, 50)).toBe(true);
    expect(shapeHit(s, 2, 2)).toBe(false); // corner of bbox, outside ellipse
    expect(shapeHit(s, 2, 2, 30)).toBe(true); // ...but inside with tolerance
  });

  it('hit-tests lines by distance to segment', () => {
    const s = makeLine(0, 0, 100, 0);
    expect(shapeHit(s, 50, 1, 3)).toBe(true);
    expect(shapeHit(s, 50, 20, 3)).toBe(false);
    expect(shapeHit(s, 50, 20, 0)).toBe(false);
  });

  it('hit-tests text by bbox', () => {
    const s = makeText({ x: 0, y: 0, w: 100, h: 30 }, 'hi');
    expect(shapeHit(s, 10, 10)).toBe(true);
    expect(shapeHit(s, 200, 200)).toBe(false);
  });
});

describe('z-order helpers', () => {
  const order = ['a', 'b', 'c', 'd'];

  it('bringForward swaps each selected id with its next neighbor', () => {
    expect(bringForward(order, ['b'])).toEqual(['a', 'c', 'b', 'd']);
    expect(bringForward(order, ['d'])).toEqual(order); // already topmost
    expect(bringForward(order, ['b', 'c'])).toEqual(['a', 'd', 'b', 'c']);
  });

  it('sendBackward swaps each selected id with its previous neighbor', () => {
    expect(sendBackward(order, ['c'])).toEqual(['a', 'c', 'b', 'd']);
    expect(sendBackward(order, ['a'])).toEqual(order);
  });

  it('bringToFront / sendToBack preserve relative order', () => {
    expect(bringToFront(order, ['a', 'c'])).toEqual(['b', 'd', 'a', 'c']);
    expect(sendToBack(order, ['b', 'd'])).toEqual(['b', 'd', 'a', 'c']);
  });
});

describe('cloneShape', () => {
  it('deep-clones with a fresh id', () => {
    const s = makeText({ x: 1, y: 2, w: 50, h: 20 }, 'abc');
    const c = cloneShape(s);
    expect(c.id).not.toBe(s.id);
    expect(c).toMatchObject({ type: 'text', text: 'abc' });
    expect(c).not.toBe(s);
  });
});
