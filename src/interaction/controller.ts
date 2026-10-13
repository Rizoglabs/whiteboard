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
  moveShapesAction,
  resizeShapeAction,
  type DocAction,
  type ShapeMove,
} from '../core/history';
import {
  getShape,
  newId,
  shapeAtPoint,
  type RectangleShape,
  type Shape,
  type WhiteboardDocument,
} from '../core/scene';

export type Tool = 'select' | 'rectangle' | 'pan';

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
  /** Redraw requested (transient state changed). */
  onChange(): void;
}

type DragMode =
  | { kind: 'none' }
  | { kind: 'create'; pointerId: number; start: Vec; current: Rect | null }
  | { kind: 'move'; pointerId: number; startWorld: Vec; moves: ShapeMove[]; moved: boolean }
  | { kind: 'resize'; pointerId: number; shapeId: string; handle: HandleId; from: Rect }
  | { kind: 'marquee'; pointerId: number; start: Vec; current: Rect | null; additive: boolean }
  | { kind: 'pan'; pointerId: number; lastX: number; lastY: number };

const MIN_CREATE_SIZE = 4; // world units
const HANDLE_HIT_PX = 10;
const HIT_TOLERANCE_PX = 4;

const DEFAULT_FILL = '#fef3c7';
const DEFAULT_STROKE = '#b45309';
const DEFAULT_STROKE_WIDTH = 2;

export class InteractionController {
  /** Live rect overrides drawn instead of the committed rects (during drag). */
  readonly previewRects = new Map<string, Rect>();
  /** Rect being created (world space). */
  createPreview: Rect | null = null;
  /** Marquee selection rect (world space). */
  marquee: Rect | null = null;

  private mode: DragMode = { kind: 'none' };
  private spaceDown = false;
  private disposed = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private hooks: ControllerHooks,
  ) {
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
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
    canvas.removeEventListener('pointercancel', this.onPointerUp);
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
    if (e.pointerType === 'mouse' && e.button === 2) return; // ignore right button
    e.preventDefault();
    const { hooks } = this;
    const screen = this.screenPos(e);
    const cam = hooks.getCamera();
    const tool = hooks.getTool();

    if (e.button === 1 || this.spaceDown || tool === 'pan') {
      this.mode = { kind: 'pan', pointerId: e.pointerId, lastX: screen.x, lastY: screen.y };
      this.canvas.setPointerCapture(e.pointerId);
      this.updateCursor('grabbing');
      return;
    }

    const world = screenToWorld(cam, screen);

    if (tool === 'rectangle') {
      this.mode = { kind: 'create', pointerId: e.pointerId, start: world, current: null };
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
          this.mode = { kind: 'resize', pointerId: e.pointerId, shapeId: shape.id, handle, from: { ...shape.rect } };
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
      const moves: ShapeMove[] = nextSelection
        .map((id) => {
          const s = getShape(hooks.getDocument(), id);
          return s ? { id, from: { ...s.rect }, to: { ...s.rect } } : null;
        })
        .filter((m): m is ShapeMove => m !== null);
      this.mode = { kind: 'move', pointerId: e.pointerId, startWorld: world, moves, moved: false };
      this.canvas.setPointerCapture(e.pointerId);
      this.updateCursor('move');
      return;
    }

    // Empty space: marquee select (shift = additive), clear selection otherwise.
    if (!e.shiftKey) hooks.setSelection([]);
    this.mode = { kind: 'marquee', pointerId: e.pointerId, start: world, current: null, additive: e.shiftKey };
    this.canvas.setPointerCapture(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent): void => {
    const { hooks } = this;
    const screen = this.screenPos(e);
    const cam = hooks.getCamera();
    const world = screenToWorld(cam, screen);
    const mode = this.mode;

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
      case 'create': {
        if (e.pointerId !== mode.pointerId) return;
        const r = rectFromPoints(mode.start, world);
        mode.current = r.w >= 3 && r.h >= 3 ? r : null;
        this.createPreview = mode.current;
        hooks.onChange();
        return;
      }
      case 'move': {
        if (e.pointerId !== mode.pointerId) return;
        const delta = sub(world, mode.startWorld);
        if (Math.abs(delta.x) > 2 / cam.zoom || Math.abs(delta.y) > 2 / cam.zoom) {
          mode.moved = true;
        }
        this.previewRects.clear();
        for (const m of mode.moves) {
          m.to = { ...m.from, x: m.from.x + delta.x, y: m.from.y + delta.y };
          this.previewRects.set(m.id, m.to);
        }
        hooks.onChange();
        return;
      }
      case 'resize': {
        if (e.pointerId !== mode.pointerId) return;
        const r = resizeRect(mode.from, mode.handle, world);
        this.previewRects.set(mode.shapeId, r);
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
    if (mode.kind !== 'none' && 'pointerId' in mode && e.pointerId !== mode.pointerId) return;
    if (this.canvas.hasPointerCapture(e.pointerId)) {
      this.canvas.releasePointerCapture(e.pointerId);
    }

    switch (mode.kind) {
      case 'create': {
        const r = mode.current;
        this.createPreview = null;
        if (r && r.w >= MIN_CREATE_SIZE && r.h >= MIN_CREATE_SIZE) {
          const shape: RectangleShape = {
            id: newId(),
            type: 'rectangle',
            rect: r,
            fill: DEFAULT_FILL,
            stroke: DEFAULT_STROKE,
            strokeWidth: DEFAULT_STROKE_WIDTH,
          };
          hooks.execute(addShapeAction(shape));
          hooks.setSelection([shape.id]);
          hooks.setTool('select');
        }
        break;
      }
      case 'move': {
        const moves = mode.moves.filter(
          (m) => m.to.x !== m.from.x || m.to.y !== m.from.y,
        );
        this.previewRects.clear();
        if (mode.moved && moves.length > 0) {
          hooks.execute(moveShapesAction(moves));
        }
        break;
      }
      case 'resize': {
        const finalRect = this.previewRects.get(mode.shapeId);
        this.previewRects.clear();
        if (
          finalRect &&
          (finalRect.x !== mode.from.x ||
            finalRect.y !== mode.from.y ||
            finalRect.w !== mode.from.w ||
            finalRect.h !== mode.from.h)
        ) {
          hooks.execute(resizeShapeAction(mode.shapeId, { ...mode.from }, { ...finalRect }));
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
            const s: Shape | undefined = doc.shapes[id];
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

    this.mode = { kind: 'none' };
    this.updateCursor();
    hooks.onChange();
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const { hooks } = this;
    const factor = Math.exp(-e.deltaY * 0.0015);
    hooks.setCamera(zoomAt(hooks.getCamera(), this.screenPos(e), factor));
    hooks.onChange();
  };

  // -------------------------------------------------------------------------
  // Keyboard
  // -------------------------------------------------------------------------

  private onKeyDown = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    const { hooks } = this;

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

    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        hooks.deleteSelection();
        break;
      case 'Escape':
        this.cancelTransient();
        hooks.setSelection([]);
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
    this.previewRects.clear();
    this.createPreview = null;
    this.marquee = null;
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
      tool === 'rectangle' ? 'crosshair' : tool === 'pan' ? 'grab' : 'default';
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
