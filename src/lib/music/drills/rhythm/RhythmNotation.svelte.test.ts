import { describe, expect, it, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";
import { RHYTHM_PATTERNS } from "@repo/music-core/content/rhythm";
import RhythmNotation from "./RhythmNotation.svelte";

describe("RhythmNotation", () => {
  it.each(RHYTHM_PATTERNS.map((p) => [p.id, p] as const))("engraves %s", async (_, p) => {
    const fallback = vi.fn();
    const { container } = render(RhythmNotation, {
      pattern: p,
      label: p.label,
      cursorBeat: 0.5,
      states: { 0: "correct", 1: "wrong" },
      hits: [{ beat: 0, kind: "pocket" }],
      onfallback: fallback,
    });
    await vi.waitFor(() => expect(container.querySelector(".host svg")).toBeTruthy(), {
      timeout: 10000,
    });
    expect(fallback).not.toHaveBeenCalled();
    // Every event is a drawn note, coloured by its state; the cursor and the tap ride along.
    expect(container.querySelectorAll("[data-event]")).toHaveLength(p.events.length);
    expect(container.querySelector('[data-event="0"]')!.getAttribute("data-state")).toBe("correct");
    expect(container.querySelector('[data-event="1"]')!.getAttribute("data-state")).toBe("wrong");
    expect(container.querySelectorAll("[data-cursor]")).toHaveLength(1);
    expect(container.querySelectorAll('.hit[data-kind="pocket"]')).toHaveLength(1);
  });
});
