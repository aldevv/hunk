/**
 * Pure helpers for finding text matches inside the visible review stream.
 *
 * The review stream is built from each `DiffFile`'s `metadata.additionLines`
 * and `metadata.deletionLines`, so substring search walks those line arrays
 * directly rather than expanding Pierre row plans. That keeps matching cheap
 * (no syntax highlighting, no row builders) and keeps the result in stream
 * order: file order, hunk order within file, deletion side before addition
 * side per hunk, and ascending column within a line.
 */
import type { DiffFile } from "../../core/types";

export type SearchMatchSide = "old" | "new";

export interface SearchMatch {
  fileId: string;
  hunkIndex: number;
  /**
   * Which side of the diff the match is on. Stack rows render addition rows
   * after deletion rows, so emitting "old" before "new" here keeps the result
   * order aligned with the rendered review stream.
   */
  side: SearchMatchSide;
  /** Absolute line number on that side (1-based). */
  line: number;
  /** Column start in the line text (0-based). */
  start: number;
  /** Column end exclusive. */
  end: number;
}

/** Find every case-insensitive substring match for the line array on one side of a hunk. */
function collectMatchesForLine(
  fileId: string,
  hunkIndex: number,
  side: SearchMatchSide,
  lineNumber: number,
  lineText: string,
  query: string,
  out: SearchMatch[],
) {
  if (lineText.length === 0 || query.length === 0) {
    return;
  }

  const haystack = lineText.toLowerCase();
  let cursor = 0;

  while (cursor <= haystack.length - query.length) {
    const found = haystack.indexOf(query, cursor);
    if (found < 0) {
      return;
    }

    out.push({
      fileId,
      hunkIndex,
      side,
      line: lineNumber,
      start: found,
      end: found + query.length,
    });
    // Advance by one rather than `query.length` so overlapping matches are
    // surfaced individually (e.g. searching `aa` in `aaaa` should report 3
    // matches, mirroring how editors show overlapping highlights).
    cursor = found + 1;
  }
}

/**
 * Find every case-insensitive substring match across the supplied files.
 *
 * The caller decides which files participate; the helper itself does not
 * filter or hide marked / filtered-out files. Callers that want
 * mark/filter-aware search pass `review.visibleFiles`.
 */
export function findSearchMatches(files: DiffFile[], query: string): SearchMatch[] {
  if (query.length === 0) {
    return [];
  }

  const normalizedQuery = query.toLowerCase();
  const matches: SearchMatch[] = [];

  for (const file of files) {
    const additionLines = file.metadata.additionLines ?? [];
    const deletionLines = file.metadata.deletionLines ?? [];

    for (const [hunkIndex, hunk] of file.metadata.hunks.entries()) {
      // Walk the deletion side first (rendered first in stack mode) so the
      // emitted match list is in visual stream order without a later sort.
      for (let offset = 0; offset < hunk.deletionCount; offset += 1) {
        const lineText = deletionLines[hunk.deletionLineIndex + offset] ?? "";
        const lineNumber = hunk.deletionStart + offset;
        collectMatchesForLine(
          file.id,
          hunkIndex,
          "old",
          lineNumber,
          lineText,
          normalizedQuery,
          matches,
        );
      }

      for (let offset = 0; offset < hunk.additionCount; offset += 1) {
        const lineText = additionLines[hunk.additionLineIndex + offset] ?? "";
        const lineNumber = hunk.additionStart + offset;
        collectMatchesForLine(
          file.id,
          hunkIndex,
          "new",
          lineNumber,
          lineText,
          normalizedQuery,
          matches,
        );
      }
    }
  }

  return matches;
}

/** Return the match at one stream cursor, wrapping around as needed. */
export function searchMatchAt(matches: SearchMatch[], cursor: number): SearchMatch | undefined {
  if (matches.length === 0) {
    return undefined;
  }
  const length = matches.length;
  const normalized = ((cursor % length) + length) % length;
  return matches[normalized];
}

/** Compute the next cursor position after applying `delta`, wrapping modulo `matches.length`. */
export function moveSearchCursor(cursor: number, delta: number, matchCount: number) {
  if (matchCount <= 0) {
    return 0;
  }
  return (((cursor + delta) % matchCount) + matchCount) % matchCount;
}

/** Stable lookup key shared by `DiffRowView` and the highlight-builder. */
export function searchRowKey(
  fileId: string,
  hunkIndex: number,
  side: SearchMatchSide,
  line: number,
) {
  return `${fileId}|${hunkIndex}|${side}|${line}`;
}

export interface SearchMatchByRow {
  /** All matches (active or not) grouped by `searchRowKey`. */
  byRow: Map<string, SearchMatch[]>;
  /** Stable key of the active match's row, or null when there is no cursor target. */
  activeRowKey: string | null;
  /** Identity of the active match within its row, used by row-level renderers to set active styling. */
  activeMatch: SearchMatch | null;
}

/** Group matches by row so the diff renderer can look up overlays in O(1) per cell. */
export function groupSearchMatchesByRow(
  matches: SearchMatch[],
  activeIndex: number,
): SearchMatchByRow {
  const byRow = new Map<string, SearchMatch[]>();
  for (const match of matches) {
    const key = searchRowKey(match.fileId, match.hunkIndex, match.side, match.line);
    const existing = byRow.get(key);
    if (existing) {
      existing.push(match);
    } else {
      byRow.set(key, [match]);
    }
  }

  const activeMatch = matches.length > 0 ? (matches[activeIndex] ?? null) : null;
  const activeRowKey = activeMatch
    ? searchRowKey(activeMatch.fileId, activeMatch.hunkIndex, activeMatch.side, activeMatch.line)
    : null;

  return { byRow, activeRowKey, activeMatch };
}
