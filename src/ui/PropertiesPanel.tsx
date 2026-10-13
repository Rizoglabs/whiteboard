import type { Shape, TextAlign } from '../core/scene';

interface PropertiesPanelProps {
  shapes: Shape[];
  onPatch: (partial: Record<string, unknown>, opts?: { textOnly?: boolean }) => void;
  onDuplicate: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onClose: () => void;
}

const STROKE_SWATCHES = ['#1f2937', '#b45309', '#2563eb', '#059669', '#dc2626', '#7c3aed', '#000000'];
const FILL_SWATCHES = ['#fef3c7', '#dbeafe', '#d1fae5', '#fee2e2', '#ede9fe', '#ffffff', '#1f2937'];

function Swatches(props: {
  label: string;
  colors: string[];
  value: string;
  allowNone?: boolean;
  onPick: (color: string) => void;
}): React.JSX.Element {
  return (
    <div className="prop-row">
      <span className="prop-label">{props.label}</span>
      <div className="swatches">
        {props.allowNone && (
          <button
            type="button"
            className={'swatch swatch-none' + (props.value === 'none' ? ' active' : '')}
            title="No fill"
            aria-label="No fill"
            onClick={() => props.onPick('none')}
          />
        )}
        {props.colors.map((c) => (
          <button
            key={c}
            type="button"
            className={'swatch' + (props.value === c ? ' active' : '')}
            style={{ background: c }}
            title={c}
            aria-label={`Color ${c}`}
            onClick={() => props.onPick(c)}
          />
        ))}
        <input
          type="color"
          className="swatch swatch-custom"
          title="Custom color"
          aria-label="Custom color"
          value={props.value.startsWith('#') ? props.value : '#000000'}
          onChange={(e) => props.onPick(e.target.value)}
        />
      </div>
    </div>
  );
}

export function PropertiesPanel(props: PropertiesPanelProps): React.JSX.Element {
  const { shapes } = props;
  if (shapes.length === 0) return <></>;
  const first = shapes[0];
  const hasText = shapes.some((s) => s.type === 'text');
  const multi = shapes.length > 1;

  const align = (first.type === 'text' ? first.align : 'left') as TextAlign;

  return (
    <aside className="props-panel" aria-label="Shape properties">
      <div className="props-header">
        <span>{multi ? `${shapes.length} shapes` : first.type}</span>
        <button type="button" className="props-close" title="Close panel (Esc)" aria-label="Close panel" onClick={props.onClose}>
          ×
        </button>
      </div>

      <Swatches
        label="Stroke"
        colors={STROKE_SWATCHES}
        value={first.stroke}
        onPick={(stroke) => props.onPatch({ stroke })}
      />
      <Swatches
        label="Fill"
        colors={FILL_SWATCHES}
        value={first.fill}
        allowNone
        onPick={(fill) => props.onPatch({ fill })}
      />

      <div className="prop-row">
        <label className="prop-label" htmlFor="prop-width">
          Width
        </label>
        <input
          id="prop-width"
          type="range"
          min={1}
          max={12}
          step={1}
          value={first.strokeWidth}
          aria-label="Stroke width"
          onChange={(e) => props.onPatch({ strokeWidth: Number(e.target.value) })}
        />
        <span className="prop-value">{first.strokeWidth}</span>
      </div>

      <div className="prop-row">
        <label className="prop-label" htmlFor="prop-opacity">
          Opacity
        </label>
        <input
          id="prop-opacity"
          type="range"
          min={10}
          max={100}
          step={5}
          value={Math.round(first.opacity * 100)}
          aria-label="Opacity"
          onChange={(e) => props.onPatch({ opacity: Number(e.target.value) / 100 })}
        />
        <span className="prop-value">{Math.round(first.opacity * 100)}%</span>
      </div>

      {hasText && (
        <>
          <div className="prop-row">
            <label className="prop-label" htmlFor="prop-fontsize">
              Font
            </label>
            <input
              id="prop-fontsize"
              type="range"
              min={8}
              max={96}
              step={1}
              value={first.type === 'text' ? first.fontSize : 24}
              aria-label="Font size"
              onChange={(e) => props.onPatch({ fontSize: Number(e.target.value) }, { textOnly: true })}
            />
            <span className="prop-value">{first.type === 'text' ? first.fontSize : 24}</span>
          </div>
          <div className="prop-row">
            <span className="prop-label">Align</span>
            <div className="align-btns" role="group" aria-label="Text alignment">
              {(['left', 'center', 'right'] as TextAlign[]).map((a) => (
                <button
                  key={a}
                  type="button"
                  className={'tool-btn' + (align === a ? ' active' : '')}
                  aria-pressed={align === a}
                  title={`Align ${a}`}
                  aria-label={`Align ${a}`}
                  onClick={() => props.onPatch({ align: a }, { textOnly: true })}
                >
                  {a === 'left' ? '⟨' : a === 'center' ? '≡' : '⟩'}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="prop-row">
        <span className="prop-label">Order</span>
        <div className="align-btns" role="group" aria-label="Z-order">
          <button type="button" className="tool-btn" title="Bring forward (Ctrl+])" aria-label="Bring forward (Ctrl+])" onClick={props.onBringForward}>
            ⤴
          </button>
          <button type="button" className="tool-btn" title="Send backward (Ctrl+[)" aria-label="Send backward (Ctrl+[)" onClick={props.onSendBackward}>
            ⤵
          </button>
          <button type="button" className="tool-btn" title="Bring to front" aria-label="Bring to front" onClick={props.onBringToFront}>
            ⇈
          </button>
          <button type="button" className="tool-btn" title="Send to back" aria-label="Send to back" onClick={props.onSendToBack}>
            ⇊
          </button>
        </div>
      </div>

      <div className="prop-row">
        <button type="button" className="tool-btn prop-wide" title="Duplicate (Ctrl+D)" onClick={props.onDuplicate}>
          Duplicate
        </button>
      </div>
    </aside>
  );
}
