import type { Tool } from '../interaction/controller';

interface ToolbarProps {
  tool: Tool;
  onTool: (t: Tool) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canDelete: boolean;
  onDelete: () => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
}

function ToolButton(props: {
  active?: boolean;
  onClick: () => void;
  title: string;
  label: string;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="tool-btn"
      aria-pressed={props.active ?? false}
      title={props.title}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.label}
    </button>
  );
}

export function Toolbar(props: ToolbarProps): React.JSX.Element {
  const zoomPct = `${Math.round(props.zoom * 100)}%`;
  return (
    <div className="toolbar" role="toolbar" aria-label="Whiteboard tools">
      <ToolButton
        label="Select"
        title="Select / move / resize (V)"
        active={props.tool === 'select'}
        onClick={() => props.onTool('select')}
      />
      <ToolButton
        label="Rectangle"
        title="Draw rectangle (R)"
        active={props.tool === 'rectangle'}
        onClick={() => props.onTool('rectangle')}
      />
      <ToolButton
        label="Pan"
        title="Pan view (H or hold Space)"
        active={props.tool === 'pan'}
        onClick={() => props.onTool('pan')}
      />
      <span className="sep" aria-hidden="true" />
      <ToolButton
        label="Undo"
        title="Undo (Ctrl+Z)"
        disabled={!props.canUndo}
        onClick={props.onUndo}
      />
      <ToolButton
        label="Redo"
        title="Redo (Ctrl+Shift+Z)"
        disabled={!props.canRedo}
        onClick={props.onRedo}
      />
      <ToolButton
        label="Delete"
        title="Delete selected (Del)"
        disabled={!props.canDelete}
        onClick={props.onDelete}
      />
      <span className="sep" aria-hidden="true" />
      <ToolButton label="−" title="Zoom out" onClick={props.onZoomOut} />
      <ToolButton label={zoomPct} title="Reset zoom to 100%" onClick={props.onZoomReset} />
      <ToolButton label="+" title="Zoom in" onClick={props.onZoomIn} />
    </div>
  );
}
