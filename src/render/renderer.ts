// Canvas 2D renderer: draws the document in world coordinates through
// the camera transform. Stateless — all inputs are passed in.

import { worldToScreen, type Camera } from '../core/camera';
import {
  ALL_HANDLES,
  handlePosition,
  normalizeRect,
  type Rect,
} from '../core/geometry';
import {
  shapesInOrder,
  type ArrowShape,
  type LineShape,
  type Shape,
  type TextShape,
  type WhiteboardDocument,
} from '../core/scene';
import { layoutText } from './text';

export interface RenderInput {
  doc: WhiteboardDocument;
  camera: Camera;
  /** Selected shape ids. */
  selection: readonly string[];
  /** Live shape overrides (e.g. while dragging), by shape id. */
  previewShapes: ReadonlyMap<string, Shape>;
  /** Shape currently being created (world space), if any. */
  createPreview: Shape | null;
  /** Marquee selection rect (world space), if any. */
  marquee: Rect | null;
  /** Alignment guides in world coords, if any. */
  guides: { v: number[]; h: number[] } | null;
  /** Draw the dot grid. Defaults to true. */
  grid?: boolean;
}

const SELECTION_COLOR = '#2563eb';
const GUIDE_COLOR = '#ef4444';
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

  if (input.grid !== false) {
    drawGrid(ctx, camera, widthCssPx, heightCssPx);
  }

  for (const shape of shapesInOrder(doc)) {
    const s = input.previewShapes.get(shape.id) ?? shape;
    drawShape(ctx, camera, s);
  }

  if (input.createPreview) {
    drawCreatePreview(ctx, camera, input.createPreview);
  }

  if (input.marquee) {
    drawMarquee(ctx, camera, input.marquee);
  }

  if (input.guides) {
    drawGuides(ctx, camera, widthCssPx, heightCssPx, input.guides);
  }

  const selected = new Set(selection);
  for (const shape of shapesInOrder(doc)) {
    if (!selected.has(shape.id)) continue;
    const s = input.previewShapes.get(shape.id) ?? shape;
    drawSelection(ctx, camera, s.rect);
  }

  ctx.restore();
}

function applyOpacity(ctx: CanvasRenderingContext2D, opacity: number): void {
  if (opacity < 1) ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
}

function drawShape(ctx: CanvasRenderingContext2D, camera: Camera, shape: Shape): void {
  ctx.save();
  applyOpacity(ctx, shape.opacity);
  switch (shape.type) {
    case 'rectangle':
      drawRectShape(ctx, camera, shape.rect, shape.fill, shape.stroke, shape.strokeWidth);
      break;
    case 'ellipse':
      drawEllipseShape(ctx, camera, shape.rect, shape.fill, shape.stroke, shape.strokeWidth);
      break;
    case 'line':
      drawLineShape(ctx, camera, shape, false);
      break;
    case 'arrow':
      drawLineShape(ctx, camera, shape, true);
      break;
    case 'text':
      drawTextShape(ctx, camera, shape);
      break;
  }
  ctx.restore();
}

function drawRectShape(
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
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(1, strokeWidth * camera.zoom);
  ctx.beginPath();
  ctx.rect(a.x, a.y, w, h);
  if (fill !== 'none') ctx.fill();
  ctx.stroke();
}

function drawEllipseShape(
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
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(1, strokeWidth * camera.zoom);
  ctx.beginPath();
  ctx.ellipse(a.x + w / 2, a.y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  if (fill !== 'none') ctx.fill();
  ctx.stroke();
}

function drawLineShape(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  shape: LineShape | ArrowShape,
  arrowhead: boolean,
): void {
  const a = worldToScreen(camera, { x: shape.x1, y: shape.y1 });
  const b = worldToScreen(camera, { x: shape.x2, y: shape.y2 });
  ctx.strokeStyle = shape.stroke;
  ctx.lineWidth = Math.max(1, shape.strokeWidth * camera.zoom);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  if (arrowhead) {
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const headLen = Math.max(10 * camera.zoom, shape.strokeWidth * camera.zoom * 4);
    ctx.beginPath();
    for (const s of [1, -1]) {
      const ha = angle + Math.PI + s * 0.42;
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x + headLen * Math.cos(ha), b.y + headLen * Math.sin(ha));
    }
    ctx.stroke();
  }
}

function drawTextShape(ctx: CanvasRenderingContext2D, camera: Camera, shape: TextShape): void {
  const r = normalizeRect(shape.rect);
  const topLeft = worldToScreen(camera, { x: r.x, y: r.y });
  const wPx = r.w * camera.zoom;
  const fontPx = Math.max(1, shape.fontSize * camera.zoom);
  const font = `${fontPx}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
  const layout = layoutText(shape.text, shape.fontSize, r.w);
  ctx.fillStyle = shape.fill;
  ctx.font = font;
  ctx.textBaseline = 'top';
  layout.lines.forEach((line, i) => {
    let x = topLeft.x;
    const lineWPx = layout.widths[i] * camera.zoom;
    if (shape.align === 'center') x = topLeft.x + (wPx - lineWPx) / 2;
    else if (shape.align === 'right') x = topLeft.x + wPx - lineWPx;
    ctx.fillText(line, x, topLeft.y + i * layout.lineHeight * camera.zoom);
  });
}

function drawCreatePreview(ctx: CanvasRenderingContext2D, camera: Camera, shape: Shape): void {
  ctx.save();
  ctx.setLineDash([6, 4]);
  // Draw the in-progress shape with the blueprint style, then undash for text.
  if (shape.type === 'text') {
    const r = normalizeRect(shape.rect);
    const a = worldToScreen(camera, { x: r.x, y: r.y });
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(a.x, a.y, r.w * camera.zoom, r.h * camera.zoom);
  } else {
    const ghost: Shape = { ...shape, fill: 'rgba(37, 99, 235, 0.12)', stroke: '#2563eb', strokeWidth: 1.5 };
    drawShape(ctx, camera, ghost);
  }
  ctx.restore();
}

function drawMarquee(ctx: CanvasRenderingContext2D, camera: Camera, marquee: Rect): void {
  const r = normalizeRect(marquee);
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

function drawGuides(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  w: number,
  h: number,
  guides: { v: number[]; h: number[] },
): void {
  ctx.save();
  ctx.strokeStyle = GUIDE_COLOR;
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  for (const gx of guides.v) {
    const s = worldToScreen(camera, { x: gx, y: 0 });
    ctx.moveTo(s.x, 0);
    ctx.lineTo(s.x, h);
  }
  for (const gy of guides.h) {
    const s = worldToScreen(camera, { x: 0, y: gy });
    ctx.moveTo(0, s.y);
    ctx.lineTo(w, s.y);
  }
  ctx.stroke();
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
