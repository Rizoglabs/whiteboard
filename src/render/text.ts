// Text layout: word wrapping and measurement for text shapes.
// The measure function is injectable so layout stays unit-testable without DOM.

export type MeasureFn = (text: string, font: string) => number;

export interface TextLayout {
  lines: string[];
  /** World-unit width of each line (same order as lines). */
  widths: number[];
  /** World-unit height of the laid-out block. */
  height: number;
  /** World-unit line height. */
  lineHeight: number;
}

export const LINE_HEIGHT_FACTOR = 1.25;

let sharedCanvas: HTMLCanvasElement | null = null;

/** DOM-backed measurement (1 world unit == 1 CSS px at zoom 1). */
export function canvasMeasure(text: string, font: string): number {
  if (typeof document === 'undefined') return text.length * 8;
  if (!sharedCanvas) sharedCanvas = document.createElement('canvas');
  const ctx = sharedCanvas.getContext('2d');
  if (!ctx) return text.length * 8;
  ctx.font = font;
  return ctx.measureText(text).width;
}

export function textFont(fontSize: number): string {
  return `${fontSize}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
}

/** Wrap text into lines that fit maxWidth (world units). */
export function layoutText(
  text: string,
  fontSize: number,
  maxWidth: number,
  measure: (text: string, font: string) => number = canvasMeasure,
): TextLayout {
  const font = textFont(fontSize);
  const lineHeight = fontSize * LINE_HEIGHT_FACTOR;
  const lines: string[] = [];
  const widths: number[] = [];
  const pushLine = (line: string): void => {
    lines.push(line);
    widths.push(measure(line, font));
  };
  const paragraphs = text.split('\n');
  const width = Math.max(1, maxWidth);
  for (const para of paragraphs) {
    if (para === '') {
      pushLine('');
      continue;
    }
    const words = para.split(/(\s+)/).filter((w) => w.length > 0);
    let current = '';
    for (const word of words) {
      const trial = current === '' ? word : current + word;
      if (measure(trial, font) <= width || current === '') {
        current = trial;
      } else {
        pushLine(current.trimEnd());
        current = word.trimStart();
      }
      // A single word longer than the line: hard-break it.
      while (measure(current, font) > width && current.length > 1) {
        let cut = current.length - 1;
        while (cut > 1 && measure(current.slice(0, cut), font) > width) cut--;
        pushLine(current.slice(0, cut));
        current = current.slice(cut);
      }
    }
    pushLine(current.trimEnd());
  }
  if (lines.length === 0) pushLine('');
  return { lines, widths, height: lines.length * lineHeight, lineHeight };
}

/**
 * Return a copy of rect whose height fits the laid-out text.
 * Width is kept (min 40); height grows/shrinks to the content.
 */
export function fitTextRect(
  rect: { x: number; y: number; w: number; h: number },
  text: string,
  fontSize: number,
): { x: number; y: number; w: number; h: number } {
  const w = Math.max(40, rect.w);
  const layout = layoutText(text, fontSize, w);
  return { x: rect.x, y: rect.y, w, h: Math.max(layout.height, fontSize * LINE_HEIGHT_FACTOR) };
}
