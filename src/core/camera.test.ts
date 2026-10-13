import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  panBy,
  screenToWorld,
  visibleWorldRect,
  worldToScreen,
  zoomAt,
  type Camera,
} from './camera';

const cam: Camera = { x: 100, y: 50, zoom: 2 };

describe('worldToScreen / screenToWorld', () => {
  it('round-trips through both transforms', () => {
    const world = { x: 123.5, y: -40.25 };
    const screen = worldToScreen(cam, world);
    const back = screenToWorld(cam, screen);
    expect(back.x).toBeCloseTo(world.x, 10);
    expect(back.y).toBeCloseTo(world.y, 10);
  });

  it('maps the camera origin to screen (0,0)', () => {
    expect(worldToScreen(cam, { x: 100, y: 50 })).toEqual({ x: 0, y: 0 });
  });

  it('scales by zoom', () => {
    expect(worldToScreen(cam, { x: 110, y: 50 })).toEqual({ x: 20, y: 0 });
  });
});

describe('zoomAt', () => {
  it('keeps the world point under the cursor fixed', () => {
    const cursor = { x: 200, y: 150 };
    const before = screenToWorld(cam, cursor);
    const zoomed = zoomAt(cam, cursor, 2);
    const after = screenToWorld(zoomed, cursor);
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
    expect(zoomed.zoom).toBeCloseTo(4, 10);
  });

  it('clamps to min/max zoom', () => {
    expect(zoomAt(cam, { x: 0, y: 0 }, 1000).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(cam, { x: 0, y: 0 }, 0.0001).zoom).toBe(MIN_ZOOM);
  });
});

describe('panBy', () => {
  it('moves the camera opposite to the drag, scaled by zoom', () => {
    // Drag 20px right at zoom 2 => world shifts 10 left under the cursor.
    const panned = panBy(cam, 20, -10);
    expect(panned.x).toBeCloseTo(90, 10);
    expect(panned.y).toBeCloseTo(55, 10);
    expect(panned.zoom).toBe(cam.zoom);
  });
});

describe('visibleWorldRect', () => {
  it('covers viewport size divided by zoom', () => {
    const v = visibleWorldRect(cam, 800, 600);
    expect(v).toEqual({ x: 100, y: 50, w: 400, h: 300 });
  });
});
