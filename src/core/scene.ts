// Scene model: the whiteboard document. Immutable updates, no DOM.

import {
  endpointsRect,
  normalizeRect,
  pointInEllipse,
  pointInRect,
  segmentHit,
  type Rect,
  type Vec,
} from './geometry';

export type ShapeType = 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'text';
export type TextAlign = 'left' | 'center' | 'right';

/** Current document schema version. v1 = rectangles only, v2 = all shape types + opacity. */
export const CURRENT_DOC_VERSION = 2;

interface ShapeBase {
  id: string;
  type: ShapeType;
  /** Bounding box in world units (for line/arrow: derived from endpoints). */
  rect: Rect;
  fill: string;
  stroke: string;
  strokeWidth: number;
  /** 0..1 */
  opacity: number;
}

export interface RectangleShape extends ShapeBase {
  type: 'rectangle';
}

export interface EllipseShape extends ShapeBase {
  type: 'ellipse';
}

export interface LineShape extends ShapeBase {
  type: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ArrowShape extends ShapeBase {
  type: 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TextShape extends ShapeBase {
  type: 'text';
  text: string;
  /** World units. */
  fontSize: number;
  align: TextAlign;
}

export type Shape = RectangleShape | EllipseShape | LineShape | ArrowShape | TextShape;

export type AnyShape = Shape;

export interface WhiteboardDocument {
  version: number;
  /** Shapes by id. */
  shapes: Record<string, Shape>;
  /** Shape ids back-to-front (last = topmost). */
  order: string[];
}

export function emptyDocument(): WhiteboardDocument {
  return { version: CURRENT_DOC_VERSION, shapes: {}, order: [] };
}

let idCounter = 0;

/** Unique shape id. Not cryptographically random — uniqueness within a session is enough. */
export function newId(): string {
  idCounter += 1;
  return `shape-${Date.now().toString(36)}-${idCounter}`;
}

export function getShape(doc: WhiteboardDocument, id: string): Shape | undefined {
  return doc.shapes[id];
}

/** Shapes in paint order (back-to-front). */
export function shapesInOrder(doc: WhiteboardDocument): Shape[] {
  const out: Shape[] = [];
  for (const id of doc.order) {
    const s = doc.shapes[id];
    if (s) out.push(s);
  }
  return out;
}

/** Deep-ish clone of a shape with a fresh id (for duplicate/paste). */
export function cloneShape(shape: Shape): Shape {
  const copy = JSON.parse(JSON.stringify(shape)) as Shape;
  copy.id = newId();
  return copy;
}

export function addShape(doc: WhiteboardDocument, shape: Shape): WhiteboardDocument {
  if (doc.shapes[shape.id]) return doc;
  return {
    ...doc,
    shapes: { ...doc.shapes, [shape.id]: shape },
    order: [...doc.order, shape.id],
  };
}

export function addShapes(doc: WhiteboardDocument, shapes: Shape[]): WhiteboardDocument {
  let next = doc;
  for (const s of shapes) next = addShape(next, s);
  return next;
}

/** Re-add previously deleted shapes at their original positions. */
export function restoreShapes(doc: WhiteboardDocument, shapes: Shape[]): WhiteboardDocument {
  return addShapes(doc, shapes);
}

export function removeShapes(doc: WhiteboardDocument, ids: readonly string[]): WhiteboardDocument {
  const idSet = new Set(ids);
  if (idSet.size === 0) return doc;
  const shapes: Record<string, Shape> = {};
  for (const [id, s] of Object.entries(doc.shapes)) {
    if (!idSet.has(id)) shapes[id] = s;
  }
  return { ...doc, shapes, order: doc.order.filter((id) => !idSet.has(id)) };
}

export function updateShapeRect(
  doc: WhiteboardDocument,
  id: string,
  rect: Rect,
): WhiteboardDocument {
  const s = doc.shapes[id];
  if (!s) return doc;
  return { ...doc, shapes: { ...doc.shapes, [id]: { ...s, rect } } };
}

/** Replace a whole shape (e.g. after a property change). */
export function updateShape(doc: WhiteboardDocument, shape: Shape): WhiteboardDocument {
  if (!doc.shapes[shape.id]) return doc;
  return { ...doc, shapes: { ...doc.shapes, [shape.id]: shape } };
}

/** Move a shape (and its line/arrow endpoints) by a delta. Pure. */
export function translatedShape(shape: Shape, dx: number, dy: number): Shape {
  const rect = { ...shape.rect, x: shape.rect.x + dx, y: shape.rect.y + dy };
  if (shape.type === 'line' || shape.type === 'arrow') {
    return {
      ...shape,
      rect,
      x1: shape.x1 + dx,
      y1: shape.y1 + dy,
      x2: shape.x2 + dx,
      y2: shape.y2 + dy,
    };
  }
  return { ...shape, rect };
}

/**
 * Resize a shape to a new bounding rect. For line/arrow the endpoints are
 * remapped proportionally so the segment keeps its relative geometry.
 */
export function resizedShape(shape: Shape, to: Rect): Shape {
  const from = normalizeRect(shape.rect);
  const target = normalizeRect(to);
  if (shape.type !== 'line' && shape.type !== 'arrow') {
    return { ...shape, rect: target };
  }
  const mapX = (x: number): number =>
    from.w === 0 ? target.x : target.x + ((x - from.x) / from.w) * target.w;
  const mapY = (y: number): number =>
    from.h === 0 ? target.y : target.y + ((y - from.y) / from.h) * target.h;
  return {
    ...shape,
    rect: target,
    x1: mapX(shape.x1),
    y1: mapY(shape.y1),
    x2: mapX(shape.x2),
    y2: mapY(shape.y2),
  };
}

export function translateShapeInDoc(
  doc: WhiteboardDocument,
  id: string,
  dx: number,
  dy: number,
): WhiteboardDocument {
  const s = doc.shapes[id];
  if (!s) return doc;
  return updateShape(doc, translatedShape(s, dx, dy));
}

export function resizeShapeInDoc(
  doc: WhiteboardDocument,
  id: string,
  to: Rect,
): WhiteboardDocument {
  const s = doc.shapes[id];
  if (!s) return doc;
  return updateShape(doc, resizedShape(s, to));
}

/** Recompute a line/arrow bounding rect from its endpoints. */
export function refreshEndpointsRect(shape: LineShape | ArrowShape): LineShape | ArrowShape {
  return { ...shape, rect: endpointsRect(shape.x1, shape.y1, shape.x2, shape.y2) };
}

/** Replace the document's z-order (ids must match the current set). */
export function reorderShapes(doc: WhiteboardDocument, newOrder: string[]): WhiteboardDocument {
  const current = new Set(doc.order);
  if (newOrder.length !== current.size || !newOrder.every((id) => current.has(id))) {
    return doc;
  }
  return { ...doc, order: [...newOrder] };
}

/** Move each selected id one step toward the front (top), as one operation. */
export function bringForward(order: string[], ids: readonly string[]): string[] {
  const selected = new Set(ids);
  const next = [...order];
  for (let i = next.length - 2; i >= 0; i--) {
    if (selected.has(next[i]) && !selected.has(next[i + 1])) {
      const t = next[i];
      next[i] = next[i + 1];
      next[i + 1] = t;
    }
  }
  return next;
}

/** Move each selected id one step toward the back (bottom), as one operation. */
export function sendBackward(order: string[], ids: readonly string[]): string[] {
  const selected = new Set(ids);
  const next = [...order];
  for (let i = 1; i < next.length; i++) {
    if (selected.has(next[i]) && !selected.has(next[i - 1])) {
      const t = next[i];
      next[i] = next[i - 1];
      next[i - 1] = t;
    }
  }
  return next;
}

/** Move selected ids to the very front, preserving their relative order. */
export function bringToFront(order: string[], ids: readonly string[]): string[] {
  const selected = new Set(ids);
  return [...order.filter((id) => !selected.has(id)), ...order.filter((id) => selected.has(id))];
}

/** Move selected ids to the very back, preserving their relative order. */
export function sendToBack(order: string[], ids: readonly string[]): string[] {
  const selected = new Set(ids);
  return [...order.filter((id) => selected.has(id)), ...order.filter((id) => !selected.has(id))];
}

// ---------------------------------------------------------------------------
// Hit testing
// ---------------------------------------------------------------------------

/** True when the world point hits the shape (tolerance in world units). */
export function shapeHit(shape: Shape, x: number, y: number, tolerance = 0): boolean {
  const p: Vec = { x, y };
  switch (shape.type) {
    case 'ellipse':
      return pointInEllipse(p, shape.rect, tolerance);
    case 'line':
    case 'arrow':
      return segmentHit(p, { x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 }, tolerance);
    default:
      return pointInRect(p, shape.rect, tolerance);
  }
}

/** Topmost shape containing the world point, or null. `tolerance` in world units. */
export function shapeAtPoint(
  doc: WhiteboardDocument,
  x: number,
  y: number,
  tolerance = 0,
): Shape | null {
  const shapes = shapesInOrder(doc);
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    if (shapeHit(s, x, y, tolerance)) return s;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Shape factories
// ---------------------------------------------------------------------------

const DEFAULT_FILL = '#fef3c7';
const DEFAULT_STROKE = '#b45309';
const DEFAULT_STROKE_WIDTH = 2;

export interface NewShapeOptions {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

function baseProps(id: string, rect: Rect, opts: NewShapeOptions = {}): Omit<ShapeBase, 'type'> {
  return {
    id,
    rect: normalizeRect(rect),
    fill: opts.fill ?? DEFAULT_FILL,
    stroke: opts.stroke ?? DEFAULT_STROKE,
    strokeWidth: opts.strokeWidth ?? DEFAULT_STROKE_WIDTH,
    opacity: opts.opacity ?? 1,
  };
}

export function makeRectangle(rect: Rect, opts: NewShapeOptions = {}): RectangleShape {
  return { ...baseProps(newId(), rect, opts), type: 'rectangle' };
}

export function makeEllipse(rect: Rect, opts: NewShapeOptions = {}): EllipseShape {
  return { ...baseProps(newId(), rect, opts), type: 'ellipse' };
}

export function makeLine(x1: number, y1: number, x2: number, y2: number, opts: NewShapeOptions = {}): LineShape {
  return {
    ...baseProps(newId(), endpointsRect(x1, y1, x2, y2), { ...opts, fill: 'none' }),
    type: 'line',
    x1,
    y1,
    x2,
    y2,
  };
}

export function makeArrow(x1: number, y1: number, x2: number, y2: number, opts: NewShapeOptions = {}): ArrowShape {
  return {
    ...baseProps(newId(), endpointsRect(x1, y1, x2, y2), { ...opts, fill: 'none' }),
    type: 'arrow',
    x1,
    y1,
    x2,
    y2,
  };
}

export function makeText(
  rect: Rect,
  text: string,
  opts: NewShapeOptions & { fontSize?: number; align?: TextAlign } = {},
): TextShape {
  return {
    ...baseProps(newId(), rect, { ...opts, fill: opts.fill ?? '#1f2937', stroke: 'none' }),
    type: 'text',
    text,
    fontSize: opts.fontSize ?? 24,
    align: opts.align ?? 'left',
  };
}
