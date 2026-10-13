// SVG export: serialize the document to a standalone .svg file.
// Mirrors the Canvas 2D rendering (colors, widths, order, text, arrowheads).

import { normalizeRect } from '../core/geometry';
import { shapesInOrder, type Shape, type WhiteboardDocument } from '../core/scene';
import { contentBounds } from './png';
import { layoutText } from '../render/text';

export interface SvgExportOptions {
  /** Padding around the content, in world units. */
  padding?: number;
  /** Background color; 'none' for transparent. */
  background?: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function num(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function opacityAttr(shape: Shape): string {
  return shape.opacity < 1 ? ` opacity="${num(shape.opacity)}"` : '';
}

function paintAttrs(shape: Shape): string {
  const fill = shape.fill === 'none' ? 'none' : esc(shape.fill);
  return `fill="${fill}" stroke="${esc(shape.stroke)}" stroke-width="${num(shape.strokeWidth)}"${opacityAttr(shape)}`;
}

function arrowHeadPoints(x1: number, y1: number, x2: number, y2: number, size: number): string {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const pts = [`${num(x2)},${num(y2)}`];
  for (const s of [1, -1]) {
    const a = angle + Math.PI + s * 0.42;
    pts.push(`${num(x2 + size * Math.cos(a))},${num(y2 + size * Math.sin(a))}`);
  }
  return pts.join(' ');
}

function shapeToSvg(shape: Shape): string {
  switch (shape.type) {
    case 'rectangle': {
      const r = normalizeRect(shape.rect);
      return `<rect x="${num(r.x)}" y="${num(r.y)}" width="${num(r.w)}" height="${num(r.h)}" ${paintAttrs(shape)}/>`;
    }
    case 'ellipse': {
      const r = normalizeRect(shape.rect);
      return `<ellipse cx="${num(r.x + r.w / 2)}" cy="${num(r.y + r.h / 2)}" rx="${num(r.w / 2)}" ry="${num(r.h / 2)}" ${paintAttrs(shape)}/>`;
    }
    case 'line':
      return `<line x1="${num(shape.x1)}" y1="${num(shape.y1)}" x2="${num(shape.x2)}" y2="${num(shape.y2)}" stroke="${esc(shape.stroke)}" stroke-width="${num(shape.strokeWidth)}" stroke-linecap="round"${opacityAttr(shape)}/>`;
    case 'arrow': {
      const headLen = Math.max(10, shape.strokeWidth * 4);
      const line = `<line x1="${num(shape.x1)}" y1="${num(shape.y1)}" x2="${num(shape.x2)}" y2="${num(shape.y2)}" stroke="${esc(shape.stroke)}" stroke-width="${num(shape.strokeWidth)}" stroke-linecap="round"${opacityAttr(shape)}/>`;
      const head = `<polygon points="${arrowHeadPoints(shape.x1, shape.y1, shape.x2, shape.y2, headLen)}" fill="${esc(shape.stroke)}" stroke="none"${opacityAttr(shape)}/>`;
      return `${line}\n    ${head}`;
    }
    case 'text': {
      const r = normalizeRect(shape.rect);
      const layout = layoutText(shape.text, shape.fontSize, r.w);
      const anchor = shape.align === 'center' ? 'middle' : shape.align === 'right' ? 'end' : 'start';
      const x = shape.align === 'center' ? r.x + r.w / 2 : shape.align === 'right' ? r.x + r.w : r.x;
      const tspans = layout.lines
        .map(
          (line, i) =>
            `<tspan x="${num(x)}" dy="${i === 0 ? 0 : num(layout.lineHeight)}">${esc(line)}</tspan>`,
        )
        .join('');
      return `<text x="${num(x)}" y="${num(r.y)}" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="${num(shape.fontSize)}" text-anchor="${anchor}" fill="${esc(shape.fill)}"${opacityAttr(shape)}>${tspans}</text>`;
    }
  }
}

export function exportToSvg(doc: WhiteboardDocument, opts: SvgExportOptions = {}): string {
  const bounds = contentBounds(doc);
  if (!bounds) throw new Error('Nothing to export: the canvas is empty.');
  const padding = opts.padding ?? 40;
  const x = bounds.x - padding;
  const y = bounds.y - padding;
  const w = bounds.w + padding * 2;
  const h = bounds.h + padding * 2;
  const background = opts.background ?? '#ffffff';

  const body = shapesInOrder(doc)
    .map((s) => `    ${shapeToSvg(s)}`)
    .join('\n');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(w)}" height="${num(h)}" viewBox="${num(x)} ${num(y)} ${num(w)} ${num(h)}">\n` +
    (background === 'none' ? '' : `  <rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" fill="${esc(background)}"/>\n`) +
    `${body}\n</svg>\n`
  );
}
