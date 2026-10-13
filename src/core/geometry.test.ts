import { describe, expect, it } from 'vitest';
import {
  ALL_HANDLES,
  handleAtPoint,
  handlePosition,
  moveRect,
  normalizeRect,
  pointInRect,
  rectFromPoints,
  rectsIntersect,
  resizeRect,
  vec,
} from './geometry';

describe('normalizeRect', () => {
  it('keeps positive rects as-is', () => {
    expect(normalizeRect({ x: 10, y: 20, w: 30, h: 40 })).toEqual({ x: 10, y: 20, w: 30, h: 40 });
  });

  it('flips negative width/height to top-left origin', () => {
    expect(normalizeRect({ x: 10, y: 20, w: -30, h: -40 })).toEqual({ x: -20, y: -20, w: 30, h: 40 });
  });
});

describe('rectFromPoints', () => {
  it('builds the same rect regardless of drag direction', () => {
    const a = rectFromPoints(vec(10, 10), vec(50, 80));
    const b = rectFromPoints(vec(50, 80), vec(10, 10));
    expect(a).toEqual({ x: 10, y: 10, w: 40, h: 70 });
    expect(b).toEqual(a);
  });
});

describe('pointInRect', () => {
  const r = { x: 10, y: 10, w: 20, h: 20 };

  it('detects inside points', () => {
    expect(pointInRect(vec(15, 15), r)).toBe(true);
  });

  it('rejects outside points', () => {
    expect(pointInRect(vec(5, 15), r)).toBe(false);
    expect(pointInRect(vec(35, 35), r)).toBe(false);
  });

  it('includes edges', () => {
    expect(pointInRect(vec(10, 10), r)).toBe(true);
    expect(pointInRect(vec(30, 30), r)).toBe(true);
  });

  it('expands hit area with tolerance', () => {
    expect(pointInRect(vec(5, 15), r, 6)).toBe(true);
    expect(pointInRect(vec(5, 15), r, 4)).toBe(false);
  });
});

describe('rectsIntersect', () => {
  it('detects overlap', () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
  });

  it('rejects disjoint rects', () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 20, w: 10, h: 10 })).toBe(false);
  });

  it('treats edge-touching as non-intersecting', () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
  });
});

describe('moveRect', () => {
  it('translates the rect', () => {
    expect(moveRect({ x: 10, y: 10, w: 20, h: 20 }, vec(5, -3))).toEqual({ x: 15, y: 7, w: 20, h: 20 });
  });
});

describe('handles', () => {
  const r = { x: 10, y: 20, w: 100, h: 60 };

  it('exposes 8 handles', () => {
    expect(ALL_HANDLES).toHaveLength(8);
  });

  it('positions corner and edge handles', () => {
    expect(handlePosition(r, 'nw')).toEqual(vec(10, 20));
    expect(handlePosition(r, 'se')).toEqual(vec(110, 80));
    expect(handlePosition(r, 'n')).toEqual(vec(60, 20));
    expect(handlePosition(r, 'w')).toEqual(vec(10, 50));
  });

  it('hits a handle near its position', () => {
    expect(handleAtPoint(r, vec(112, 82), 10)).toBe('se');
    expect(handleAtPoint(r, vec(60, 22), 10)).toBe('n');
  });

  it('misses far away', () => {
    expect(handleAtPoint(r, vec(60, 50), 5)).toBeNull();
  });
});

describe('resizeRect', () => {
  const r = { x: 10, y: 10, w: 100, h: 60 };

  it('grows from the south-east handle', () => {
    expect(resizeRect(r, 'se', vec(200, 100))).toEqual({ x: 10, y: 10, w: 190, h: 90 });
  });

  it('moves the origin when dragging north-west', () => {
    expect(resizeRect(r, 'nw', vec(0, 0))).toEqual({ x: 0, y: 0, w: 110, h: 70 });
  });

  it('resizes only height from the south edge', () => {
    expect(resizeRect(r, 's', vec(999, 100))).toEqual({ x: 10, y: 10, w: 100, h: 90 });
  });

  it('clamps to the minimum size', () => {
    expect(resizeRect(r, 'se', vec(0, 0))).toEqual({ x: 10, y: 10, w: 8, h: 8 });
    expect(resizeRect(r, 'w', vec(500, 40))).toEqual({ x: 102, y: 10, w: 8, h: 60 });
  });
});
