// Camera: maps between world coordinates and screen (canvas pixel) coordinates.
// Pure functions — fully unit-testable, no DOM.

import type { Vec } from './geometry';

export interface Camera {
  /** World x visible at the screen origin (top-left). */
  x: number;
  /** World y visible at the screen origin (top-left). */
  y: number;
  /** Screen pixels per world unit. */
  zoom: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;

export function clampZoom(z: number): number {
  if (Number.isNaN(z)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

export function worldToScreen(cam: Camera, p: Vec): Vec {
  return { x: (p.x - cam.x) * cam.zoom, y: (p.y - cam.y) * cam.zoom };
}

export function screenToWorld(cam: Camera, p: Vec): Vec {
  return { x: p.x / cam.zoom + cam.x, y: p.y / cam.zoom + cam.y };
}

/**
 * Zoom by `factor` around a screen point, keeping the world point under
 * the cursor fixed.
 */
export function zoomAt(cam: Camera, screenPoint: Vec, factor: number): Camera {
  const newZoom = clampZoom(cam.zoom * factor);
  const world = screenToWorld(cam, screenPoint);
  return {
    x: world.x - screenPoint.x / newZoom,
    y: world.y - screenPoint.y / newZoom,
    zoom: newZoom,
  };
}

/** Pan the camera by a screen-space delta (e.g. from a pointer drag). */
export function panBy(cam: Camera, dxScreen: number, dyScreen: number): Camera {
  return {
    x: cam.x - dxScreen / cam.zoom,
    y: cam.y - dyScreen / cam.zoom,
    zoom: cam.zoom,
  };
}

/** World-space rect currently visible in a viewport of the given size. */
export function visibleWorldRect(
  cam: Camera,
  viewportW: number,
  viewportH: number,
): { x: number; y: number; w: number; h: number } {
  return {
    x: cam.x,
    y: cam.y,
    w: viewportW / cam.zoom,
    h: viewportH / cam.zoom,
  };
}
