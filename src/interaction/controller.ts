// Interaction controller: pointer state machine for the canvas.
// Framework-agnostic — talks to the app through hooks. No React here.

import { panBy, screenToWorld, zoomAt, type Camera } from '../core/camera';
import {
  handleAtPoint,
  rectFromPoints,
  rectsIntersect,
  resizeRect,
  sub,
  type HandleId,
  type Rect,
  type Vec,
} from '../core/geometry';
import {
  addShapeAction,
  addShapesAction,
  moveShapesAction,
  reorderShapesAction,
  resizeShapeAction,
  type DocAction,
  type ShapeMove,
} from '../core/history';
import {
  bringForward,
  bringToFront,
  getShape,
  makeArrow,
  makeEllipse,
  makeLine,
  makeRectangle,
  makeText,
  newId,
  resizedShape,
  sendBackward,
  sendToBack,
  shapeAtPoint,
  translatedShape,
  type Shape,
  type WhiteboardDocument,
} from '../core/scene';
import { snapPoint, snapRect } from './snapping';
import { fitTextRect } from '../render/text';

export type Tool = 'select' | 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'text' | 'pan';

export interface ControllerHooks {
  getDocument(): WhiteboardDocument;
  getCamera(): Camera;
  setCamera(cam: Camera): void;
  getTool(): Tool;
  setTool(tool: Tool): void;
  getSelection(): readonly string[];
  setSelection(ids: string[]): void;
  execute(action: DocAction): void;
  undo(): void;
  redo(): void;
  deleteSelection(): void;
  /** Open (or close, with null) the inline text editor for a shape. */
  editText(id: string | null): void;
  /** False while the initial document is still loading — input is gated. */
  isReady(): boolean;
  /** Redraw requested (transient state changed). */
  onChange(): void;
}

type CreateTool = 'rectangle' | 'ellipse' | 'line' | 'arrow';

type DragMode =
  | { kind: 'none' }
  | { kind: 'create'; pointerId: number; tool: 'rectangle' | 'ellipse'; start: Vec; id: string }
  | { kind: 'create-line'; pointerId: number; tool: 'line' | 'arrow'; start: Vec; id: string }
  | { kind: 'create-text'; pointerId: number; start: Vec; moved: boolean }
  | { kind: 'move'; pointerId: number; startWorld: Vec; shapes: Shape[]; moved: boolean }
  | { kind: 'resize'; pointerId: number; shape: Shape; handle: HandleId; from: Rect }
  | { kind: 'marquee'; pointerId: number; start: Vec; current: Rect | null; additive: boolean }
  | { kind: 'pan'; pointerId: number; lastX: number; lastY: number }
  /** Two-finger touch gesture: pinch to zoom, move both fingers to pan. */
  | { kind: 'pinch'; ids: [number, number]; p1: Vec; p2: Vec };

const MIN_CREATE_SIZE = 4; // world units
const MIN_LINE_LENGTH = 4; // world units
const HANDLE_HIT_PX = 10;
const HIT_TOLERANCE_PX = 4;
const SNAP_THRESHOLD_PX = 8;
const ENDPOINT_SNAP_PX = 10;

function isCreateTool(tool: Tool): tool is CreateTool {
  return tool === 'rectangle' || tool === 'ellipse' || tool === 'line' || tool === 'arrow';
}

/** Build the in-progress shape for a create gesture. */
function buildCreateShape(tool: CreateTool, id: string, start: Vec, end: Vec): Shape | null {
  if (tool === 'rectangle' || tool === 'ellipse') {
    const r = rectFromPoints(start, end);
    if (r.w < 3 || r.h < 3) return null;
    const shape = tool === 'rectangle' ? makeRectangle(r) : makeEllipse(r);
    return { ...shape, id };
  }
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.hypot(dx, dy) < 3) return null;
  const shape = tool === 'line' ? makeLine(start.x, start.y, end.x, end.y) : makeArrow(start.x, start.y, end.x, end.y);
  return { ...shape, id };
}

