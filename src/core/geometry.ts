// Pure 2D geometry primitives. No DOM, no framework — fully unit-testable.

export interface Vec {
  x: number;
  y: number;
}

export interface Rect {
  /** Left edge in world units (after normalizeRect). */
  x: number;
  /** Top edge in world units (after normalizeRect). */
  y: number;
  /** Width, always >= 0 after normalizeRect. */
  w: number;
  /** Height, always >= 0 after normalizeRect. */
  h: number;
}

export function vec(x: number, y: number): Vec {
  return { x, y };
}

export function add(a: Vec, b: Vec): Vec {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec, b: Vec): Vec {
  return { x: a.x - b.x, y: a.y - b.y };
}

/** Normalize so x/y is the top-left corner and w/h are non-negative. */
export function normalizeRect(r: Rect): Rect {
  const x = r.w >= 0 ? r.x : r.x + r.w;
  const y = r.h >= 0 ? r.y : r.y + r.h;
  return { x, y, w: Math.abs(r.w), h: Math.abs(r.h) };
}

/** Build a rect from two arbitrary corner points (e.g. drag start/end). */
export function rectFromPoints(a: Vec, b: Vec): Rect {
  return normalizeRect({ x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y });
}

export function pointInRect(p: Vec, r: Rect, tolerance = 0): boolean {
  const n = normalizeRect(r);
  return (
    p.x >= n.x - tolerance &&
    p.x <= n.x + n.w + tolerance &&
    p.y >= n.y - tolerance &&
    p.y <= n.y + n.h + tolerance
  );
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  const n1 = normalizeRect(a);
  const n2 = normalizeRect(b);
  return (
    n1.x < n2.x + n2.w &&
    n1.x + n1.w > n2.x &&
    n1.y < n2.y + n2.h &&
    n1.y + n1.h > n2.y
  );
}

export function moveRect(r: Rect, delta: Vec): Rect {
  return { ...r, x: r.x + delta.x, y: r.y + delta.y };
}

// ---------------------------------------------------------------------------
// Resize handles
// ---------------------------------------------------------------------------

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const ALL_HANDLES: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** World-space position of a resize handle. */
export function handlePosition(r: Rect, handle: HandleId): Vec {
  const n = normalizeRect(r);
  const { x, y, w, h } = n;
  switch (handle) {
    case 'nw':
      return vec(x, y);
    case 'n':
      return vec(x + w / 2, y);
    case 'ne':
      return vec(x + w, y);
    case 'e':
      return vec(x + w, y + h / 2);
    case 'se':
      return vec(x + w, y + h);
    case 's':
      return vec(x + w / 2, y + h);
    case 'sw':
      return vec(x, y + h);
    case 'w':
      return vec(x, y + h / 2);
  }
}

/** Which handle (if any) is within `radius` world units of point `p`. */
export function handleAtPoint(r: Rect, p: Vec, radius: number): HandleId | null {
  for (const h of ALL_HANDLES) {
    const hp = handlePosition(r, h);
    if (Math.hypot(p.x - hp.x, p.y - hp.y) <= radius) return h;
  }
  return null;
}

export const MIN_SIZE = 8;

/**
 * Resize a rect by dragging `handle` to world point `p`.
 * The opposite edge/corner stays anchored; size is clamped to `minSize`.
 */
export function resizeRect(r: Rect, handle: HandleId, p: Vec, minSize = MIN_SIZE): Rect {
  const n = normalizeRect(r);
  let { x, y, w, h } = n;
  const right = x + w;
  const bottom = y + h;
  if (handle.includes('e')) {
    w = Math.max(minSize, p.x - x);
  }
  if (handle.includes('s')) {
    h = Math.max(minSize, p.y - y);
  }
  if (handle.includes('w')) {
    const newX = Math.min(right - minSize, p.x);
    w = right - newX;
    x = newX;
  }
  if (handle.includes('n')) {
    const newY = Math.min(bottom - minSize, p.y);
    h = bottom - newY;
    y = newY;
  }
  return { x, y, w, h };
}
