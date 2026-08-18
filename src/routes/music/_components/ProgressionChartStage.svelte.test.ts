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

  test("the target-tone strip is a static PianoSurface carrying the roles", () => {
    const progression = JAM_PROGRESSIONS[0]!;
    const current = progression.chords[1]!;
    const tones = targetTones(current.symbol, current.scale);

    render(ProgressionChartStage, { progression, currentIndex: 1, tones });

    // G7: the shared surface's own keys carry the roles, one octave from C4.
    const roleOf = (note: string) =>
      document.querySelector(`[data-note='${note}']`)?.getAttribute("data-tone-role");
    expect(roleOf("G4")).toBe("chord");
    expect(roleOf("B4")).toBe("chord");
    expect(roleOf("A4")).toBe("scale");
    expect(roleOf("C#4")).toBe("avoid");
    expect(document.querySelectorAll("[data-note]")).toHaveLength(12);

    // Static: one summary, no key tab stops added to the stage.
    const summary = document.querySelectorAll("[data-testid='piano-summary']");
    expect(summary).toHaveLength(1);
    expect(summary[0]?.textContent).toContain("G4, chord tone");
    expect(
      [...document.querySelectorAll("button")].filter((button) => button.hasAttribute("data-note")),
    ).toHaveLength(0);
  });
});
