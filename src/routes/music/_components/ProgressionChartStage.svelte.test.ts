import { afterEach, describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { JAM_PROGRESSIONS, targetTones } from "@repo/music-core/engines/jam";

import ProgressionChartStage from "./ProgressionChartStage.svelte";

afterEach(() => {
  document.body.replaceChildren();
});

describe("ProgressionChartStage", () => {
  test("renders the active chord, next chord, chart, and target-tone roles", () => {
    const progression = JAM_PROGRESSIONS[0]!;
    const current = progression.chords[1]!;

    render(ProgressionChartStage, {
      progression,
      currentIndex: 1,
      tones: targetTones(current.symbol, current.scale),
    });

    expect(document.querySelector("[data-testid='progression-current-symbol']")?.textContent).toBe(
      "G7",
    );
    expect(
      document.querySelector("[data-testid='progression-next-symbol']")?.textContent,
    ).toContain("Cmaj7");
    expect(document.querySelector("[data-testid='progression-cell-1']")).toHaveAttribute(
      "data-state",
      "current",
    );
    expect(document.querySelector("[data-testid='progression-cell-2']")).toHaveAttribute(
      "data-state",
      "next",
    );
    expect(document.querySelectorAll("[data-tone-role='chord']").length).toBeGreaterThan(0);
    expect(document.querySelectorAll("[data-tone-role='scale']").length).toBeGreaterThan(0);
  });
});
