// Snapping: align a moving rect's edges/centers to nearby shapes.
// Pure functions — fully unit-testable, no DOM.

import { normalizeRect, type Rect } from '../core/geometry';

export interface SnapResult {
  dx: number;
  dy: number;
  /** World x coords of vertical guides. */
  guidesV: number[];
  /** World y coords of horizontal guides. */
  guidesH: number[];
}

function edgesX(r: Rect): number[] {
  const n = normalizeRect(r);
  return [n.x, n.x + n.w / 2, n.x + n.w];
}

function edgesY(r: Rect): number[] {
  const n = normalizeRect(r);
  return [n.y, n.y + n.h / 2, n.y + n.h];
}

/**
 * Snap `moving` to the nearest edge/center of `others` within `threshold`
 * (world units). Returns the adjustment and the guide lines to draw.
 * The moving shape's own rect must be excluded from `others` by the caller.
 */
export function snapRect(moving: Rect, others: Rect[], threshold: number): SnapResult {
  const m = normalizeRect(moving);
  const movX = edgesX(m);
  const movY = edgesY(m);

  let bestDx = 0;
  let bestDy = 0;
  let bestXDist = threshold;
  let bestYDist = threshold;
  const guidesV: number[] = [];
  const guidesH: number[] = [];

  const candX = new Set<number>();
  const candY = new Set<number>();
  for (const o of others) {
    for (const x of edgesX(o)) candX.add(x);
    for (const y of edgesY(o)) candY.add(y);
  }

  for (const cx of candX) {
    for (const mx of movX) {
      const d = cx - mx;
      if (Math.abs(d) < bestXDist) {
        bestXDist = Math.abs(d);
        bestDx = d;
      }
    }
  }
  for (const cy of candY) {
    for (const my of movY) {
      const d = cy - my;
      if (Math.abs(d) < bestYDist) {
        bestYDist = Math.abs(d);
        bestDy = d;
      }
    }
  }

  if (bestXDist < threshold) {
    // Guide at the snapped edge position (in final coords).
    const snapped = movX.map((x) => x + bestDx);
    for (const x of snapped) {
      if ([...candX].some((c) => Math.abs(c - x) < 1e-6)) guidesV.push(x);
    }
  } else {
    bestDx = 0;
  }
  if (bestYDist < threshold) {
    const snapped = movY.map((y) => y + bestDy);
    for (const y of snapped) {
      if ([...candY].some((c) => Math.abs(c - y) < 1e-6)) guidesH.push(y);
    }
  } else {
    bestDy = 0;
  }

  return { dx: bestDx, dy: bestDy, guidesV, guidesH };
}

export interface SnapPoint {
  x: number;
  y: number;
}

/**
 * Snap a point to the nearest corner / edge-center / center of the given
 * rects (used for line & arrow endpoints). Returns the original point when
 * nothing is within `threshold` (world units).
 */
export function snapPoint(
  p: SnapPoint,
  others: Rect[],
  threshold: number,
): { p: SnapPoint; snapped: boolean } {
  let best = p;
  let bestD = threshold;
  for (const ro of others) {
    const r = normalizeRect(ro);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const candidates: SnapPoint[] = [
      { x: r.x, y: r.y },
      { x: r.x + r.w, y: r.y },
      { x: r.x, y: r.y + r.h },
      { x: r.x + r.w, y: r.y + r.h },
      { x: cx, y: r.y },
      { x: cx, y: r.y + r.h },
      { x: r.x, y: cy },
      { x: r.x + r.w, y: cy },
      { x: cx, y: cy },
    ];
    for (const c of candidates) {
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
  }
  return { p: best, snapped: best !== p };
}
