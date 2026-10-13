import { describe, expect, it } from 'vitest';
import { snapPoint, snapRect } from './snapping';

describe('snapRect', () => {
  const others = [{ x: 100, y: 100, w: 50, h: 50 }];

  it('snaps the moving left edge to a nearby right edge', () => {
    const moving = { x: 152, y: 200, w: 40, h: 40 };
    const r = snapRect(moving, others, 8);
    expect(r.dx).toBe(-2); // 152 -> 150
    expect(r.dy).toBe(0);
    expect(r.guidesV).toContain(150);
  });

  it('snaps centers', () => {
    const moving = { x: 103, y: 300, w: 50, h: 50 }; // center x = 128 vs 125
    const r = snapRect(moving, others, 8);
    expect(r.dx).toBe(-3);
    expect(r.guidesV).toContain(125);
  });

  it('does nothing when nothing is close', () => {
    const moving = { x: 0, y: 0, w: 40, h: 40 };
    const r = snapRect(moving, others, 8);
    expect(r.dx).toBe(0);
    expect(r.dy).toBe(0);
    expect(r.guidesV).toEqual([]);
    expect(r.guidesH).toEqual([]);
  });

  it('snaps x and y independently, picking the closest edge', () => {
    const moving = { x: 152, y: 103, w: 40, h: 40 };
    const r = snapRect(moving, others, 8);
    expect(r.dx).toBe(-2); // left edge 152 -> 150
    expect(r.dy).toBe(2); // vertical center 123 -> 125 (closest candidate)
    expect(r.guidesV).toContain(150);
    expect(r.guidesH).toContain(125);
  });
});

describe('snapPoint', () => {
  const others = [{ x: 100, y: 100, w: 50, h: 50 }];

  it('snaps to a nearby corner', () => {
    const r = snapPoint({ x: 104, y: 97 }, others, 10);
    expect(r.snapped).toBe(true);
    expect(r.p).toEqual({ x: 100, y: 100 });
  });

  it('snaps to edge centers', () => {
    const r = snapPoint({ x: 125, y: 152 }, others, 10);
    expect(r.snapped).toBe(true);
    expect(r.p).toEqual({ x: 125, y: 150 });
  });

  it('leaves distant points alone', () => {
    const p = { x: 0, y: 0 };
    const r = snapPoint(p, others, 10);
    expect(r.snapped).toBe(false);
    expect(r.p).toBe(p);
  });
});
