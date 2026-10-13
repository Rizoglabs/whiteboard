import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyDocument, type WhiteboardDocument } from '../core/scene';
import {
  deleteShapesAction,
  History,
  type DocAction,
} from '../core/history';
import { loadDocument, saveDocument } from '../core/persistence';
import { zoomAt, type Camera } from '../core/camera';
import {
  InteractionController,
  type ControllerHooks,
  type Tool,
} from '../interaction/controller';
import { CanvasView } from './CanvasView';
import { Toolbar } from './Toolbar';
import { StatusBar } from './StatusBar';

export type SaveState = 'loading' | 'saving' | 'saved' | 'error';

const INITIAL_CAMERA: Camera = { x: -80, y: -80, zoom: 1 };

export function App(): React.JSX.Element {
  const historyRef = useRef<History | null>(null);
  if (!historyRef.current) {
    historyRef.current = new History(emptyDocument());
  }
  const history = historyRef.current;

  const [tick, setTick] = useState(0);
  const [tool, setToolState] = useState<Tool>('select');
  const [selection, setSelectionState] = useState<string[]>([]);
  const [camera, setCameraState] = useState<Camera>(INITIAL_CAMERA);
  const [saveState, setSaveState] = useState<SaveState>('loading');

  const toolRef = useRef<Tool>('select');
  const selectionRef = useRef<string[]>([]);
  const cameraRef = useRef<Camera>(INITIAL_CAMERA);
  const controllerRef = useRef<InteractionController | null>(null);
  const viewportRef = useRef({ w: 800, h: 600 });
  const saveTimerRef = useRef<number | null>(null);

  const bump = useCallback(() => setTick((t) => t + 1), []);

  const persistSoon = useCallback(() => {
    setSaveState((s) => (s === 'loading' ? s : 'saving'));
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      const doc = historyRef.current?.document;
      if (!doc) return;
      saveDocument(doc).then(
        () => setSaveState('saved'),
        () => setSaveState('error'),
      );
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

  // Stable controller hooks (refs stay current, setters are stable).
  const hooksRef = useRef<ControllerHooks | null>(null);
  if (!hooksRef.current) {
    hooksRef.current = {
      getDocument: () => historyRef.current?.document ?? emptyDocument(),
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
      execute: (action: DocAction) => {
        historyRef.current?.execute(action);
        persistSoon();
        bump();
      },
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
        h.execute(deleteShapesAction(h.document, ids));
        selectionRef.current = [];
        setSelectionState([]);
        persistSoon();
        bump();
      },
      onChange: () => bump(),
    };
  }

  // Load persisted document once.
  useEffect(() => {
    let cancelled = false;
    loadDocument().then(
      (doc: WhiteboardDocument | null) => {
        if (cancelled) return;
        if (doc) {
          historyRef.current?.loadDocument(doc);
          bump();
        }
        setSaveState('saved');
      },
      () => {
        if (!cancelled) setSaveState('error');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [bump]);

  // Best-effort flush on page hide/close.
  useEffect(() => {
    const flush = () => {
      const doc = historyRef.current?.document;
      if (doc) void saveDocument(doc);
    };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    return () => window.removeEventListener('beforeunload', flush);
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

  return (
    <div className="app">
      <Toolbar
        tool={tool}
        onTool={(t) => hooksRef.current?.setTool(t)}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={() => hooksRef.current?.undo()}
        onRedo={() => hooksRef.current?.redo()}
        canDelete={selection.length > 0}
        onDelete={() => hooksRef.current?.deleteSelection()}
        zoom={camera.zoom}
        onZoomIn={() => zoomBy(1.25)}
        onZoomOut={() => zoomBy(0.8)}
        onZoomReset={resetView}
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
      />
      <StatusBar
        shapeCount={shapeCount}
        selectionCount={selection.length}
        zoom={camera.zoom}
        saveState={saveState}
      />
    </div>
  );
}