export class InteractionController {
  /** Live shape overrides drawn instead of the committed shapes (during drag). */
  readonly previewShapes = new Map<string, Shape>();
  /** Shape being created (world space). */
  createPreview: Shape | null = null;
  /** Marquee selection rect (world space). */
  marquee: Rect | null = null;
  /** Alignment guides in world coords (while moving). */
  guides: { v: number[]; h: number[] } | null = null;

  private mode: DragMode = { kind: 'none' };
  private spaceDown = false;
  /** Last known screen position of every active pointer (for pinch gestures). */
  private pointerPos = new Map<number, Vec>();
  private disposed = false;
  private clipboard: Shape[] = [];
  private pasteOffset = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private hooks: ControllerHooks,
  ) {
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerCancel);
    canvas.addEventListener('lostpointercapture', this.onLostPointerCapture);
    canvas.addEventListener('dblclick', this.onDoubleClick);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.updateCursor();
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    const { canvas } = this;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerCancel);
    canvas.removeEventListener('lostpointercapture', this.onLostPointerCapture);
    canvas.removeEventListener('dblclick', this.onDoubleClick);
    canvas.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  /** Current tool changed from the outside — refresh cursor. */
  toolChanged(): void {
    this.updateCursor();
  }

  // -------------------------------------------------------------------------
  // Pointer events
  // -------------------------------------------------------------------------

  private screenPos(e: { clientX: number; clientY: number }): Vec {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.hooks.isReady()) return;
    const active = this.mode;
    if (active.kind === 'pinch') return; // third finger during pinch: ignore
    if (active.kind !== 'none' && e.pointerId !== active.pointerId) {
      // A second concurrent touch pointer switches to pinch-to-zoom/pan
      // instead of hijacking the active drag.
      if (e.pointerType === 'touch') this.beginPinch(e, active.pointerId);
      return;
    }
    if (e.pointerType === 'mouse' && e.button === 2) return; // ignore right button
    e.preventDefault();
    const { hooks } = this;
    const screen = this.screenPos(e);
    this.pointerPos.set(e.pointerId, screen);
    const cam = hooks.getCamera();
    const tool = hooks.getTool();

    if (e.button === 1 || this.spaceDown || tool === 'pan') {
      this.mode = { kind: 'pan', pointerId: e.pointerId, lastX: screen.x, lastY: screen.y };
      this.canvas.setPointerCapture(e.pointerId);
      this.updateCursor('grabbing');
      return;
    }

    const world = screenToWorld(cam, screen);

    if (tool === 'text') {
      this.mode = { kind: 'create-text', pointerId: e.pointerId, start: world, moved: false };
      this.canvas.setPointerCapture(e.pointerId);
      this.updateCursor('text');
      return;
    }

    if (isCreateTool(tool)) {
      const snapped = tool === 'line' || tool === 'arrow'
        ? snapPoint(world, this.otherRects([]), ENDPOINT_SNAP_PX / cam.zoom).p
        : world;
      const id = newId();
      this.mode = tool === 'line' || tool === 'arrow'
        ? { kind: 'create-line', pointerId: e.pointerId, tool, start: snapped, id }
        : { kind: 'create', pointerId: e.pointerId, tool, start: snapped, id };
      this.canvas.setPointerCapture(e.pointerId);
      this.updateCursor('crosshair');
      return;
    }

    // select tool
    const doc = hooks.getDocument();
    const selection = hooks.getSelection();
    const hitTol = HIT_TOLERANCE_PX / cam.zoom;

    // Resize handle of the single selected shape?
    if (selection.length === 1) {
      const shape = getShape(doc, selection[0]);
      if (shape) {
        const handle = handleAtPoint(shape.rect, world, HANDLE_HIT_PX / cam.zoom);
        if (handle) {
          this.mode = { kind: 'resize', pointerId: e.pointerId, shape, handle, from: { ...shape.rect } };
          this.canvas.setPointerCapture(e.pointerId);
          this.updateCursor(cursorForHandle(handle));
          return;
        }
      }
    }

    const hit = shapeAtPoint(doc, world.x, world.y, hitTol);
    if (hit) {
      let nextSelection: string[];
      if (e.shiftKey) {
        nextSelection = selection.includes(hit.id)
          ? selection.filter((id) => id !== hit.id)
          : [...selection, hit.id];
      } else if (selection.includes(hit.id)) {
        nextSelection = [...selection];
      } else {
        nextSelection = [hit.id];
      }
      hooks.setSelection(nextSelection);
      const shapes = nextSelection
        .map((id) => getShape(hooks.getDocument(), id))
        .filter((s): s is Shape => s !== undefined);
      this.mode = { kind: 'move', pointerId: e.pointerId, startWorld: world, shapes, moved: false };
      this.canvas.setPointerCapture(e.pointerId);
      this.updateCursor('move');
      return;
    }

    // Empty space: marquee select (shift = additive), clear selection otherwise.
    if (!e.shiftKey) hooks.setSelection([]);
    this.mode = { kind: 'marquee', pointerId: e.pointerId, start: world, current: null, additive: e.shiftKey };
    this.canvas.setPointerCapture(e.pointerId);
  };

  /** Second touch finger went down mid-gesture: switch to pinch zoom/pan. */
  private beginPinch(e: PointerEvent, firstId: number): void {
    e.preventDefault();
    const p2 = this.screenPos(e);
    const p1 = this.pointerPos.get(firstId) ?? p2;
    // Discard the interrupted single-pointer gesture — nothing is committed
    // on pointerdown, so no shape or history entry is lost.
    this.cancelTransient();
    this.mode = { kind: 'pinch', ids: [firstId, e.pointerId], p1, p2 };
    this.pointerPos.set(e.pointerId, p2);
    this.canvas.setPointerCapture(e.pointerId);
    this.updateCursor('grabbing');
    this.hooks.onChange();
  }

  /** One pinch finger lifted: the finger still down continues as a pan. */
  private endPinch(liftedId: number): void {
    const mode = this.mode;
    if (mode.kind !== 'pinch') return;
    const remaining = mode.ids[0] === liftedId ? mode.ids[1] : mode.ids[0];
    const pos = this.pointerPos.get(remaining);
    this.pointerPos.delete(liftedId);
    // Claim the mode first so the lostpointercapture from release is a no-op.
    if (pos) {
      this.mode = { kind: 'pan', pointerId: remaining, lastX: pos.x, lastY: pos.y };
      this.updateCursor('grabbing');
    } else {
      this.mode = { kind: 'none' };
      this.updateCursor();
    }
    if (this.canvas.hasPointerCapture(liftedId)) {
      this.canvas.releasePointerCapture(liftedId);
    }
    this.hooks.onChange();
  }

  private otherRects(excludeIds: readonly string[]): Rect[] {
    const exclude = new Set(excludeIds);
    const out: Rect[] = [];
    for (const s of Object.values(this.hooks.getDocument().shapes)) {
      if (!exclude.has(s.id)) out.push(s.rect);
    }
    return out;
  }

  private onPointerMove = (e: PointerEvent): void => {
    const { hooks } = this;
    const screen = this.screenPos(e);
    this.pointerPos.set(e.pointerId, screen);
    const cam = hooks.getCamera();
    const world = screenToWorld(cam, screen);
    const mode = this.mode;

    if (mode.kind === 'pinch') {
      if (e.pointerId !== mode.ids[0] && e.pointerId !== mode.ids[1]) return;
      const prev1 = mode.p1;
      const prev2 = mode.p2;
      if (e.pointerId === mode.ids[0]) mode.p1 = screen;
      else mode.p2 = screen;
      const prevDist = Math.hypot(prev1.x - prev2.x, prev1.y - prev2.y);
      const newDist = Math.hypot(mode.p1.x - mode.p2.x, mode.p1.y - mode.p2.y);
      const prevMid = { x: (prev1.x + prev2.x) / 2, y: (prev1.y + prev2.y) / 2 };
      const newMid = { x: (mode.p1.x + mode.p2.x) / 2, y: (mode.p1.y + mode.p2.y) / 2 };
      // Move both fingers together to pan; spread/pinch them to zoom.
      let next = panBy(cam, newMid.x - prevMid.x, newMid.y - prevMid.y);
      if (prevDist > 0 && newDist > 0) {
        next = zoomAt(next, newMid, newDist / prevDist);
      }
      hooks.setCamera(next);
      hooks.onChange();
      return;
    }

    switch (mode.kind) {
      case 'none': {
        this.updateHoverCursor(world, cam.zoom);
        return;
      }
      case 'pan': {
        if (e.pointerId !== mode.pointerId) return;
        hooks.setCamera(panBy(cam, screen.x - mode.lastX, screen.y - mode.lastY));
        mode.lastX = screen.x;
        mode.lastY = screen.y;
        hooks.onChange();
        return;
      }
      case 'create':
      case 'create-line': {
        if (e.pointerId !== mode.pointerId) return;
        const end = mode.kind === 'create-line'
          ? snapPoint(world, this.otherRects([]), ENDPOINT_SNAP_PX / cam.zoom).p
          : world;
        this.createPreview = buildCreateShape(mode.tool, mode.id, mode.start, end);
        hooks.onChange();
        return;
      }
      case 'create-text': {
        if (e.pointerId !== mode.pointerId) return;
        if (Math.hypot(world.x - mode.start.x, world.y - mode.start.y) > 4 / cam.zoom) {
          mode.moved = true;
        }
        const r = rectFromPoints(mode.start, world);
        this.createPreview = r.w >= 3 && r.h >= 3
          ? { ...makeText(r, ''), id: newId() }
          : null;
        hooks.onChange();
        return;
      }
      case 'move': {
        if (e.pointerId !== mode.pointerId) return;
        const delta = sub(world, mode.startWorld);
        if (Math.abs(delta.x) > 2 / cam.zoom || Math.abs(delta.y) > 2 / cam.zoom) {
          mode.moved = true;
        }
        // Snap the union bbox of the moving shapes, then apply one delta to all.
        let ux = Infinity;
        let uy = Infinity;
        let uw = -Infinity;
        let uh = -Infinity;
        for (const s of mode.shapes) {
          ux = Math.min(ux, s.rect.x + delta.x);
          uy = Math.min(uy, s.rect.y + delta.y);
          uw = Math.max(uw, s.rect.x + s.rect.w + delta.x);
          uh = Math.max(uh, s.rect.y + s.rect.h + delta.y);
        }
        const raw = { x: ux, y: uy, w: uw - ux, h: uh - uy };
        const snap = snapRect(raw, this.otherRects(mode.shapes.map((s) => s.id)), SNAP_THRESHOLD_PX / cam.zoom);
        const dx = delta.x + snap.dx;
        const dy = delta.y + snap.dy;
        this.guides = snap.guidesV.length > 0 || snap.guidesH.length > 0
          ? { v: snap.guidesV, h: snap.guidesH }
          : null;
        this.previewShapes.clear();
        for (const s of mode.shapes) {
          this.previewShapes.set(s.id, translatedShape(s, dx, dy));
        }
        hooks.onChange();
        return;
      }
      case 'resize': {
        if (e.pointerId !== mode.pointerId) return;
        const r = resizeRect(mode.from, mode.handle, world);
        let preview = resizedShape(mode.shape, r);
        if (preview.type === 'text') {
          preview = { ...preview, rect: fitTextRect(r, preview.text, preview.fontSize) };
        }
        this.previewShapes.set(mode.shape.id, preview);
        hooks.onChange();
        return;
      }
      case 'marquee': {
        if (e.pointerId !== mode.pointerId) return;
        const r = rectFromPoints(mode.start, world);
        mode.current = r;
        this.marquee = r;
        hooks.onChange();
        return;
      }
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    const { hooks } = this;
    const mode = this.mode;
    if (mode.kind === 'pinch') {
      if (!mode.ids.includes(e.pointerId)) return;
      this.endPinch(e.pointerId);
      return;
    }
    if (mode.kind !== 'none' && e.pointerId !== mode.pointerId) return;
    this.pointerPos.delete(e.pointerId);
    // Claim the mode first so the lostpointercapture fired by releasePointerCapture is a no-op.
    this.mode = { kind: 'none' };
    if (this.canvas.hasPointerCapture(e.pointerId)) {
      this.canvas.releasePointerCapture(e.pointerId);
    }

    switch (mode.kind) {
      case 'create':
      case 'create-line': {
        const shape = this.createPreview;
        this.createPreview = null;
        if (shape && this.createSizeOk(shape)) {
          hooks.execute(addShapeAction(shape));
          hooks.setSelection([shape.id]);
          hooks.setTool('select');
        }
        break;
      }
      case 'create-text': {
        this.createPreview = null;
        const world = screenToWorld(hooks.getCamera(), this.screenPos(e));
        const r = mode.moved ? rectFromPoints(mode.start, world) : { x: mode.start.x - 110, y: mode.start.y - 40, w: 220, h: 80 };
        const shape = makeText({ ...r, w: Math.max(40, r.w) }, '');
        const fitted: Shape = { ...shape, rect: fitTextRect(shape.rect, '', shape.fontSize) };
        hooks.execute(addShapeAction(fitted));
        hooks.setSelection([fitted.id]);
        hooks.setTool('select');
        hooks.editText(fitted.id);
        break;
      }
      case 'move': {
        const previews = mode.shapes
          .map((s) => {
            const p = this.previewShapes.get(s.id);
            return p && (p.rect.x !== s.rect.x || p.rect.y !== s.rect.y) ? { s, p } : null;
          })
          .filter((x): x is { s: Shape; p: Shape } => x !== null);
        this.previewShapes.clear();
        this.guides = null;
        if (mode.moved && previews.length > 0) {
          const moves: ShapeMove[] = previews.map(({ s, p }) => ({
            id: s.id,
            from: { ...s.rect },
            to: { ...p.rect },
          }));
          hooks.execute(moveShapesAction(moves));
        }
        break;
      }
      case 'resize': {
        const preview = this.previewShapes.get(mode.shape.id);
        this.previewShapes.clear();
        if (preview) {
          const to = preview.rect;
          const from = mode.from;
          if (to.x !== from.x || to.y !== from.y || to.w !== from.w || to.h !== from.h) {
            hooks.execute(resizeShapeAction(mode.shape.id, { ...from }, { ...to }));
          }
        }
        break;
      }
      case 'marquee': {
        const r = this.marquee;
        this.marquee = null;
        if (r) {
          const doc = hooks.getDocument();
          const hits: string[] = [];
          // back-to-front so topmost ends up last in selection order
          for (const id of doc.order) {
            const s = getShape(doc, id);
            if (s && rectsIntersect(r, s.rect)) hits.push(s.id);
          }
          if (mode.additive) {
            const merged = [...hooks.getSelection()];
            for (const id of hits) if (!merged.includes(id)) merged.push(id);
            hooks.setSelection(merged);
          } else {
            hooks.setSelection(hits);
          }
        }
        break;
      }
      case 'pan':
      case 'none':
        break;
    }

    this.updateCursor();
    hooks.onChange();
  };

  private createSizeOk(shape: Shape): boolean {
    if (shape.type === 'line' || shape.type === 'arrow') {
      return Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1) >= MIN_LINE_LENGTH;
    }
    return shape.rect.w >= MIN_CREATE_SIZE && shape.rect.h >= MIN_CREATE_SIZE;
  }

  /**
   * A cancelled gesture commits nothing: discard the transient drag state
   * instead of treating it like a pointerup. Selection is left untouched.
   */
  private onPointerCancel = (e: PointerEvent): void => {
    const { hooks } = this;
    const mode = this.mode;
    if (mode.kind === 'pinch') {
      if (!mode.ids.includes(e.pointerId)) return;
      this.endPinch(e.pointerId);
      return;
    }
    if (mode.kind !== 'none' && e.pointerId !== mode.pointerId) return;
    this.pointerPos.delete(e.pointerId);
    this.cancelTransient();
    if (this.canvas.hasPointerCapture(e.pointerId)) {
      this.canvas.releasePointerCapture(e.pointerId);
    }
    this.updateCursor();
    hooks.onChange();
  };

  private onLostPointerCapture = (e: PointerEvent): void => {
    const mode = this.mode;
    if (mode.kind === 'pinch') {
      if (!mode.ids.includes(e.pointerId)) return;
      // Capture was lost outside the normal up/cancel flow — drop the gesture safely.
      this.endPinch(e.pointerId);
      return;
    }
    if (mode.kind === 'none' || e.pointerId !== mode.pointerId) return;
    // Capture was lost outside the normal up/cancel flow — drop the gesture safely.
    this.cancelTransient();
    this.updateCursor();
    this.hooks.onChange();
  };

  private onDoubleClick = (e: MouseEvent): void => {
    if (!this.hooks.isReady()) return;
    const { hooks } = this;
    const world = screenToWorld(hooks.getCamera(), this.screenPos(e));
    const cam = hooks.getCamera();
    const hit = shapeAtPoint(hooks.getDocument(), world.x, world.y, HIT_TOLERANCE_PX / cam.zoom);
    if (hit && hit.type === 'text') {
      hooks.setSelection([hit.id]);
      hooks.editText(hit.id);
    }
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const { hooks } = this;
    const factor = Math.exp(-e.deltaY * 0.0015);
    hooks.setCamera(zoomAt(hooks.getCamera(), this.screenPos(e), factor));
    hooks.onChange();
  };

  // -------------------------------------------------------------------------
  // Clipboard & z-order
  // -------------------------------------------------------------------------

  /** Copy the current selection to the internal clipboard. */
  copySelection(): void {
    const doc = this.hooks.getDocument();
    const shapes = this.hooks
      .getSelection()
      .map((id) => getShape(doc, id))
      .filter((s): s is Shape => s !== undefined)
      .map((s) => JSON.parse(JSON.stringify(s)) as Shape);
    if (shapes.length > 0) {
      this.clipboard = shapes;
      this.pasteOffset = 0;
    }
  }

  /** Paste the clipboard contents with new ids, offset down-right. */
  pasteClipboard(label: string): void {
    if (this.clipboard.length === 0) return;
    this.pasteOffset += 24;
    const dx = this.pasteOffset;
    const dy = this.pasteOffset;
    const copies = this.clipboard.map((s) => {
      const c = JSON.parse(JSON.stringify(s)) as Shape;
      c.id = newId();
      return translatedShape(c, dx, dy);
    });
    this.hooks.execute(addShapesAction(copies, label));
    this.hooks.setSelection(copies.map((c) => c.id));
  }

  /** Duplicate the current selection in one undoable step. */
  duplicateSelection(): void {
    this.copySelection();
    this.pasteClipboard('Duplicate');
  }

  /** Select every shape in the document. */
  selectAll(): void {
    this.hooks.setSelection([...this.hooks.getDocument().order]);
  }

  /** Move the selection in the z-order as one undoable step. */
  reorderSelected(kind: 'forward' | 'backward' | 'front' | 'back'): void {
    const doc = this.hooks.getDocument();
    const selection = this.hooks.getSelection();
    if (selection.length === 0) return;
    const before = [...doc.order];
    let after: string[];
    switch (kind) {
      case 'forward':
        after = bringForward(before, selection);
        break;
      case 'backward':
        after = sendBackward(before, selection);
        break;
      case 'front':
        after = bringToFront(before, selection);
        break;
      case 'back':
        after = sendToBack(before, selection);
        break;
    }
    if (after.join('\0') === before.join('\0')) return;
    this.hooks.execute(reorderShapesAction(before, after));
  }

  // -------------------------------------------------------------------------
  // Keyboard
  // -------------------------------------------------------------------------

  private onKeyDown = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    const { hooks } = this;
    if (!hooks.isReady()) return;

    if (e.code === 'Space') {
      if (!this.spaceDown) {
        this.spaceDown = true;
        this.updateCursor('grab');
      }
      e.preventDefault();
      return;
    }

    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) hooks.redo();
      else hooks.undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      hooks.redo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      this.copySelection();
      return;
    }
    if (mod && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      this.pasteClipboard('Paste');
      return;
    }
    if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      this.duplicateSelection();
      return;
    }
    if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      this.selectAll();
      return;
    }
    if (mod && e.key === ']') {
      e.preventDefault();
      this.reorderSelected('forward');
      return;
    }
    if (mod && e.key === '[') {
      e.preventDefault();
      this.reorderSelected('backward');
      return;
    }

    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        hooks.deleteSelection();
        break;
      case 'Escape':
        this.cancelTransient();
        hooks.setSelection([]);
        hooks.editText(null);
        hooks.onChange();
        break;
      case 'v':
      case 'V':
        if (!mod) hooks.setTool('select');
        break;
      case 'r':
      case 'R':
        if (!mod) hooks.setTool('rectangle');
        break;
      case 'e':
      case 'E':
        if (!mod) hooks.setTool('ellipse');
        break;
      case 'l':
      case 'L':
        if (!mod) hooks.setTool('line');
        break;
      case 'a':
      case 'A':
        if (!mod) hooks.setTool('arrow');
        break;
      case 't':
      case 'T':
        if (!mod) hooks.setTool('text');
        break;
      case 'h':
      case 'H':
        if (!mod) hooks.setTool('pan');
        break;
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Space') {
      this.spaceDown = false;
      this.updateCursor();
    }
  };

  private cancelTransient(): void {
    this.mode = { kind: 'none' };
    this.previewShapes.clear();
    this.createPreview = null;
    this.marquee = null;
    this.guides = null;
  }

  // -------------------------------------------------------------------------
  // Cursor
  // -------------------------------------------------------------------------

  private updateCursor(force?: string): void {
    if (force) {
      this.canvas.style.cursor = force;
      return;
    }
    if (this.spaceDown) {
      this.canvas.style.cursor = 'grab';
      return;
    }
    const tool = this.hooks.getTool();
    this.canvas.style.cursor =
      tool === 'pan' ? 'grab' : tool === 'text' ? 'text' : tool === 'select' ? 'default' : 'crosshair';
  }

  private updateHoverCursor(world: Vec, zoom: number): void {
    const selection = this.hooks.getSelection();
    if (selection.length === 1) {
      const shape = getShape(this.hooks.getDocument(), selection[0]);
      if (shape) {
        const handle = handleAtPoint(shape.rect, world, HANDLE_HIT_PX / zoom);
        if (handle) {
          this.canvas.style.cursor = cursorForHandle(handle);
          return;
        }
      }
    }
    this.updateCursor();
  }
}

function cursorForHandle(handle: HandleId): string {
  switch (handle) {
    case 'nw':
    case 'se':
      return 'nwse-resize';
    case 'ne':
    case 'sw':
      return 'nesw-resize';
    case 'n':
    case 's':
      return 'ns-resize';
    case 'e':
    case 'w':
      return 'ew-resize';
  }
}
