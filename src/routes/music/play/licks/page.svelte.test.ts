import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { LICK_PHRASES } from "@repo/music-core/engines/jazz";

import Page from "./+page.svelte";
import type { MusicRuntime } from "../../_runtime.svelte";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  window.history.replaceState({}, "", "/");
});

describe("/music/play/licks/+page.svelte", () => {
  test("renders the licks drill with category + lick selectors and play controls", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Jazz Licks Drill");

    const categories = [...document.querySelectorAll('[aria-label="Lick category"] button')].map(
      (button) => button.textContent?.trim(),
    );
    expect(categories).toEqual(["Major ii-V-I", "ii-V-I-VI", "Minor ii-V-i", "Minor chord"]);

    // The lick picker exposes a button per lick in the active category.
    const lickButtons = document.querySelectorAll('[aria-label="Pick a lick"] button');
    expect(lickButtons.length).toBeGreaterThan(0);

    const actions = [...document.querySelectorAll("button")].map((b) => b.textContent?.trim());
    expect(actions).toContain("Hear it");
    expect(actions).toContain("Play it back");
  });

  test("switching category swaps the available licks", async () => {
    render(Page);

    const before = document.querySelectorAll('[aria-label="Pick a lick"] button').length;
    const minorChord = [...document.querySelectorAll('[aria-label="Lick category"] button')].find(
      (button) => button.textContent?.trim() === "Minor chord",
    ) as HTMLButtonElement | undefined;
    minorChord?.click();
    await Promise.resolve();

    const after = document.querySelectorAll('[aria-label="Pick a lick"] button').length;
    expect(after).toBeGreaterThan(0);
    // The selected lick resets into the new category (first lick is pressed).
    const pressed = document.querySelector(
      '[aria-label="Pick a lick"] button[aria-pressed="true"]',
    );
    expect(pressed).not.toBeNull();
    expect(before).toBeGreaterThan(0);
  });

  test("restores and syncs the shareable lick setup URL", async () => {
    window.history.replaceState({}, "", "/music/play/licks?category=minor-chord&lick=26");

    render(Page);

    await vi.waitFor(() => expect(document.body.textContent).toContain("Lick #26"));
    expect(
      document.querySelector('[aria-label="Lick category"] button[aria-pressed="true"]')
        ?.textContent,
    ).toContain("Minor chord");

    button("25")?.click();

    await vi.waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.get("category")).toBe("minor-chord");
      expect(params.get("lick")).toBe("25");
    });
  });

  test("records a completed lick with scoring events and run metadata", async () => {
    const harness = makeRuntime();
    render(Page, { props: { runtime: harness.runtime as unknown as MusicRuntime } });

    button("Play it back")?.click();
    const expected = LICK_PHRASES[1]!.map(([midi]) => midi);
    for (const [index, midi] of expected.entries()) {
      harness.emit(midi, index * 100);
    }

    await vi.waitFor(() => expect(harness.runtime.recordPractice).toHaveBeenCalledOnce());
    const entry = harness.runtime.recordPractice.mock.calls[0]![0];
    expect(entry.tags).toEqual(["jazz", "licks"]);
    expect(entry.scoringEvents).toHaveLength(1);
    expect(entry.runs).toHaveLength(1);
    expect(entry.scoringEvents[0]).toMatchObject({
      exerciseId: "jazz.lick.playback",
      skillIds: ["harmony.ii-v-i"],
      partialCredit: 1,
    });
    expect(entry.runs[0]).toMatchObject({
      exerciseId: "jazz.lick.playback",
      targetSkillIds: ["harmony.ii-v-i"],
    });
  });

  test("uses the shared retry bar after a graded lick", async () => {
    const harness = makeRuntime();
    render(Page, { props: { runtime: harness.runtime as unknown as MusicRuntime } });

    button("Play it back")?.click();
    const expected = LICK_PHRASES[1]!.map(([midi]) => midi);
    for (const [index, midi] of expected.entries()) harness.emit(midi, index * 100);

    await vi.waitFor(() => expect(button("Repeat lick")).not.toBeUndefined());
    button("Repeat lick")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Play the lick"));
    expect(button("Repeat lick")).toBeUndefined();
  });
});

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

function makeRuntime() {
  let listener:
    | ((event: { type: "noteOn"; midiNote: number; velocity: number; timestamp: number }) => void)
    | undefined;
  const runtime = {
    activeSource: "onscreen",
    audioEnabled: false,
    dailyRoutine: undefined,
    enableAudio: vi.fn(async () => true),
    sound: { playNote: vi.fn() },
    router: {
      subscribe: vi.fn((next) => {
        listener = next;
        return vi.fn();
      }),
      push: vi.fn(() => true),
    },
    recordPractice: vi.fn(async () => undefined),
  };

  return {
    runtime,
    emit(midiNote: number, timestamp: number) {
      listener?.({ type: "noteOn", midiNote, velocity: 1, timestamp });
    },
  };
}
