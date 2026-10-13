// Document validation and migration.
// v1: rectangles only, no opacity. v2: all shape types + opacity (current).

import {
  CURRENT_DOC_VERSION,
  type Shape,
  type ShapeType,
  type TextAlign,
  type WhiteboardDocument,
} from './scene';

const SHAPE_TYPES: ShapeType[] = ['rectangle', 'ellipse', 'line', 'arrow', 'text'];
const TEXT_ALIGNS: TextAlign[] = ['left', 'center', 'right'];

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isValidRect(v: unknown): boolean {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    isFiniteNumber(r['x']) &&
    isFiniteNumber(r['y']) &&
    isFiniteNumber(r['w']) &&
    isFiniteNumber(r['h'])
  );
}

function isValidShape(v: unknown): v is Shape {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  if (typeof s['id'] !== 'string' || s['id'] === '') return false;
  if (typeof s['type'] !== 'string' || !SHAPE_TYPES.includes(s['type'] as ShapeType)) return false;
  if (!isValidRect(s['rect'])) return false;
  if (typeof s['fill'] !== 'string' || typeof s['stroke'] !== 'string') return false;
  if (!isFiniteNumber(s['strokeWidth']) || (s['strokeWidth'] as number) < 0) return false;
  const opacity = s['opacity'];
  if (opacity !== undefined && (!isFiniteNumber(opacity) || opacity < 0 || opacity > 1)) return false;
  const type = s['type'] as ShapeType;
  if (type === 'line' || type === 'arrow') {
    if (
      !isFiniteNumber(s['x1']) ||
      !isFiniteNumber(s['y1']) ||
      !isFiniteNumber(s['x2']) ||
      !isFiniteNumber(s['y2'])
    ) {
      return false;
    }
  }
  if (type === 'text') {
    if (typeof s['text'] !== 'string') return false;
    if (!isFiniteNumber(s['fontSize']) || (s['fontSize'] as number) <= 0) return false;
    if (!TEXT_ALIGNS.includes(s['align'] as TextAlign)) return false;
  }
  return true;
}

function normalizeShape(v: Record<string, unknown>): Shape {
  const s = { ...v } as Record<string, unknown>;
  if (s['opacity'] === undefined) s['opacity'] = 1;
  return s as unknown as Shape;
}

function isValidDocumentV2(v: unknown): v is WhiteboardDocument {
  if (typeof v !== 'object' || v === null) return false;
  const d = v as Record<string, unknown>;
  if (d['version'] !== CURRENT_DOC_VERSION) return false;
  if (typeof d['shapes'] !== 'object' || d['shapes'] === null) return false;
  if (!Array.isArray(d['order'])) return false;
  const shapes = d['shapes'] as Record<string, unknown>;
  const order = d['order'] as unknown[];
  const seen = new Set<string>();
  for (const id of order) {
    if (typeof id !== 'string' || seen.has(id)) return false;
    seen.add(id);
    const shape = shapes[id];
    if (!isValidShape(shape)) return false;
    if ((shape as unknown as Record<string, unknown>)['id'] !== id) return false;
  }
  return true;
}

/**
 * Validate an unknown value and migrate it to the current document version.
 * Returns null for anything invalid or unsupported. Never throws.
 */
export function migrateDocument(value: unknown): WhiteboardDocument | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v['version'] === CURRENT_DOC_VERSION) {
    return isValidDocumentV2(v) ? (v as WhiteboardDocument) : null;
  }
  if (v['version'] === 1) {
    // v1: rectangles only, no opacity field.
    if (typeof v['shapes'] !== 'object' || v['shapes'] === null) return null;
    if (!Array.isArray(v['order'])) return null;
    const shapesIn = v['shapes'] as Record<string, unknown>;
    const order = v['order'] as unknown[];
    const shapes: Record<string, Shape> = {};
    const seen = new Set<string>();
    for (const id of order) {
      if (typeof id !== 'string' || seen.has(id)) return null;
      seen.add(id);
      const raw = shapesIn[id];
      if (typeof raw !== 'object' || raw === null) return null;
      const r = raw as Record<string, unknown>;
      if (r['type'] !== 'rectangle' && r['type'] !== undefined) return null;
      if (!isValidRect(r['rect'])) return null;
      if (typeof r['fill'] !== 'string' || typeof r['stroke'] !== 'string') return null;
      shapes[id] = normalizeShape({ ...r, id, type: 'rectangle' });
    }
    return { version: CURRENT_DOC_VERSION, shapes, order: order as string[] };
  }
  return null;
}
