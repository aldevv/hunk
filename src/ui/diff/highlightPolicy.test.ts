import { describe, expect, test } from "bun:test";
import { createTestDiffFile } from "../../../test/helpers/diff-helpers";
import { resolveDiffHighlightMode } from "./highlightPolicy";

describe("resolveDiffHighlightMode", () => {
  test("keeps normal source files on full syntax highlighting", () => {
    const file = createTestDiffFile({ path: "src/example.ts", language: "typescript" });

    expect(resolveDiffHighlightMode(file)).toBe("full");
  });

  test("uses plain-text highlighting for generated dependency manifests", () => {
    const file = createTestDiffFile({ path: "pnpm-lock.yaml", language: "yaml" });

    expect(resolveDiffHighlightMode(file)).toBe("text");
  });

  test("skips highlight work entirely for very large lockfile diffs", () => {
    const file = createTestDiffFile({ path: "package-lock.json", language: "json" });

    file.metadata = {
      ...file.metadata,
      deletionLines: Array.from({ length: 2_500 }, (_, index) => `old-${index}`),
      additionLines: Array.from({ length: 2_500 }, (_, index) => `new-${index}`),
    };

    expect(resolveDiffHighlightMode(file)).toBe("none");
  });
});
