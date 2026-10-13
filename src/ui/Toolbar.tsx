import type { Tool } from '../interaction/controller';
import {
  ArrowIcon,
  EllipseIcon,
  LineIcon,
  PanIcon,
  RectangleIcon,
  SelectIcon,
  TextIcon,
  TrashIcon,
} from './icons';

interface ToolbarProps {
  tool: Tool;
  onTool: (t: Tool) => void;
  canDelete: boolean;
  onDelete: () => void;
}

const TOOLS: { id: Tool; name: string; key: string; Icon: () => React.JSX.Element }[] = [
  { id: 'select', name: 'Select', key: 'V', Icon: SelectIcon },
  { id: 'rectangle', name: 'Rectangle', key: 'R', Icon: RectangleIcon },
  { id: 'ellipse', name: 'Ellipse', key: 'O', Icon: EllipseIcon },
  { id: 'line', name: 'Line', key: 'L', Icon: LineIcon },
  { id: 'arrow', name: 'Arrow', key: 'A', Icon: ArrowIcon },
  { id: 'text', name: 'Text', key: 'T', Icon: TextIcon },
  { id: 'pan', name: 'Pan', key: 'H', Icon: PanIcon },
];

export function Toolbar(props: ToolbarProps): React.JSX.Element {
  return (
    <div className="toolbar" role="toolbar" aria-label="Whiteboard tools">
      {TOOLS.map(({ id, name, key, Icon }) => (
        <button
          key={id}
          type="button"
          className={'tool' + (props.tool === id ? ' active' : '')}
          aria-pressed={props.tool === id}
          aria-label={name}
          title={id === 'text' ? `Add text (${key}) — click, then type; Enter to finish` : `${name} (${key})`}
          onClick={() => props.onTool(id)}
        >
          <Icon />
          <span className="key-hint" aria-hidden="true">
            {key}
          </span>
        </button>
      ))}
      <span className="sep" aria-hidden="true" />
      <button
        type="button"
        className="tool tool-danger"
        aria-label="Delete"
        title="Delete selected (Del)"
        disabled={!props.canDelete}
        onClick={props.onDelete}
      >
        <TrashIcon />
        <span className="key-hint" aria-hidden="true">
          Del
        </span>
      </button>
    </div>
  );
}
