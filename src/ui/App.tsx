import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteShapesAction,
  History,
  patchShapesAction,
  replaceDocumentAction,
  type DocAction,
  type ShapePatch,
} from '../core/history';
import { loadDocument, saveDocument } from '../core/persistence';
import { getShape, type Shape, type TextShape, type WhiteboardDocument } from '../core/scene';
import { zoomAt, type Camera } from '../core/camera';
import {
  InteractionController,
  type ControllerHooks,
  type Tool,
} from '../interaction/controller';
import { importFromJson, exportToJson } from '../io/json';
import { downloadBlob, downloadText, exportToPng } from '../io/png';
import { exportToSvg } from '../io/svg';
import { fitTextRect } from '../render/text';
import { CanvasView } from './CanvasView';
import { Toolbar } from './Toolbar';
import { HamburgerMenu } from './HamburgerMenu';
import { ZoomPill, HistoryPill } from './ControlPills';
import { StatusBar } from './StatusBar';
import { PropertiesPanel } from './PropertiesPanel';
import { TextEditor } from './TextEditor';

export type SaveState = 'loading' | 'saving' | 'saved' | 'error';

const INITIAL_CAMERA: Camera = { x: -80, y: -80, zoom: 1 };

interface Notice {
  kind: 'ok' | 'err';
  text: string;
}

