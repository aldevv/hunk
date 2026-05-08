import { describe, expect, test } from "bun:test";
import { parseDiffFromFile } from "@pierre/diffs";
import type { DiffFile } from "../../core/types";
import { findSearchMatches, moveSearchCursor, searchMatchAt } from "./searchMatches";

/** Build a real DiffFile via Pierre so the helper walks the same metadata the renderer does. */
function createDiffFile(id: string, path: string, before: string, after: string): DiffFile {
  const metadata = parseDiffFromFile(
    { name: path, contents: before, cacheKey: `${id}:before` },
    { name: path, contents: after, cacheKey: `${id}:after` },
    { context: 3 },
    true,
  );

  let additions = 0;
  let deletions = 0;
  for (const hunk of metadata.hunks) {
    for (const content of hunk.hunkContent) {
      if (content.type === "change") {
        additions += content.additions;
        deletions += content.deletions;
      }
    }
  }

  return {
    id,
    path,
    patch: "",
    language: "typescript",
    stats: { additions, deletions },
    metadata,
    agent: null,
  };
}

/** Keep multi-line fixtures readable. */
function lines(...values: string[]) {
  return `${values.join("\n")}\n`;
}

describe("findSearchMatches", () => {
  test("returns an empty array when the query is empty", () => {
    const file = createDiffFile(
      "alpha",
      "alpha.ts",
      "export const alpha = 1;\n",
      "export const alpha = 2;\n",
    );

    expect(findSearchMatches([file], "")).toEqual([]);
  });

  test("matches case-insensitively and returns the original column window", () => {
    // The before/after pair makes pierre emit both old (deletion) and new (addition) lines so a
    // case-insensitive match should land on the new-side `betaValue` text only.
    const file = createDiffFile(
      "beta",
      "beta.ts",
      "export const beta = 1;\n",
      "export const betaValue = 2;\n",
    );

    const matches = findSearchMatches([file], "Beta");
    // At least one match should be on the new side, surfacing the substring inside `betaValue`.
    const newSideMatches = matches.filter((match) => match.side === "new");
    expect(newSideMatches.length).toBeGreaterThan(0);
    const first = newSideMatches[0]!;
    expect(first.fileId).toBe("beta");
    expect("export const betaValue = 2;".slice(first.start, first.end).toLowerCase()).toBe("beta");
  });

  test("emits matches in stream order across files, hunks, sides, and columns", () => {
    const alpha = createDiffFile(
      "alpha",
      "alpha.ts",
      lines(
        "export const targetA = 0;",
        "export const filler1 = 1;",
        "export const filler2 = 2;",
        "export const filler3 = 3;",
        "export const filler4 = 4;",
        "export const filler5 = 5;",
        "export const filler6 = 6;",
        "export const targetB = 0;",
      ),
      lines(
        "export const targetA_target = 0;",
        "export const filler1 = 1;",
        "export const filler2 = 2;",
        "export const filler3 = 3;",
        "export const filler4 = 4;",
        "export const filler5 = 5;",
        "export const filler6 = 6;",
        "export const targetB_target = 0;",
      ),
    );
    const beta = createDiffFile(
      "beta",
      "beta.ts",
      "export const beta = 1;\n",
      "export const target_in_beta = 2;\n",
    );

    const matches = findSearchMatches([alpha, beta], "target");

    // First, alpha matches must come before beta matches.
    const fileIds = matches.map((match) => match.fileId);
    const lastAlphaIndex = fileIds.lastIndexOf("alpha");
    const firstBetaIndex = fileIds.indexOf("beta");
    expect(lastAlphaIndex).toBeGreaterThan(-1);
    expect(firstBetaIndex).toBeGreaterThan(lastAlphaIndex);

    // Within alpha, hunkIndex is non-decreasing.
    const alphaMatches = matches.filter((match) => match.fileId === "alpha");
    for (let index = 1; index < alphaMatches.length; index += 1) {
      expect(alphaMatches[index]!.hunkIndex).toBeGreaterThanOrEqual(
        alphaMatches[index - 1]!.hunkIndex,
      );
    }

    // For matches on the same file/hunk/side/line, columns are ascending.
    const grouped = new Map<string, typeof matches>();
    for (const match of matches) {
      const key = `${match.fileId}:${match.hunkIndex}:${match.side}:${match.line}`;
      const existing = grouped.get(key) ?? [];
      existing.push(match);
      grouped.set(key, existing);
    }
    for (const group of grouped.values()) {
      for (let index = 1; index < group.length; index += 1) {
        expect(group[index]!.start).toBeGreaterThan(group[index - 1]!.start);
      }
    }
  });

  test("emits old-side matches before new-side matches inside the same hunk", () => {
    const file = createDiffFile(
      "swap",
      "swap.ts",
      "export const TARGET_OLD = 1;\n",
      "export const TARGET_NEW = 1;\n",
    );

    const matches = findSearchMatches([file], "target");
    const sides = matches.map((match) => match.side);
    const firstNewIndex = sides.indexOf("new");
    const lastOldIndex = sides.lastIndexOf("old");
    if (firstNewIndex >= 0 && lastOldIndex >= 0) {
      expect(firstNewIndex).toBeGreaterThan(lastOldIndex);
    }
  });

  test("reports overlapping matches (e.g. `aa` inside `aaaa`)", () => {
    const file = createDiffFile(
      "overlap",
      "overlap.ts",
      "export const x = 'aaaa';\n",
      "export const x = 'aaaab';\n",
    );

    const matches = findSearchMatches([file], "aa");
    // Each side has 4 a's; `aa` should match three times per side.
    const newSide = matches.filter((match) => match.side === "new");
    expect(newSide.length).toBeGreaterThanOrEqual(3);
  });
});

describe("searchMatchAt", () => {
  test("returns undefined when the match list is empty", () => {
    expect(searchMatchAt([], 0)).toBeUndefined();
  });

  test("wraps the cursor around the match list", () => {
    const file = createDiffFile(
      "wrap",
      "wrap.ts",
      "export const x = 'one two';\n",
      "export const x = 'one two three';\n",
    );
    const matches = findSearchMatches([file], "two");
    expect(matches.length).toBeGreaterThan(0);

    const first = searchMatchAt(matches, 0)!;
    const wrapped = searchMatchAt(matches, matches.length)!;
    expect(wrapped).toEqual(first);
  });
});

describe("moveSearchCursor", () => {
  test("returns 0 when there are no matches", () => {
    expect(moveSearchCursor(2, 1, 0)).toBe(0);
    expect(moveSearchCursor(0, -1, 0)).toBe(0);
  });

  test("wraps modulo matchCount in both directions", () => {
    expect(moveSearchCursor(0, 1, 3)).toBe(1);
    expect(moveSearchCursor(2, 1, 3)).toBe(0);
    expect(moveSearchCursor(0, -1, 3)).toBe(2);
    expect(moveSearchCursor(0, -4, 3)).toBe(2);
  });
});
