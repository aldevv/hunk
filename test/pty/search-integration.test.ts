import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { createPtyHarness } from "./harness";

const harness = createPtyHarness();

setDefaultTimeout(20_000);

afterEach(() => {
  harness.cleanup();
});

describe("diff text search", () => {
  test("/, type, Enter highlights matches; n moves the cursor; Esc clears highlights", async () => {
    const fixture = harness.createSidebarJumpRepoFixture();
    const session = await harness.launchHunk({
      args: ["diff", "--mode", "split"],
      cwd: fixture.dir,
      cols: 220,
      rows: 18,
    });

    try {
      await session.waitForText(/View\s+Navigate\s+Theme\s+Agent\s+Help/, {
        timeout: 15_000,
      });

      // Search for `Value` — the fixture has `alphaValue`, `betaValue`, `gammaValue`,
      // `deltaValue`, and `epsilonValue` on the new side, so there should be at least 5 matches.
      await session.press("/");
      const opened = await harness.waitForSnapshot(
        session,
        (text) => text.includes("search:"),
        5_000,
      );
      expect(opened).toContain("search:");

      await session.type("Value");
      await session.press("enter");

      const indicatorMatch = await harness.waitForSnapshot(
        session,
        (text) => /\b1\/\d+\b/.test(text) && !text.includes("search:"),
        5_000,
      );
      // The status bar should show `search=Value <cursor>/<total>` once the input is unfocused.
      expect(indicatorMatch).toMatch(/search=Value/);
      expect(indicatorMatch).toMatch(/\b1\/\d+\b/);

      const totalMatchCount = Number(indicatorMatch.match(/\b1\/(\d+)\b/)?.[1] ?? "0");
      expect(totalMatchCount).toBeGreaterThan(0);

      // `n` advances the cursor; the indicator should change to `2/<total>` (or wrap if there
      // is exactly one match — the fixture has more, so we expect a real advance).
      await session.press("n");
      const advanced = await harness.waitForSnapshot(
        session,
        (text) => /\b2\/\d+\b/.test(text),
        5_000,
      );
      expect(advanced).toMatch(/\b2\/\d+\b/);

      // `/`-then-Esc cancels search. Open the input; with empty draft Esc tears it down.
      await session.press("/");
      await harness.waitForSnapshot(session, (text) => text.includes("search:"), 5_000);
      // Clear the seeded draft so Esc on empty cancels rather than just clearing.
      await session.press("escape");
      await session.press("escape");

      const cleared = await harness.waitForSnapshot(
        session,
        (text) => !text.includes("search:") && !text.includes("search=Value"),
        5_000,
      );
      expect(cleared).not.toContain("search:");
      expect(cleared).not.toContain("search=Value");
    } finally {
      session.close();
    }
  });
});
