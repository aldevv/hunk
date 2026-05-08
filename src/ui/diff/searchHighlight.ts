/**
 * Splice search-match highlights onto an already-styled `RenderSpan[]`.
 *
 * The diff renderer flattens Pierre's syntax-highlighted output into one ordered list of
 * styled text spans per cell. To highlight matches, we walk those spans column-by-column
 * and overlay the configured highlight palette wherever a match range covers the column.
 * That keeps existing fg/bg colors intact for non-match columns and avoids touching the
 * row builder layer.
 */
import type { RenderSpan } from "./pierre";

export interface SearchHighlightRange {
  /** Column start in the original cell text (0-based). */
  start: number;
  /** Column end exclusive. */
  end: number;
  /** Whether this range is the active (current cursor) match. */
  active: boolean;
}

export interface SearchHighlightPalette {
  /** Background applied to inactive matches. */
  matchBg: string;
  /** Foreground applied to inactive matches. */
  matchFg: string;
  /** Background applied to the active (cursor-current) match. */
  activeMatchBg: string;
  /** Foreground applied to the active (cursor-current) match. */
  activeMatchFg: string;
}

interface ColumnPaint {
  /** Override fg for this column, if any. */
  fg?: string;
  /** Override bg for this column, if any. */
  bg?: string;
}

/** Build a per-column override table from a list of search match ranges. */
function buildColumnOverrides(
  totalColumns: number,
  ranges: SearchHighlightRange[],
  palette: SearchHighlightPalette,
): ColumnPaint[] {
  const overrides: ColumnPaint[] = Array.from({ length: totalColumns });

  for (const range of ranges) {
    const start = Math.max(0, range.start);
    const end = Math.min(totalColumns, range.end);
    if (end <= start) {
      continue;
    }

    const fg = range.active ? palette.activeMatchFg : palette.matchFg;
    const bg = range.active ? palette.activeMatchBg : palette.matchBg;

    for (let column = start; column < end; column += 1) {
      // Active matches win over inactive ones if both somehow target the same column —
      // the current-cursor match should always be visually distinct.
      const existing = overrides[column];
      if (!existing || range.active) {
        overrides[column] = { fg, bg };
      }
    }
  }

  return overrides;
}

/**
 * Apply search highlight overrides onto an existing styled span list.
 *
 * Columns covered by an active range get the active palette; columns covered by an inactive
 * range get the inactive palette; uncovered columns keep their original fg/bg. Adjacent
 * columns with identical paint are coalesced so the final output stays as compact as the
 * existing renderer expects.
 */
export function applySearchHighlights(
  spans: RenderSpan[],
  ranges: SearchHighlightRange[],
  palette: SearchHighlightPalette,
): RenderSpan[] {
  if (ranges.length === 0 || spans.length === 0) {
    return spans;
  }

  let totalColumns = 0;
  for (const span of spans) {
    totalColumns += span.text.length;
  }

  if (totalColumns === 0) {
    return spans;
  }

  const overrides = buildColumnOverrides(totalColumns, ranges, palette);
  const result: RenderSpan[] = [];
  let absoluteColumn = 0;

  for (const span of spans) {
    if (span.text.length === 0) {
      continue;
    }

    let runStart = 0;
    let currentFg = mergeFg(span.fg, overrides[absoluteColumn]);
    let currentBg = mergeBg(span.bg, overrides[absoluteColumn]);

    for (let offset = 1; offset <= span.text.length; offset += 1) {
      const column = absoluteColumn + offset;
      const nextOverride = offset < span.text.length ? overrides[column] : undefined;
      const nextFg = offset < span.text.length ? mergeFg(span.fg, nextOverride) : null;
      const nextBg = offset < span.text.length ? mergeBg(span.bg, nextOverride) : null;
      const atEnd = offset === span.text.length;

      if (atEnd || nextFg !== currentFg || nextBg !== currentBg) {
        const text = span.text.slice(runStart, offset);
        if (text.length > 0) {
          pushSpan(result, { text, fg: currentFg ?? undefined, bg: currentBg ?? undefined });
        }
        runStart = offset;
        if (!atEnd) {
          currentFg = nextFg;
          currentBg = nextBg;
        }
      }
    }

    absoluteColumn += span.text.length;
  }

  return result;
}

/** Append one span while collapsing adjacent runs that share fg/bg. */
function pushSpan(target: RenderSpan[], next: RenderSpan) {
  const previous = target[target.length - 1];
  if (previous && previous.fg === next.fg && previous.bg === next.bg) {
    previous.text += next.text;
    return;
  }
  target.push(next);
}

/** Resolve the effective fg for one column, preferring the highlight override when set. */
function mergeFg(baseFg: string | undefined, override: ColumnPaint | undefined): string | null {
  if (override?.fg !== undefined) {
    return override.fg;
  }
  return baseFg ?? null;
}

/** Resolve the effective bg for one column, preferring the highlight override when set. */
function mergeBg(baseBg: string | undefined, override: ColumnPaint | undefined): string | null {
  if (override?.bg !== undefined) {
    return override.bg;
  }
  return baseBg ?? null;
}
