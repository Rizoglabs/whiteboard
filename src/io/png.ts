// PNG export: render the document to an offscreen canvas and download it.

import { normalizeRect, type Rect } from '../core/geometry';
import { shapesInOrder, type WhiteboardDocument } from '../core/scene';
import { renderScene } from '../render/renderer';

export interface PngExportOptions {
  /** Output scale (2 = retina). */
  scale?: number;
  /** Padding around the content, in world units. */
  padding?: number;
  /** Background color. */
  background?: string;
}

export function contentBounds(doc: WhiteboardDocument): Rect | null {
  const shapes = shapesInOrder(doc);
  if (shapes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of shapes) {
    const r = normalizeRect(s.rect);
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
}

const MAX_EXPORT_PX = 4096;

export async function exportToPng(
  doc: WhiteboardDocument,
  opts: PngExportOptions = {},
): Promise<Blob> {
  const bounds = contentBounds(doc);
  if (!bounds) throw new Error('Nothing to export: the canvas is empty.');
  const scale = Math.min(opts.scale ?? 2, 8);
  const padding = opts.padding ?? 40;
  const w = Math.min(MAX_EXPORT_PX, Math.ceil((bounds.w + padding * 2) * scale));
  const h = Math.min(MAX_EXPORT_PX, Math.ceil((bounds.h + padding * 2) * scale));
  const actualScale = Math.min(scale, w / (bounds.w + padding * 2), h / (bounds.h + padding * 2));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available.');

  ctx.fillStyle = opts.background ?? '#ffffff';
  ctx.fillRect(0, 0, w, h);
  renderScene(ctx, w, h, {
    doc,
    camera: { x: bounds.x - padding, y: bounds.y - padding, zoom: actualScale },
    selection: [],
    previewShapes: new Map(),
    createPreview: null,
    marquee: null,
    guides: null,
    grid: false,
  });

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Failed to encode PNG.');
  return blob;
}

/** Trigger a download of a Blob in the browser. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Trigger a download of a text file in the browser. */
export function downloadText(text: string, filename: string, mime: string): void {
  downloadBlob(new Blob([text], { type: mime }), filename);
}
