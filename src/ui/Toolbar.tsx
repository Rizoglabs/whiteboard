import { useRef } from 'react';
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
  onImportFile: (file: File) => void;
  onExportJson: () => void;
  onExportPng: () => void;
  onExportSvg: () => void;
  exporting: boolean;
}

function ToolButton(props: {
  active?: boolean;
  onClick: () => void;
  title: string;
  label: string;
  ariaLabel?: string;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="tool-btn"
      aria-pressed={props.active ?? false}
      aria-label={props.ariaLabel}
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
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="toolbar" role="toolbar" aria-label="Whiteboard tools">
      <ToolButton
        label="Select"
        title="Select / move / resize (V)"
        active={props.tool === 'select'}
        onClick={() => props.onTool('select')}
      />
      <ToolButton
        label="▭"
        ariaLabel="Rectangle"
        title="Draw rectangle (R)"
        active={props.tool === 'rectangle'}
        onClick={() => props.onTool('rectangle')}
      />
      <ToolButton
        label="⬯"
        ariaLabel="Ellipse"
        title="Draw ellipse (E)"
        active={props.tool === 'ellipse'}
        onClick={() => props.onTool('ellipse')}
      />
      <ToolButton
        label="╱"
        ariaLabel="Line"
        title="Draw line (L)"
        active={props.tool === 'line'}
        onClick={() => props.onTool('line')}
      />
      <ToolButton
        label="→"
        ariaLabel="Arrow"
        title="Draw arrow (A)"
        active={props.tool === 'arrow'}
        onClick={() => props.onTool('arrow')}
      />
      <ToolButton
        label="T"
        ariaLabel="Text"
        title="Add text (T) — click, then type; Enter to finish"
        active={props.tool === 'text'}
        onClick={() => props.onTool('text')}
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
      <span className="sep" aria-hidden="true" />
      <ToolButton
        label="Import"
        title="Import a whiteboard JSON file (replaces canvas; undoable)"
        onClick={() => fileRef.current?.click()}
      />
      <ToolButton
        label="JSON"
        title="Export canvas as JSON"
        onClick={props.onExportJson}
      />
      <ToolButton
        label="PNG"
        title="Export canvas as PNG image"
        disabled={props.exporting}
        onClick={props.onExportPng}
      />
      <ToolButton
        label="SVG"
        title="Export canvas as SVG vector"
        disabled={props.exporting}
        onClick={props.onExportSvg}
      />
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="Import JSON file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) props.onImportFile(f);
        }}
      />
    </div>
  );
}
