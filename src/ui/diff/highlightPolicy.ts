import type { DiffFile } from "../../core/types";

export type DiffHighlightMode = "full" | "text" | "none";

const GENERATED_DEPENDENCY_FILE_BASENAMES = new Set([
  "bun.lock",
  "bun.lockb",
  "cargo.lock",
  "composer.lock",
  "gemfile.lock",
  "go.sum",
  "npm-shrinkwrap.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "podfile.lock",
  "yarn.lock",
]);
const DISABLED_LOCKFILE_HIGHLIGHT_LINE_THRESHOLD = 2_500;

/** Return the last path segment so lockfile policies stay path-prefix agnostic. */
function basename(path: string) {
  return path.split("/").filter(Boolean).pop()?.toLowerCase() ?? path.toLowerCase();
}

/** Estimate the rendered footprint of one diff using the larger side's line count. */
function diffLineFootprint(file: DiffFile) {
  return Math.max(file.metadata.deletionLines.length, file.metadata.additionLines.length);
}

/**
 * Keep large generated dependency manifests on the cheap rendering path.
 *
 * Full syntax highlighting adds little review value for lockfiles but can produce thousands of
 * extra token spans. Smaller lockfiles still get plain-text diff emphasis, while very large ones
 * skip async highlight work entirely so the review stream paints sooner.
 */
export function resolveDiffHighlightMode(file: DiffFile): DiffHighlightMode {
  if (!GENERATED_DEPENDENCY_FILE_BASENAMES.has(basename(file.path))) {
    return "full";
  }

  return diffLineFootprint(file) >= DISABLED_LOCKFILE_HIGHLIGHT_LINE_THRESHOLD ? "none" : "text";
}
