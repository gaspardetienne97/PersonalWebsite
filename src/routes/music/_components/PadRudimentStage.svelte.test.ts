import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { InputRouter } from "@repo/music-core/engines/input-router";

import PadRudimentStage from "./PadRudimentStage.svelte";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("PadRudimentStage", () => {
  test("renders the pad grid with a current sequence lane", () => {
    const router = new InputRouter();

    render(PadRudimentStage, {
      router,
      targetSequence: [36, 38, 36, 38],
      completedHits: 2,
      bpm: 80,
    });

    expect(document.querySelector('[aria-label="MPC pad grid"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Next pad cue");
    expect(document.body.textContent).toContain("Pad 36");
    expect(document.querySelector('[aria-label="Rudiment sequence lane"]')).not.toBeNull();
    expect(document.querySelector('[data-rudiment-step="0"]')).toHaveAttribute(
      "data-state",
      "completed",
    );
    expect(document.querySelector('[data-rudiment-step="2"]')).toHaveAttribute(
      "data-state",
      "current",
    );
    expect(document.querySelector('[data-rudiment-step="3"]')).toHaveAttribute(
      "data-state",
      "upcoming",
    );
  });
});
