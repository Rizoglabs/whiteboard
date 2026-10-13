import { useEffect, useRef } from 'react';
import { worldToScreen, type Camera } from '../core/camera';
import { normalizeRect } from '../core/geometry';
import type { TextShape } from '../core/scene';

interface TextEditorProps {
  shape: TextShape;
  camera: Camera;
  onCommit: (text: string) => void;
  onCancel: () => void;
}

/**
 * Inline text editor: a textarea positioned exactly over the text shape.
 * Enter commits, Shift+Enter inserts a newline, Escape cancels, blur commits.
 */
export function TextEditor(props: TextEditorProps): React.JSX.Element {
  const { shape, camera, onCommit, onCancel } = props;
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const doneRef = useRef(false);

  const r = normalizeRect(shape.rect);
  const topLeft = worldToScreen(camera, { x: r.x, y: r.y });
  const w = Math.max(40, r.w * camera.zoom);
  const fontPx = Math.max(8, shape.fontSize * camera.zoom);

  useEffect(() => {
    const area = areaRef.current;
    if (area) {
      area.focus();
      // Put the caret at the end of the existing text.
      area.setSelectionRange(area.value.length, area.value.length);
    }
  }, []);

  const commit = (text: string): void => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCommit(text);
  };
  const cancel = (): void => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCancel();
  };

  return (
    <textarea
      ref={areaRef}
      className="text-editor"
      aria-label="Edit text"
      defaultValue={shape.text}
      placeholder="Ketik teks… (Enter selesai, Shift+Enter baris baru, Esc batal)"
      rows={1}
      style={{
        left: topLeft.x,
        top: topLeft.y,
        width: w,
        minHeight: Math.max(24, r.h * camera.zoom),
        fontSize: fontPx,
        lineHeight: 1.25,
        color: shape.fill,
        textAlign: shape.align,
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          commit((e.target as HTMLTextAreaElement).value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cancel();
        } else {
          // Don't let canvas shortcuts interfere while typing.
          e.stopPropagation();
        }
      }}
      onBlur={(e) => commit(e.target.value)}
    />
  );
}
