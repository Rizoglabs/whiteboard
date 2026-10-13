// JSON export/import with schema versioning, strict validation, and migration.
// Import is atomic: the scene only changes after the whole file validates.

import { migrateDocument } from '../core/migrate';
import type { WhiteboardDocument } from '../core/scene';

export const EXPORT_SCHEMA_VERSION = 2;
export const EXPORT_APP_ID = 'rizoglabs-whiteboard';
/** Reject files larger than 2 MiB. */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
/** Reject documents with more than 5000 shapes. */
export const MAX_IMPORT_SHAPES = 5000;

export interface ExportFile {
  app: typeof EXPORT_APP_ID;
  schemaVersion: number;
  exportedAt: string;
  document: WhiteboardDocument;
}

export function exportToJson(doc: WhiteboardDocument): string {
  const file: ExportFile = {
    app: EXPORT_APP_ID,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    document: doc,
  };
  return JSON.stringify(file, null, 2);
}

export interface ImportError {
  code:
    | 'too-large'
    | 'invalid-json'
    | 'not-an-object'
    | 'unknown-app'
    | 'unsupported-version'
    | 'invalid-document'
    | 'too-many-shapes';
  message: string;
}

export type ImportResult =
  | { ok: true; document: WhiteboardDocument }
  | { ok: false; error: ImportError };

function fail(code: ImportError['code'], message: string): ImportResult {
  return { ok: false, error: { code, message } };
}

/** Parse and validate an exported file. Never throws; never mutates the scene. */
export function importFromJson(text: string): ImportResult {
  if (text.length > MAX_IMPORT_BYTES) {
    return fail('too-large', `File is too large (max ${MAX_IMPORT_BYTES / 1024 / 1024} MiB).`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('invalid-json', 'File is not valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return fail('not-an-object', 'File does not contain a whiteboard document.');
  }
  const f = parsed as Record<string, unknown>;
  if (f['app'] !== EXPORT_APP_ID) {
    return fail('unknown-app', 'File was not exported by this whiteboard app.');
  }
  if (f['schemaVersion'] !== 1 && f['schemaVersion'] !== EXPORT_SCHEMA_VERSION) {
    return fail(
      'unsupported-version',
      `Unsupported file version (${String(f['schemaVersion'])}).`,
    );
  }
  const doc = migrateDocument(f['document']);
  if (!doc) {
    return fail('invalid-document', 'Document data is corrupt or has invalid shapes.');
  }
  if (doc.order.length > MAX_IMPORT_SHAPES) {
    return fail('too-many-shapes', `Document has too many shapes (max ${MAX_IMPORT_SHAPES}).`);
  }
  return { ok: true, document: doc };
}
