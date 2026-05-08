import { describe, expect, test } from "bun:test";
import { applySearchHighlights, type SearchHighlightPalette } from "./searchHighlight";
import type { RenderSpan } from "./pierre";

const PALETTE: SearchHighlightPalette = {
  matchBg: "#440044",
  matchFg: "#ffffff",
  activeMatchBg: "#aa44aa",
  activeMatchFg: "#000000",
};

describe("applySearchHighlights", () => {
  test("returns the input unchanged when there are no ranges", () => {
    const spans: RenderSpan[] = [{ text: "hello", fg: "#abc", bg: "#123" }];
    expect(applySearchHighlights(spans, [], PALETTE)).toEqual(spans);
  });

  test("highlights one match in the middle of a single span", () => {
    const spans: RenderSpan[] = [{ text: "abcdefg", fg: "#111", bg: "#222" }];
    const result = applySearchHighlights(spans, [{ start: 2, end: 5, active: false }], PALETTE);

    // The result should contain three runs: "ab" (original), "cde" (highlight), "fg" (original).
    const concatenatedText = result.map((span) => span.text).join("");
    expect(concatenatedText).toBe("abcdefg");
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ text: "ab", fg: "#111", bg: "#222" });
    expect(result[1]).toEqual({ text: "cde", fg: PALETTE.matchFg, bg: PALETTE.matchBg });
    expect(result[2]).toEqual({ text: "fg", fg: "#111", bg: "#222" });
  });

  test("uses the active palette for the active match and the inactive palette otherwise", () => {
    const spans: RenderSpan[] = [{ text: "0123456789", fg: "#111", bg: "#222" }];
    const result = applySearchHighlights(
      spans,
      [
        { start: 1, end: 3, active: false },
        { start: 5, end: 7, active: true },
      ],
      PALETTE,
    );

    const inactiveRun = result.find((span) => span.text === "12");
    const activeRun = result.find((span) => span.text === "56");
    expect(inactiveRun).toEqual({ text: "12", fg: PALETTE.matchFg, bg: PALETTE.matchBg });
    expect(activeRun).toEqual({ text: "56", fg: PALETTE.activeMatchFg, bg: PALETTE.activeMatchBg });
  });

  test("handles a match that spans the boundary between two spans", () => {
    const spans: RenderSpan[] = [
      { text: "foo", fg: "#aaa", bg: "#111" },
      { text: "bar", fg: "#bbb", bg: "#222" },
    ];
    // Match columns 2..5 -> covers the trailing `o` from the first span and the leading `ba` from the second.
    const result = applySearchHighlights(spans, [{ start: 2, end: 5, active: false }], PALETTE);

    const concatenatedText = result.map((span) => span.text).join("");
    expect(concatenatedText).toBe("foobar");
    // The two highlighted segments share the same paint, so they should merge into one span.
    const highlightRun = result.find((span) => span.text === "oba");
    expect(highlightRun).toEqual({ text: "oba", fg: PALETTE.matchFg, bg: PALETTE.matchBg });
    // Surrounding runs should keep their own fg/bg.
    expect(result[0]).toEqual({ text: "fo", fg: "#aaa", bg: "#111" });
    expect(result[result.length - 1]).toEqual({ text: "r", fg: "#bbb", bg: "#222" });
  });

  test("merges consecutive identical-paint highlight runs into one span", () => {
    const spans: RenderSpan[] = [{ text: "abcdefgh", fg: "#111", bg: "#222" }];
    const result = applySearchHighlights(
      spans,
      [
        { start: 0, end: 3, active: false },
        { start: 3, end: 6, active: false },
      ],
      PALETTE,
    );

    const highlightRun = result.find(
      (span) => span.fg === PALETTE.matchFg && span.bg === PALETTE.matchBg,
    );
    expect(highlightRun).toEqual({ text: "abcdef", fg: PALETTE.matchFg, bg: PALETTE.matchBg });
  });

  test("ignores ranges that lie outside the cell", () => {
    const spans: RenderSpan[] = [{ text: "short", fg: "#111", bg: "#222" }];
    const result = applySearchHighlights(spans, [{ start: 100, end: 200, active: false }], PALETTE);

    expect(result).toEqual(spans);
  });
});
