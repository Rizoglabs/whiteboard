import { describe, expect, it } from 'vitest';
import { migrateDocument } from './migrate';
import { CURRENT_DOC_VERSION } from './scene';

describe('migrateDocument', () => {
  it('accepts a current v2 document unchanged', () => {
    const doc = {
      version: 2,
      shapes: {
        s1: {
          id: 's1',
          type: 'text',
          rect: { x: 0, y: 0, w: 100, h: 30 },
          fill: '#111',
          stroke: 'none',
          strokeWidth: 2,
          opacity: 0.5,
          text: 'hi',
          fontSize: 16,
          align: 'center',
        },
      },
      order: ['s1'],
    };
    const out = migrateDocument(doc);
    expect(out).toEqual(doc);
    expect(out?.version).toBe(CURRENT_DOC_VERSION);
  });

  it('migrates a v1 rectangle document, adding opacity', () => {
    const v1 = {
      version: 1,
      shapes: {
        s1: {
          id: 's1',
          type: 'rectangle',
          rect: { x: 5, y: 5, w: 20, h: 20 },
          fill: '#fff',
          stroke: '#000',
          strokeWidth: 2,
        },
      },
      order: ['s1'],
    };
    const out = migrateDocument(v1);
    expect(out?.version).toBe(2);
    expect(out?.shapes['s1']).toMatchObject({ type: 'rectangle', opacity: 1 });
  });

  it('rejects documents with unknown shape types', () => {
    const bad = {
      version: 2,
      shapes: {
        s1: {
          id: 's1',
          type: 'star',
          rect: { x: 0, y: 0, w: 10, h: 10 },
          fill: '#fff',
          stroke: '#000',
          strokeWidth: 1,
          opacity: 1,
        },
      },
      order: ['s1'],
    };
    expect(migrateDocument(bad)).toBeNull();
  });

  it('rejects non-finite coordinates and bad opacity', () => {
    const nan = {
      version: 2,
      shapes: {
        s1: {
          id: 's1',
          type: 'rectangle',
          rect: { x: NaN, y: 0, w: 10, h: 10 },
          fill: '#fff',
          stroke: '#000',
          strokeWidth: 1,
          opacity: 1,
        },
      },
      order: ['s1'],
    };
    expect(migrateDocument(nan)).toBeNull();

    const badOpacity = {
      version: 2,
      shapes: {
        s1: {
          id: 's1',
          type: 'rectangle',
          rect: { x: 0, y: 0, w: 10, h: 10 },
          fill: '#fff',
          stroke: '#000',
          strokeWidth: 1,
          opacity: 2,
        },
      },
      order: ['s1'],
    };
    expect(migrateDocument(badOpacity)).toBeNull();
  });

  it('rejects line shapes with missing endpoints and text with bad align', () => {
    const noEndpoints = {
      version: 2,
      shapes: {
        s1: {
          id: 's1',
          type: 'line',
          rect: { x: 0, y: 0, w: 10, h: 10 },
          fill: 'none',
          stroke: '#000',
          strokeWidth: 1,
          opacity: 1,
        },
      },
      order: ['s1'],
    };
    expect(migrateDocument(noEndpoints)).toBeNull();

    const badAlign = {
      version: 2,
      shapes: {
        s1: {
          id: 's1',
          type: 'text',
          rect: { x: 0, y: 0, w: 100, h: 30 },
          fill: '#111',
          stroke: 'none',
          strokeWidth: 1,
          opacity: 1,
          text: 'x',
          fontSize: 12,
          align: 'justify',
        },
      },
      order: ['s1'],
    };
    expect(migrateDocument(badAlign)).toBeNull();
  });

  it('rejects duplicate order ids, unknown versions, and non-objects', () => {
    const dup = { version: 2, shapes: {}, order: ['a', 'a'] };
    expect(migrateDocument(dup)).toBeNull();
    expect(migrateDocument({ version: 99, shapes: {}, order: [] })).toBeNull();
    expect(migrateDocument(null)).toBeNull();
    expect(migrateDocument('nope')).toBeNull();
    expect(migrateDocument(undefined)).toBeNull();
  });
});
