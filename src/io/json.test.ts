import { describe, expect, it } from 'vitest';
import { exportToJson, importFromJson, MAX_IMPORT_SHAPES } from './json';
import {
  addShape,
  emptyDocument,
  makeArrow,
  makeEllipse,
  makeLine,
  makeRectangle,
  makeText,
  type WhiteboardDocument,
} from '../core/scene';

function sampleDoc(): WhiteboardDocument {
  let doc = emptyDocument();
  for (const s of [
    makeRectangle({ x: 0, y: 0, w: 50, h: 40 }),
    makeEllipse({ x: 60, y: 0, w: 50, h: 40 }),
    makeLine(0, 60, 50, 100),
    makeArrow(60, 60, 110, 100),
    makeText({ x: 0, y: 120, w: 200, h: 40 }, 'hello\nworld'),
  ]) {
    doc = addShape(doc, s);
  }
  // Deterministic ids for round-trip comparison.
  return doc;
}

describe('JSON export/import', () => {
  it('round-trips every shape type with properties intact', () => {
    const doc = sampleDoc();
    const json = exportToJson(doc);
    const result = importFromJson(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document).toEqual(doc);
  });

  it('rejects malformed JSON without throwing', () => {
    const r = importFromJson('{not json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid-json');
  });

  it('rejects files from other apps and unknown versions', () => {
    expect(importFromJson(JSON.stringify({ app: 'other', schemaVersion: 2, document: {} })).ok).toBe(
      false,
    );
    const doc = sampleDoc();
    const file = JSON.parse(exportToJson(doc)) as Record<string, unknown>;
    file['schemaVersion'] = 99;
    const r = importFromJson(JSON.stringify(file));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('unsupported-version');
  });

  it('rejects corrupt shape data without touching anything (pure function)', () => {
    const doc = sampleDoc();
    const file = JSON.parse(exportToJson(doc)) as {
      document: { shapes: Record<string, Record<string, unknown>> };
    };
    const firstId = Object.keys(file.document.shapes)[0];
    file.document.shapes[firstId]['rect'] = { x: 'NaN', y: 0, w: 10, h: 10 };
    const r = importFromJson(JSON.stringify(file));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid-document');
    // Original doc object untouched.
    expect(doc.order.length).toBe(5);
  });

  it('rejects oversized shape counts', () => {
    const shapes: Record<string, unknown> = {};
    const order: string[] = [];
    for (let i = 0; i < MAX_IMPORT_SHAPES + 1; i++) {
      const id = `x${i}`;
      order.push(id);
      shapes[id] = {
        id,
        type: 'rectangle',
        rect: { x: i, y: 0, w: 10, h: 10 },
        fill: '#fff',
        stroke: '#000',
        strokeWidth: 1,
        opacity: 1,
      };
    }
    const file = JSON.stringify({
      app: 'rizoglabs-whiteboard',
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      document: { version: 2, shapes, order },
    });
    const r = importFromJson(file);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('too-many-shapes');
  });

  it('migrates a v1 export', () => {
    const v1file = JSON.stringify({
      app: 'rizoglabs-whiteboard',
      schemaVersion: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      document: {
        version: 1,
        shapes: {
          s1: {
            id: 's1',
            type: 'rectangle',
            rect: { x: 1, y: 2, w: 30, h: 40 },
            fill: '#fff',
            stroke: '#000',
            strokeWidth: 2,
          },
        },
        order: ['s1'],
      },
    });
    const r = importFromJson(v1file);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.document.version).toBe(2);
    expect(r.document.shapes['s1']).toMatchObject({ opacity: 1 });
  });
});
