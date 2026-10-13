// Undo/redo through document actions. Each action knows how to apply
// itself and how to revert itself — the document stays immutable.

import type { Rect } from './geometry';
import type { Shape, WhiteboardDocument } from './scene';
import {
  addShape,
  addShapes,
  removeShapes,
  reorderShapes,
  resizeShapeInDoc,
  translateShapeInDoc,
} from './scene';

export interface DocAction {
  label: string;
  apply(doc: WhiteboardDocument): WhiteboardDocument;
  revert(doc: WhiteboardDocument): WhiteboardDocument;
}

export function addShapeAction(shape: Shape): DocAction {
  return {
    label: 'Add shape',
    apply: (doc) => addShape(doc, shape),
    revert: (doc) => removeShapes(doc, [shape.id]),
  };
}

export function deleteShapesAction(
  doc: WhiteboardDocument,
  ids: readonly string[],
): DocAction {
  // Snapshot so undo restores the exact shapes and z-order. Safe because
  // undo/redo are strictly LIFO: revert always runs on this action's apply result.
  const snapshotShapes = { ...doc.shapes };
  const snapshotOrder = [...doc.order];
  return {
    label: 'Delete shapes',
    apply: (d) => removeShapes(d, ids),
    revert: (d) => ({ ...d, shapes: { ...snapshotShapes }, order: [...snapshotOrder] }),
  };
}

export interface ShapeMove {
  id: string;
  from: Rect;
  to: Rect;
}

export function moveShapesAction(moves: ShapeMove[]): DocAction {
  return {
    label: 'Move shapes',
    apply: (doc) => {
      let next = doc;
      for (const m of moves) {
        next = translateShapeInDoc(next, m.id, m.to.x - m.from.x, m.to.y - m.from.y);
      }
      return next;
    },
    revert: (doc) => {
      let next = doc;
      for (const m of moves) {
        next = translateShapeInDoc(next, m.id, m.from.x - m.to.x, m.from.y - m.to.y);
      }
      return next;
    },
  };
}

export function resizeShapeAction(id: string, from: Rect, to: Rect): DocAction {
  return {
    label: 'Resize shape',
    apply: (doc) => resizeShapeInDoc(doc, id, to),
    revert: (doc) => resizeShapeInDoc(doc, id, from),
  };
}

/** Add several shapes in one undoable step (e.g. paste). */
export function addShapesAction(shapes: Shape[], label = 'Add shapes'): DocAction {
  const ids = shapes.map((s) => s.id);
  return {
    label,
    apply: (doc) => addShapes(doc, shapes),
    revert: (doc) => removeShapes(doc, ids),
  };
}

export interface ShapePatch {
  id: string;
  /** Full shape before the change (for undo). */
  before: Shape;
  /** Full shape after the change (for redo). */
  after: Shape;
}

/** Property/text changes as one undoable step. */
export function patchShapesAction(patches: ShapePatch[], label = 'Change properties'): DocAction {
  return {
    label,
    apply: (doc) => {
      let next = doc;
      for (const p of patches) {
        if (next.shapes[p.id]) {
          next = { ...next, shapes: { ...next.shapes, [p.id]: p.after } };
        }
      }
      return next;
    },
    revert: (doc) => {
      let next = doc;
      for (const p of patches) {
        if (next.shapes[p.id]) {
          next = { ...next, shapes: { ...next.shapes, [p.id]: p.before } };
        }
      }
      return next;
    },
  };
}

/** Z-order change as one undoable step. */
export function reorderShapesAction(beforeOrder: string[], afterOrder: string[]): DocAction {
  return {
    label: 'Reorder shapes',
    apply: (doc) => reorderShapes(doc, afterOrder),
    revert: (doc) => reorderShapes(doc, beforeOrder),
  };
}

/** Whole-document replace (e.g. JSON import). Undo restores the previous document. */
export function replaceDocumentAction(
  before: WhiteboardDocument,
  after: WhiteboardDocument,
): DocAction {
  return {
    label: 'Import document',
    apply: () => after,
    revert: () => before,
  };
}

export class History {
  private past: DocAction[] = [];
  private future: DocAction[] = [];
  private doc: WhiteboardDocument;

  constructor(initial: WhiteboardDocument) {
    this.doc = initial;
  }

  get document(): WhiteboardDocument {
    return this.doc;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get undoLabel(): string | null {
    return this.past.length > 0 ? this.past[this.past.length - 1].label : null;
  }

  execute(action: DocAction): void {
    this.doc = action.apply(this.doc);
    this.past.push(action);
    this.future = [];
  }

  undo(): void {
    const action = this.past.pop();
    if (!action) return;
    this.doc = action.revert(this.doc);
    this.future.push(action);
  }

  redo(): void {
    const action = this.future.pop();
    if (!action) return;
    this.doc = action.apply(this.doc);
    this.past.push(action);
  }

  /** Replace the document (e.g. after loading from storage); clears stacks. */
  loadDocument(doc: WhiteboardDocument): void {
    this.doc = doc;
    this.past = [];
    this.future = [];
  }
}