export function App(): React.JSX.Element {
  const historyRef = useRef<History | null>(null);
  if (!historyRef.current) {
    historyRef.current = new History({ version: 2, shapes: {}, order: [] });
  }
  const history = historyRef.current;

  const [tick, setTick] = useState(0);
  const [tool, setToolState] = useState<Tool>('select');
  const [selection, setSelectionState] = useState<string[]>([]);
  const [camera, setCameraState] = useState<Camera>(INITIAL_CAMERA);
  const [saveState, setSaveState] = useState<SaveState>('loading');
  const [ready, setReady] = useState(false);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [exporting, setExporting] = useState(false);

  const toolRef = useRef<Tool>('select');
  const selectionRef = useRef<string[]>([]);
  const cameraRef = useRef<Camera>(INITIAL_CAMERA);
  const readyRef = useRef(false);
  const controllerRef = useRef<InteractionController | null>(null);
  const viewportRef = useRef({ w: 800, h: 600 });
  const saveTimerRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  // Serializes IndexedDB writes; the generation guard keeps a slow write
  // from marking state saved after a newer write was scheduled.
  const saveChainRef = useRef(Promise.resolve());
  const saveGenRef = useRef(0);

  const bump = useCallback(() => setTick((t) => t + 1), []);

  const showNotice = useCallback((kind: Notice['kind'], text: string) => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    setNotice({ kind, text });
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 5000);
  }, []);

  const persistSoon = useCallback(() => {
    setSaveState((s) => (s === 'loading' ? s : 'saving'));
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      const gen = ++saveGenRef.current;
      saveChainRef.current = saveChainRef.current.then(async () => {
        const doc = historyRef.current?.document;
        if (!doc) return;
        try {
          await saveDocument(doc);
          if (gen === saveGenRef.current) setSaveState('saved');
        } catch {
          setSaveState('error');
        }
      });
    }, 500);
  }, []);

  const pruneSelection = useCallback(() => {
    const doc = historyRef.current?.document;
    if (!doc) return;
    const alive = selectionRef.current.filter((id) => doc.shapes[id] !== undefined);
    if (alive.length !== selectionRef.current.length) {
      selectionRef.current = alive;
      setSelectionState(alive);
    }
  }, []);

  const runAction = useCallback(
    (action: DocAction) => {
      historyRef.current?.execute(action);
      pruneSelection();
      persistSoon();
      bump();
    },
    [bump, persistSoon, pruneSelection],
  );

  // Stable controller hooks (refs stay current, setters are stable).
  const hooksRef = useRef<ControllerHooks | null>(null);
  if (!hooksRef.current) {
    hooksRef.current = {
      getDocument: () => historyRef.current?.document ?? { version: 2, shapes: {}, order: [] },
      getCamera: () => cameraRef.current,
      setCamera: (cam: Camera) => {
        cameraRef.current = cam;
        setCameraState(cam);
      },
      getTool: () => toolRef.current,
      setTool: (t: Tool) => {
        toolRef.current = t;
        setToolState(t);
        controllerRef.current?.toolChanged();
      },
      getSelection: () => selectionRef.current,
      setSelection: (ids: string[]) => {
        selectionRef.current = ids;
        setSelectionState(ids);
      },
      execute: (action: DocAction) => runAction(action),
      undo: () => {
        historyRef.current?.undo();
        pruneSelection();
        persistSoon();
        bump();
      },
      redo: () => {
        historyRef.current?.redo();
        pruneSelection();
        persistSoon();
        bump();
      },
      deleteSelection: () => {
        const h = historyRef.current;
        if (!h) return;
        const ids = selectionRef.current;
        if (ids.length === 0) return;
        runAction(deleteShapesAction(h.document, ids));
        selectionRef.current = [];
        setSelectionState([]);
      },
      editText: (id: string | null) => setEditingTextId(id),
      isReady: () => readyRef.current,
      onChange: () => bump(),
    };
  }

  // Load persisted document once. Input stays gated until this settles so a
  // late load can never overwrite the user's first strokes (loading gate).
  useEffect(() => {
    let cancelled = false;
    loadDocument().then(
      (doc: WhiteboardDocument | null) => {
        if (cancelled) return;
        if (doc) {
          historyRef.current?.loadDocument(doc);
          bump();
        }
        readyRef.current = true;
        setReady(true);
        setSaveState('saved');
      },
      () => {
        if (cancelled) return;
        readyRef.current = true;
        setReady(true);
        setSaveState('error');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [bump]);

  // Best-effort flush on page hide/close. Not guaranteed by browsers —
  // the 500ms debounced autosave above is the real durability story.
  useEffect(() => {
    const flush = () => {
      const doc = historyRef.current?.document;
      if (doc) void saveDocument(doc).catch(() => undefined);
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const doc = history.document;
  const shapeCount = doc.order.length;

  const zoomBy = (factor: number) => {
    const { w, h } = viewportRef.current;
    const cam = zoomAt(cameraRef.current, { x: w / 2, y: h / 2 }, factor);
    cameraRef.current = cam;
    setCameraState(cam);
  };
  const resetView = () => {
    cameraRef.current = INITIAL_CAMERA;
    setCameraState(INITIAL_CAMERA);
  };

  // --- Inline text editing -------------------------------------------------
  const editingShape =
    editingTextId !== null ? getShape(doc, editingTextId) : undefined;
  const commitText = (id: string, text: string) => {
    const h = historyRef.current;
    const shape = h ? getShape(h.document, id) : undefined;
    setEditingTextId(null);
    if (!h || !shape || shape.type !== 'text') return;
    if (text === shape.text) return;
    const after: TextShape = {
      ...shape,
      text,
      rect: fitTextRect(shape.rect, text, shape.fontSize),
    };
    runAction(patchShapesAction([{ id, before: shape, after }], 'Edit text'));
  };
  const cancelText = (id: string) => {
    const h = historyRef.current;
    const shape = h ? getShape(h.document, id) : undefined;
    setEditingTextId(null);
    // Don't leave empty husks behind when a fresh text box is cancelled.
    if (h && shape && shape.type === 'text' && shape.text === '') {
      runAction(deleteShapesAction(h.document, [id]));
      selectionRef.current = [];
      setSelectionState([]);
    }
  };

  // --- Property changes ------------------------------------------------------
  const patchSelection = (partial: Record<string, unknown>, opts?: { textOnly?: boolean }) => {
    const h = historyRef.current;
    if (!h) return;
    const patches: ShapePatch[] = [];
    for (const id of selectionRef.current) {
      const shape = getShape(h.document, id);
      if (!shape) continue;
      if (opts?.textOnly && shape.type !== 'text') continue;
      let after = { ...shape, ...partial } as Shape;
      if (shape.type === 'text' && typeof partial['fontSize'] === 'number') {
        const fontSize = partial['fontSize'] as number;
        after = { ...after, rect: fitTextRect(shape.rect, shape.text, fontSize) };
      }
      patches.push({ id, before: shape, after });
    }
    if (patches.length === 0) return;
    runAction(patchShapesAction(patches, 'Change properties'));
  };

  const selectedShapes = selection
    .map((id) => getShape(doc, id))
    .filter((s): s is Shape => s !== undefined);

  // --- Import / export ---------------------------------------------------------
  const importFile = async (file: File) => {
    let text: string;
    try {
      text = await file.text();
    } catch {
      showNotice('err', 'Import gagal: file tidak bisa dibaca.');
      return;
    }
    const result = importFromJson(text);
    if (!result.ok) {
      showNotice('err', `Import gagal: ${result.error.message} Kanvas tidak diubah.`);
      return;
    }
    const h = historyRef.current;
    if (!h) return;
    runAction(replaceDocumentAction(h.document, result.document));
    selectionRef.current = [];
    setSelectionState([]);
    setEditingTextId(null);
    showNotice('ok', `Import berhasil: ${result.document.order.length} objek dimuat. (Undo untuk batal)`);
  };

  const exportJson = () => {
    const d = historyRef.current?.document;
    if (!d) return;
    downloadText(exportToJson(d), 'whiteboard.json', 'application/json');
    showNotice('ok', 'Diekspor sebagai JSON.');
  };

  const exportPng = async () => {
    const d = historyRef.current?.document;
    if (!d) return;
    setExporting(true);
    try {
      const blob = await exportToPng(d);
      downloadBlob(blob, 'whiteboard.png');
      showNotice('ok', 'Diekspor sebagai PNG.');
    } catch (err) {
      showNotice('err', `Export PNG gagal: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setExporting(false);
    }
  };

  const exportSvg = () => {
    const d = historyRef.current?.document;
    if (!d) return;
    try {
      downloadText(exportToSvg(d), 'whiteboard.svg', 'image/svg+xml');
      showNotice('ok', 'Diekspor sebagai SVG.');
    } catch (err) {
      showNotice('err', `Export SVG gagal: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  };

  const controller = () => controllerRef.current;

  return (
    <div className="app">
      <HamburgerMenu
        onImportFile={(f) => void importFile(f)}
        onExportJson={exportJson}
        onExportPng={() => void exportPng()}
        onExportSvg={exportSvg}
        exporting={exporting}
      />
      <Toolbar
        tool={tool}
        onTool={(t) => hooksRef.current?.setTool(t)}
        canDelete={selection.length > 0}
        onDelete={() => hooksRef.current?.deleteSelection()}
      />
      <CanvasView
        doc={doc}
        camera={camera}
        selection={selection}
        version={tick}
        hooks={hooksRef.current}
        controllerRef={controllerRef}
        onViewportSize={(w, h) => {
          viewportRef.current = { w, h };
        }}
      >
        {editingShape && editingShape.type === 'text' && (
          <TextEditor
            key={editingShape.id}
            shape={editingShape}
            camera={camera}
            onCommit={(text) => commitText(editingShape.id, text)}
            onCancel={() => cancelText(editingShape.id)}
          />
        )}
        {selectedShapes.length > 0 && editingTextId === null && (
          <PropertiesPanel
            shapes={selectedShapes}
            onPatch={(partial, opts) => patchSelection(partial, opts)}
            onDuplicate={() => controller()?.duplicateSelection()}
            onBringForward={() => controller()?.reorderSelected('forward')}
            onSendBackward={() => controller()?.reorderSelected('backward')}
            onBringToFront={() => controller()?.reorderSelected('front')}
            onSendToBack={() => controller()?.reorderSelected('back')}
            onClose={() => hooksRef.current?.setSelection([])}
          />
        )}
        {ready && shapeCount === 0 && (
          <div className="empty-state" aria-hidden="true">
            <p className="empty-title">Kanvas kosong</p>
            <p className="empty-hint">Pilih alat di toolbar atas, lalu drag di kanvas untuk menggambar.</p>
            <p className="empty-hint">Scroll untuk zoom, spasi + drag untuk geser.</p>
          </div>
        )}
        {notice && (
          <div className={`notice notice-${notice.kind}`} role="status">
            {notice.text}
            <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}>
              ×
            </button>
          </div>
        )}
      </CanvasView>
      <div className="canvas-pills">
        <ZoomPill
          zoom={camera.zoom}
          onZoomIn={() => zoomBy(1.25)}
          onZoomOut={() => zoomBy(0.8)}
          onZoomReset={resetView}
        />
        <HistoryPill
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onUndo={() => hooksRef.current?.undo()}
          onRedo={() => hooksRef.current?.redo()}
        />
      </div>
      <StatusBar
        shapeCount={shapeCount}
        selectionCount={selection.length}
        zoom={camera.zoom}
        saveState={saveState}
      />
      {!ready && (
        <div className="loading-overlay" role="status" aria-label="Loading">
          <span>Memuat whiteboard…</span>
        </div>
      )}
    </div>
  );
}
