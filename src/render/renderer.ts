// Canvas 2D renderer: draws the document in world coordinates through
// the camera transform. Stateless — all inputs are passed in.

import { worldToScreen, type Camera } from '../core/camera';
import {
  ALL_HANDLES,
  handlePosition,
  normalizeRect,
  type Rect,
} from '../core/geometry';
import { shapesInOrder, type WhiteboardDocument } from '../core/scene';

export interface RenderInput {
  doc: WhiteboardDocument;
  camera: Camera;
  /** Selected shape ids. */
  selection: readonly string[];
  /** Live rect overrides (e.g. while dragging), by shape id. */
  previewRects: ReadonlyMap<string, Rect>;
  /** Rect currently being created (world space), if any. */
  createPreview: Rect | null;
  /** Marquee selection rect (world space), if any. */
  marquee: Rect | null;
}

const SELECTION_COLOR = '#2563eb';
const HANDLE_SIZE_PX = 9;

export function renderScene(
  ctx: CanvasRenderingContext2D,
  widthCssPx: number,
  heightCssPx: number,
  input: RenderInput,
): void {
  const { doc, camera, selection } = input;

  ctx.save();
  ctx.clearRect(0, 0, widthCssPx, heightCssPx);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, widthCssPx, heightCssPx);

  drawGrid(ctx, camera, widthCssPx, heightCssPx);

  for (const shape of shapesInOrder(doc)) {
    const rect = input.previewRects.get(shape.id) ?? shape.rect;
    drawShape(ctx, camera, rect, shape.fill, shape.stroke, shape.strokeWidth);
  }

  if (input.createPreview) {
    const r = normalizeRect(input.createPreview);
    drawShape(ctx, camera, r, 'rgba(37, 99, 235, 0.12)', '#2563eb', 1.5);
  }

  if (input.marquee) {
    const r = normalizeRect(input.marquee);
    const a = worldToScreen(camera, { x: r.x, y: r.y });
    const b = worldToScreen(camera, { x: r.x + r.w, y: r.y + r.h });
    ctx.save();
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.fillStyle = 'rgba(37, 99, 235, 0.06)';
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.restore();
  }

  const selected = new Set(selection);
  for (const shape of shapesInOrder(doc)) {
    if (!selected.has(shape.id)) continue;
    const rect = input.previewRects.get(shape.id) ?? shape.rect;
    drawSelection(ctx, camera, rect);
  }

  ctx.restore();
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  w: number,
  h: number,
): void {
  const step = 40; // world units between dots
  const startX = Math.floor(camera.x / step) * step;
  const startY = Math.floor(camera.y / step) * step;
  const endX = camera.x + w / camera.zoom;
  const endY = camera.y + h / camera.zoom;

  ctx.save();
  ctx.fillStyle = '#e3e7ee';
  for (let gx = startX; gx <= endX; gx += step) {
    for (let gy = startY; gy <= endY; gy += step) {
      const s = worldToScreen(camera, { x: gx, y: gy });
      ctx.fillRect(s.x - 0.75, s.y - 0.75, 1.5, 1.5);
    }
  }
  ctx.restore();
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  rect: Rect,
  fill: string,
  stroke: string,
  strokeWidth: number,
): void {
  const r = normalizeRect(rect);
  const a = worldToScreen(camera, { x: r.x, y: r.y });
  const w = r.w * camera.zoom;
  const h = r.h * camera.zoom;
  if (w <= 0 || h <= 0) return;
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(1, strokeWidth * camera.zoom);
  ctx.beginPath();
  ctx.rect(a.x, a.y, w, h);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawSelection(ctx: CanvasRenderingContext2D, camera: Camera, rect: Rect): void {
  const r = normalizeRect(rect);
  const a = worldToScreen(camera, { x: r.x, y: r.y });
  const w = r.w * camera.zoom;
  const h = r.h * camera.zoom;

  ctx.save();
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(a.x - 3, a.y - 3, w + 6, h + 6);

  ctx.fillStyle = '#ffffff';
  const half = HANDLE_SIZE_PX / 2;
  for (const handle of ALL_HANDLES) {
    const p = worldToScreen(camera, handlePosition(r, handle));
    ctx.fillRect(p.x - half, p.y - half, HANDLE_SIZE_PX, HANDLE_SIZE_PX);
    ctx.strokeRect(p.x - half, p.y - half, HANDLE_SIZE_PX, HANDLE_SIZE_PX);
  }
  ctx.restore();
}
