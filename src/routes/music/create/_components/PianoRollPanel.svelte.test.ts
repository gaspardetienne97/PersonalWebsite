import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import type { MusicRuntime } from "../../_runtime.svelte";
import Panel from "./PianoRollPanel.svelte";

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

function cell(label: string): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
}

describe("PianoRollPanel", () => {
  test("renders the grid and the three tracks", () => {
    render(Panel);
    expect(document.body.textContent).toContain("Piano Roll");
    expect(button("Lead")).not.toBeUndefined();
    expect(button("Keys")).not.toBeUndefined();
    expect(button("Bass")).not.toBeUndefined();
    // The seeded arpeggio places C4 at the first beat.
    expect(cell("C4 step 1")).toHaveAttribute("aria-pressed", "true");
    expect(cell("C4 step 5")).toHaveAttribute("aria-pressed", "false");
  });

  test("places a note on an empty cell", async () => {
    render(Panel);
    const empty = cell("C4 step 5");
    empty?.click();
    await vi.waitFor(() => expect(cell("C4 step 5")).toHaveAttribute("aria-pressed", "true"));
  });

  test("loads a saved take score from local piano-roll state", async () => {
    const runtime = {
      transportBpm: 100,
      media: {},
      enableAudio: vi.fn(async () => true),
      readLocalState: vi.fn(async (id: string) =>
        id === "music.piano-roll.score"
          ? {
              id: "take-1",
              title: "Practice Lab take 1",
              origin: "midi",
              tempoMap: [{ atBeat: 0, bpm: 100 }],
              timeSignatures: [{ atBeat: 0, numerator: 4, denominator: 4 }],
              voices: [{ id: "lead", name: "Practice Lab take 1", role: "melody" }],
              notes: [
                { midiNote: 62, startBeat: 0, durationBeats: 0.5, velocity: 0.8, voiceId: "lead" },
              ],
              chords: [],
              sections: [],
              markers: [],
            }
          : undefined,
      ),
      writeLocalState: vi.fn(async () => undefined),
      setPlaybackSource: vi.fn(),
      sound: {
        startPatternLoop: vi.fn(),
        stopPatternLoop: vi.fn(),
      },
    };

    render(Panel, { runtime: runtime as unknown as MusicRuntime });

    await vi.waitFor(() => expect(document.body.textContent).toContain("Loaded saved piano roll."));
    expect(cell("D4 step 1")).toHaveAttribute("aria-pressed", "true");
  });

  test("offers explicit pending take import choices before changing the saved piano roll", async () => {
    const writes: Array<[string, unknown]> = [];
    const runtime = {
      transportBpm: 100,
      media: {},
      enableAudio: vi.fn(async () => true),
      readLocalState: vi.fn(async (id: string) => {
        if (id === "music.piano-roll.score") {
          return {
            id: "piano-roll",
            title: "Piano Roll",
            origin: "generated",
            tempoMap: [{ atBeat: 0, bpm: 100 }],
            timeSignatures: [{ atBeat: 0, numerator: 4, denominator: 4 }],
            voices: [{ id: "lead", name: "Lead", role: "melody" }],
            notes: [
              { midiNote: 67, startBeat: 0, durationBeats: 1, velocity: 0.85, voiceId: "lead" },
            ],
            chords: [],
            sections: [],
            markers: [],
          };
        }
        if (id === "music.piano-roll.pending-take-import") {
          return {
            bpm: 120,
            take: {
              id: "take-1",
              name: "Practice Lab take 1",
              source: "midi",
              durationMs: 1_000,
              notes: [
                { midi: 60, atMs: 0, velocity: 0.8 },
                { midi: 64, atMs: 500, velocity: 0.7 },
              ],
            },
          };
        }
      }),
      writeLocalState: vi.fn(async (id: string, value: unknown) => {
        writes.push([id, value]);
      }),
      setPlaybackSource: vi.fn(),
      sound: {
        startPatternLoop: vi.fn(),
        stopPatternLoop: vi.fn(),
      },
    };

    render(Panel, { runtime: runtime as unknown as MusicRuntime });

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Import Practice Lab take 1?"),
    );
    expect(document.body.textContent).toContain("Loaded saved piano roll.");
    expect(button("Add as track")).not.toBeUndefined();
    expect(button("Replace roll")).not.toBeUndefined();
    expect(button("Discard import")).not.toBeUndefined();
    expect(button("Lead")).not.toBeUndefined();
    expect(button("Practice Lab take 1")).toBeUndefined();
    expect(cell("G4 step 1")).toHaveAttribute("aria-pressed", "true");
    expect(writes).toEqual([]);

    button("Add as track")?.click();
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Imported Practice Lab take 1 as a new track."),
    );
    expect(button("Practice Lab take 1")).not.toBeUndefined();
    button("Practice Lab take 1")?.click();
    await vi.waitFor(() => expect(cell("C4 step 1")).toHaveAttribute("aria-pressed", "true"));
    expect(cell("G4 step 1")).toHaveAttribute("aria-pressed", "false");
    expect(writes).toEqual([
      [
        "music.piano-roll.score",
        expect.objectContaining({
          voices: [
            expect.objectContaining({ id: "lead" }),
            expect.objectContaining({ name: "Practice Lab take 1" }),
          ],
        }),
      ],
      ["music.piano-roll.pending-take-import", undefined],
    ]);
  });

  test("can replace the saved piano roll with a pending take import", async () => {
    const writes: Array<[string, unknown]> = [];
    const runtime = {
      transportBpm: 100,
      media: {},
      enableAudio: vi.fn(async () => true),
      readLocalState: vi.fn(async (id: string) => {
        if (id === "music.piano-roll.score") {
          return {
            id: "piano-roll",
            title: "Piano Roll",
            origin: "generated",
            tempoMap: [{ atBeat: 0, bpm: 100 }],
            timeSignatures: [{ atBeat: 0, numerator: 4, denominator: 4 }],
            voices: [{ id: "lead", name: "Lead", role: "melody" }],
            notes: [
              { midiNote: 67, startBeat: 0, durationBeats: 1, velocity: 0.85, voiceId: "lead" },
            ],
            chords: [],
            sections: [],
            markers: [],
          };
        }
        if (id === "music.piano-roll.pending-take-import") {
          return {
            bpm: 120,
            take: {
              id: "take-1",
              name: "Practice Lab take 1",
              source: "midi",
              durationMs: 1_000,
              notes: [
                { midi: 60, atMs: 0, velocity: 0.8 },
                { midi: 64, atMs: 500, velocity: 0.7 },
              ],
            },
          };
        }
      }),
      writeLocalState: vi.fn(async (id: string, value: unknown) => {
        writes.push([id, value]);
      }),
      setPlaybackSource: vi.fn(),
      sound: {
        startPatternLoop: vi.fn(),
        stopPatternLoop: vi.fn(),
      },
    };

    render(Panel, { runtime: runtime as unknown as MusicRuntime });

    await vi.waitFor(() => expect(button("Replace roll")).not.toBeUndefined());
    button("Replace roll")?.click();

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Replaced piano roll with Practice Lab take 1."),
    );
    expect(button("Lead")).toBeUndefined();
    expect(button("Practice Lab take 1")).not.toBeUndefined();
    expect(cell("C4 step 1")).toHaveAttribute("aria-pressed", "true");
    expect(cell("G4 step 1")).toHaveAttribute("aria-pressed", "false");
    expect(writes).toEqual([
      [
        "music.piano-roll.score",
        expect.objectContaining({
          voices: [expect.objectContaining({ id: "lead", name: "Practice Lab take 1" })],
        }),
      ],
      ["music.piano-roll.pending-take-import", undefined],
    ]);
  });

  test("can discard a pending take import without changing the saved piano roll", async () => {
    const writes: Array<[string, unknown]> = [];
    const runtime = {
      transportBpm: 100,
      media: {},
      enableAudio: vi.fn(async () => true),
      readLocalState: vi.fn(async (id: string) => {
        if (id === "music.piano-roll.score") {
          return {
            id: "piano-roll",
            title: "Piano Roll",
            origin: "generated",
            tempoMap: [{ atBeat: 0, bpm: 100 }],
            timeSignatures: [{ atBeat: 0, numerator: 4, denominator: 4 }],
            voices: [{ id: "lead", name: "Lead", role: "melody" }],
            notes: [
              { midiNote: 67, startBeat: 0, durationBeats: 1, velocity: 0.85, voiceId: "lead" },
            ],
            chords: [],
            sections: [],
            markers: [],
          };
        }
        if (id === "music.piano-roll.pending-take-import") {
          return {
            bpm: 120,
            take: {
              id: "take-1",
              name: "Practice Lab take 1",
              source: "midi",
              durationMs: 1_000,
              notes: [{ midi: 60, atMs: 0, velocity: 0.8 }],
            },
          };
        }
      }),
      writeLocalState: vi.fn(async (id: string, value: unknown) => {
        writes.push([id, value]);
      }),
      setPlaybackSource: vi.fn(),
      sound: {
        startPatternLoop: vi.fn(),
        stopPatternLoop: vi.fn(),
      },
    };

    render(Panel, { runtime: runtime as unknown as MusicRuntime });

    await vi.waitFor(() => expect(button("Discard import")).not.toBeUndefined());
    button("Discard import")?.click();

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Discarded Practice Lab take 1."),
    );
    expect(button("Practice Lab take 1")).toBeUndefined();
    expect(cell("G4 step 1")).toHaveAttribute("aria-pressed", "true");
    expect(writes).toEqual([["music.piano-roll.pending-take-import", undefined]]);
  });

  test("shows a velocity lane and applies the selected velocity to the active track", async () => {
    render(Panel);
    expect(document.querySelector('[aria-label="Velocity lane"]')).not.toBeNull();

    const input = document.querySelector<HTMLInputElement>('input[aria-label="Note velocity"]')!;
    input.value = "0.42";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    button("Apply velocity")?.click();
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Set Lead velocity to 42%."),
    );
  });

  test("supports horizontal grid zoom without changing the score", async () => {
    render(Panel);

    const input = document.querySelector<HTMLInputElement>('input[aria-label="Horizontal zoom"]')!;
    input.value = "2";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    await vi.waitFor(() => expect(document.body.textContent).toContain("2.00x"));
    expect(cell("C4 step 1")).toHaveAttribute("aria-pressed", "true");
  });

  test("adds another bar and allows notes beyond the initial two-bar grid", async () => {
    render(Panel);

    expect(cell("C4 step 33")).toBeNull();
    button("Add bar")?.click();

    await vi.waitFor(() => expect(cell("C4 step 33")).not.toBeNull());
    cell("C4 step 33")?.click();
    await vi.waitFor(() => expect(cell("C4 step 33")).toHaveAttribute("aria-pressed", "true"));
    expect(document.body.textContent).toContain("3 bars");
  });

  test("adds and removes arrangement sections from the piano roll", async () => {
    const writes: Array<[string, unknown]> = [];
    const runtime = {
      transportBpm: 100,
      media: undefined,
      enableAudio: vi.fn(async () => true),
      readLocalState: vi.fn(async () => undefined),
      writeLocalState: vi.fn(async (id: string, value: unknown) => {
        writes.push([id, value]);
      }),
      setPlaybackSource: vi.fn(),
      sound: {
        startPatternLoop: vi.fn(),
        stopPatternLoop: vi.fn(),
      },
    };

    render(Panel, { runtime: runtime as unknown as MusicRuntime });

    expect(document.body.textContent).toContain("Arrangement");
    expect(document.body.textContent).toContain("No sections yet.");

    button("Add section")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Intro · bars 1-1"));
    expect(writes.at(-1)).toEqual([
      "music.piano-roll.score",
      expect.objectContaining({
        sections: [{ id: "intro", name: "Intro", startBeat: 0, endBeat: 4 }],
      }),
    ]);

    button("Remove Intro")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Removed Intro."));
    expect(document.body.textContent).toContain("No sections yet.");
    expect(writes.at(-1)).toEqual([
      "music.piano-roll.score",
      expect.objectContaining({ sections: [] }),
    ]);
  });

  test("renames arrangement sections and persists the score", async () => {
    const writes: Array<[string, unknown]> = [];
    const runtime = {
      transportBpm: 100,
      media: undefined,
      enableAudio: vi.fn(async () => true),
      readLocalState: vi.fn(async () => undefined),
      writeLocalState: vi.fn(async (id: string, value: unknown) => {
        writes.push([id, value]);
      }),
      setPlaybackSource: vi.fn(),
      sound: {
        startPatternLoop: vi.fn(),
        stopPatternLoop: vi.fn(),
      },
    };

    render(Panel, { runtime: runtime as unknown as MusicRuntime });

    button("Add section")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Intro · bars 1-1"));

    const input = document.querySelector<HTMLInputElement>('input[aria-label="Rename Intro"]')!;
    input.value = "Head";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    button("Rename Intro")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Renamed Intro to Head."));
    expect(document.body.textContent).toContain("Head · bars 1-1");
    expect(document.body.textContent).not.toContain("Intro · bars 1-1");
    expect(writes.at(-1)).toEqual([
      "music.piano-roll.score",
      expect.objectContaining({
        sections: [{ id: "intro", name: "Head", startBeat: 0, endBeat: 4 }],
      }),
    ]);
  });

  test("resizes arrangement sections and persists the score", async () => {
    const writes: Array<[string, unknown]> = [];
    const runtime = {
      transportBpm: 100,
      media: undefined,
      enableAudio: vi.fn(async () => true),
      readLocalState: vi.fn(async () => undefined),
      writeLocalState: vi.fn(async (id: string, value: unknown) => {
        writes.push([id, value]);
      }),
      setPlaybackSource: vi.fn(),
      sound: {
        startPatternLoop: vi.fn(),
        stopPatternLoop: vi.fn(),
      },
    };

    render(Panel, { runtime: runtime as unknown as MusicRuntime });

    button("Add section")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Intro · bars 1-1"));

    const endBar = document.querySelector<HTMLInputElement>('input[aria-label="End bar Intro"]')!;
    endBar.value = "2";
    endBar.dispatchEvent(new Event("input", { bubbles: true }));
    button("Resize Intro")?.click();

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Resized Intro to bars 1-2."),
    );
    expect(document.body.textContent).toContain("Intro · bars 1-2");
    expect(writes.at(-1)).toEqual([
      "music.piano-roll.score",
      expect.objectContaining({
        sections: [{ id: "intro", name: "Intro", startBeat: 0, endBeat: 8 }],
      }),
    ]);
  });

  test("saves the piano-roll score to Song Studio", async () => {
    const savedScores: unknown[] = [];
    const library = {
      saveScore: vi.fn(async (score: unknown) => {
        savedScores.push(score);
        return { id: "song-roll", title: "Piano Roll" };
      }),
    };
    const runtime = {
      transportBpm: 100,
      media: undefined,
      enableAudio: vi.fn(async () => true),
      readLocalState: vi.fn(async () => undefined),
      writeLocalState: vi.fn(async () => undefined),
      setPlaybackSource: vi.fn(),
      sound: {
        startPatternLoop: vi.fn(),
        stopPatternLoop: vi.fn(),
      },
    };

    render(Panel, { runtime: runtime as unknown as MusicRuntime, library });

    button("Add section")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Intro · bars 1-1"));

    button("Save to Song Studio")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Saved to Song Studio."));
    expect(library.saveScore).toHaveBeenCalledTimes(1);
    expect(savedScores[0]).toEqual(
      expect.objectContaining({
        title: "Piano Roll",
        origin: "generated",
        sections: [{ id: "intro", name: "Intro", startBeat: 0, endBeat: 4 }],
      }),
    );
    expect(
      document.querySelector<HTMLAnchorElement>('a[href="/music/songs/song-roll"]')?.textContent,
    ).toContain("Open Song Studio");
  });

  test("resizes a note end by dragging in resize mode", async () => {
    render(Panel);
    expect(button("Resize notes")).not.toBeUndefined();

    button("Resize notes")!.click();
    cell("C4 step 1")?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    cell("C4 step 8")?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));

    await vi.waitFor(() => expect(cell("C4 step 8")).toHaveAttribute("aria-pressed", "true"));
    expect(cell("C4 step 9")).toHaveAttribute("aria-pressed", "false");
  });

  test("adds and removes tracks", async () => {
    render(Panel);

    button("Add track")?.click();
    await vi.waitFor(() => expect(button("Track")).not.toBeUndefined());

    button("Track")?.click();
    button("Remove track")?.click();
    await vi.waitFor(() => expect(button("Track")).toBeUndefined());
    expect(button("Lead")).not.toBeUndefined();
  });

  test("exports the score as a MIDI download", () => {
    const createSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:midi");
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    render(Panel);

    button("Export MIDI")!.click();
    const blob = createSpy.mock.calls.at(-1)?.[0] as Blob;
    expect(blob.type).toBe("audio/midi");
    expect(clickSpy).toHaveBeenCalledTimes(1);

    createSpy.mockRestore();
    revokeSpy.mockRestore();
    clickSpy.mockRestore();
  });

  test("exports the score as a WAV download", async () => {
    const createSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:wav");
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    render(Panel);

    button("Export WAV")!.click();
    await vi.waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
    const blob = createSpy.mock.calls.at(-1)?.[0] as Blob;
    expect(blob.type).toBe("audio/wav");
    expect(blob.size).toBeGreaterThan(44);

    createSpy.mockRestore();
    revokeSpy.mockRestore();
    clickSpy.mockRestore();
  });

  test("registers a loop with the shared transport and plays audible voices", async () => {
    const sources: Array<{ play: () => Promise<void> | void; stop?: () => void }> = [];
    const sound = {
      startPatternLoop: vi.fn(),
      stopPatternLoop: vi.fn(),
    };
    const runtime = {
      transportBpm: 100,
      media: undefined,
      enableAudio: vi.fn(async () => true),
      readLocalState: vi.fn(async () => undefined),
      writeLocalState: vi.fn(async () => undefined),
      setPlaybackSource: vi.fn((source) => {
        if (source) sources.push(source);
      }),
      sound,
    };

    render(Panel, { runtime: runtime as unknown as MusicRuntime });
    await vi.waitFor(() => expect(sources).toHaveLength(1));

    await sources.at(-1)!.play();
    expect(runtime.enableAudio).toHaveBeenCalled();
    const [steps, durationSec] = sound.startPatternLoop.mock.calls[0]!;
    expect(steps.length).toBeGreaterThan(0); // seeded arpeggio
    expect(durationSec).toBeGreaterThan(0);

    sources.at(-1)!.stop?.();
    expect(sound.stopPatternLoop).toHaveBeenCalled();
  });
});
