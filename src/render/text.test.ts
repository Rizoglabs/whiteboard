import { describe, expect, it } from 'vitest';
import { fitTextRect, layoutText } from './text';

// Deterministic fake: every char is 10 units wide at any font.
const fakeMeasure = (text: string): number => text.length * 10;

describe('layoutText', () => {
  it('wraps words at maxWidth', () => {
    const l = layoutText('aa bb cc', 20, 45, fakeMeasure);
    expect(l.lines).toEqual(['aa', 'bb', 'cc']);
    expect(l.height).toBe(3 * 20 * 1.25);
    expect(l.widths).toHaveLength(3);
  });

  it('keeps explicit newlines as paragraph breaks', () => {
    const l = layoutText('aa\nbb', 20, 500, fakeMeasure);
    expect(l.lines).toEqual(['aa', 'bb']);
  });

  it('hard-breaks a single word longer than the line', () => {
    const l = layoutText('abcdefgh', 20, 25, fakeMeasure);
    expect(l.lines.join('')).toBe('abcdefgh');
    expect(l.lines.length).toBeGreaterThan(1);
    for (const line of l.lines) {
      expect(fakeMeasure(line)).toBeLessThanOrEqual(25);
    }
  });

  it('handles empty text as one empty line', () => {
    const l = layoutText('', 20, 200, fakeMeasure);
    expect(l.lines).toEqual(['']);
    expect(l.height).toBe(20 * 1.25);
  });
});

describe('fitTextRect', () => {
  it('keeps width and fits height to content', () => {
    const r = fitTextRect({ x: 5, y: 7, w: 200, h: 10 }, 'aa bb cc', 20);
    expect(r.x).toBe(5);
    expect(r.y).toBe(7);
    expect(r.w).toBe(200);
    expect(r.h).toBeGreaterThan(10);
  });

  it('enforces a minimum width of 40', () => {
    const r = fitTextRect({ x: 0, y: 0, w: 5, h: 5 }, 'x', 20);
    expect(r.w).toBe(40);
  });
});
