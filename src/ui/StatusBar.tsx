import type { SaveState } from './App';

interface StatusBarProps {
  shapeCount: number;
  selectionCount: number;
  zoom: number;
  saveState: SaveState;
}

function saveText(s: SaveState): string {
  switch (s) {
    case 'loading':
      return 'Loading…';
    case 'saving':
      return 'Saving…';
    case 'saved':
      return 'Saved ✓';
    case 'error':
      return 'Save failed';
  }
}

export function StatusBar(props: StatusBarProps): React.JSX.Element {
  const shapeWord = props.shapeCount === 1 ? 'shape' : 'shapes';
  return (
    <div className="statusbar" aria-live="polite">
      <span>
        {props.shapeCount} {shapeWord}
      </span>
      <span>{props.selectionCount} selected</span>
      <span>{Math.round(props.zoom * 100)}%</span>
      <span className={props.saveState === 'error' ? 'save-error' : ''}>
        {saveText(props.saveState)}
      </span>
    </div>
  );
}
