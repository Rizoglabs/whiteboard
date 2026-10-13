// Scene model: the whiteboard document. Immutable updates, no DOM.

import { pointInRect, type Rect } from './geometry';

export type ShapeType = 'rectangle';

export interface RectangleShape {
  id: string;
  type: ShapeType;
  rect: Rect;
  fill: string;
  stroke: string;
  strokeWidth: number;
}

export type Shape = RectangleShape;

export interface WhiteboardDocument {
  version: 1;
  /** Shapes by id. */
  shapes: Record<string, Shape>;
  /** Shape ids back-to-front (last = topmost). */
  order: string[];
}

export function emptyDocument(): WhiteboardDocument {
  return { version: 1, shapes: {}, order: [] };
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

export function addShape(doc: WhiteboardDocument, shape: Shape): WhiteboardDocument {
  if (doc.shapes[shape.id]) return doc;
  return {
    ...doc,
    shapes: { ...doc.shapes, [shape.id]: shape },
    order: [...doc.order, shape.id],
  };
}

/** Re-add previously deleted shapes at their original positions. */
export function restoreShapes(doc: WhiteboardDocument, shapes: Shape[]): WhiteboardDocument {
  let next = doc;
  for (const s of shapes) next = addShape(next, s);
  return next;
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
    if (pointInRect({ x, y }, s.rect, tolerance)) return s;
  }
  return null;
}
