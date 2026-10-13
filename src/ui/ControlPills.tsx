import { MinusIcon, PlusIcon, RedoIcon, UndoIcon } from './icons';

interface ZoomPillProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
}

/** Floating "− 100% +" pill, bottom-left (Excalidraw style). */
export function ZoomPill(props: ZoomPillProps): React.JSX.Element {
  const pct = `${Math.round(props.zoom * 100)}%`;
  return (
    <div className="pill zoom-pill" role="group" aria-label="Zoom">
      <button type="button" aria-label="Zoom out" title="Zoom out" onClick={props.onZoomOut}>
        <MinusIcon />
      </button>
      <button
        type="button"
        className="zoom-pct"
        aria-label="Reset zoom"
        title="Reset zoom to 100%"
        onClick={props.onZoomReset}
      >
        {pct}
      </button>
      <button type="button" aria-label="Zoom in" title="Zoom in" onClick={props.onZoomIn}>
        <PlusIcon />
      </button>
    </div>
  );
}

interface HistoryPillProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

/** Floating undo/redo pill next to the zoom pill. */
export function HistoryPill(props: HistoryPillProps): React.JSX.Element {
  return (
    <div className="pill history-pill" role="group" aria-label="History">
      <button
        type="button"
        aria-label="Undo"
        title="Undo (Ctrl+Z)"
        disabled={!props.canUndo}
        onClick={props.onUndo}
      >
        <UndoIcon />
      </button>
      <button
        type="button"
        aria-label="Redo"
        title="Redo (Ctrl+Shift+Z)"
        disabled={!props.canRedo}
        onClick={props.onRedo}
      >
        <RedoIcon />
      </button>
    </div>
  );
}
