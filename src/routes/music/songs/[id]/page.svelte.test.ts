import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { monotonicMs, type Score } from "@repo/music-core/domain";
import { ScorePracticeSession } from "@repo/music-core/engines/score-practice";
import type { SongRow } from "@repo/music-core/engines/store";

import { setTestUrl } from "../../_components/test-url";
import { MusicRuntime } from "../../_runtime.svelte";
import Page from "./+page.svelte";

beforeEach(() => {
  vi.spyOn(MusicRuntime.prototype, "beginPerformance").mockResolvedValue({
    status: "started",
    downbeat: monotonicMs(1_000),
  });
});

let overlayStyle: HTMLStyleElement | undefined;

afterEach(() => {
  vi.restoreAllMocks();
  setTestUrl("/");
  overlayStyle?.remove();
  overlayStyle = undefined;
  document.body.replaceChildren();
});

/**
 * Browser tests load no stylesheet, so the notation overlay collapses into the
 * flow and every cursor reports the same rect. These are the three Tailwind
 * rules the overlay's geometry depends on, plus a bounded scroller in place of
 * the `max-h-[min(62dvh,44rem)]` utility.
 */
function scrollableViewport(): HTMLElement {
  overlayStyle = document.createElement("style");
  overlayStyle.textContent =
    ".relative{position:relative}.absolute{position:absolute}.inset-0{inset:0}";
  document.head.append(overlayStyle);
  const viewport = document.querySelector<HTMLElement>('[data-testid="score-viewport"]')!;
  viewport.style.maxHeight = "300px";
  viewport.style.overflowY = "auto";
  return viewport;
}

/** The middle of the playhead, measured from the top of the viewport. */
function playheadCentre(viewport: HTMLElement): number {
  const box = viewport
    .querySelector('[data-notation-cursor="current-group"]')!
    .getBoundingClientRect();
  return box.top + box.height / 2 - viewport.getBoundingClientRect().top;
}

describe("/music/songs/[id]/+page.svelte", () => {
  test("loads a score and completes wait-mode follow-along from shared input", async () => {
    const library = {
      get: vi.fn(async () => songRow()),
    };
    const runtime = new MusicRuntime();
    const recordPractice = vi.spyOn(runtime, "recordPractice").mockResolvedValue();

    render(Page, { songId: "song-1", runtime, library });

    await vi.waitFor(() => expect(document.body.textContent).toContain("Autumn Leaves"));
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Staff notation"] svg')).not.toBeNull(),
    );

    expect(button("Wait")?.getAttribute("aria-pressed")).toBe("true");
    expect(button("Whole score")?.getAttribute("aria-pressed")).toBe("true");

    button("Start practice")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Play C4"));
    await vi.waitFor(() =>
      expect(document.querySelector('[data-notation-cursor="current-group"]')).not.toBeNull(),
    );
    expect(document.querySelector("[data-testid='score-current-notes']")?.textContent).toContain(
      "C4",
    );
    expect(document.querySelector("[data-testid='score-expected-note']")?.textContent).toContain(
      "C4",
    );
    expect(document.querySelector('[aria-label="Piano input"]')).not.toBeNull();

    runtime.router.noteOn(60, "onscreen", "piano");
    runtime.router.noteOn(64, "onscreen", "piano");
    runtime.router.noteOn(67, "onscreen", "piano");

    await vi.waitFor(() => expect(document.body.textContent).toContain("Practice complete"));
    expect(recordPractice).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "song",
        tags: ["song", "song-1", "score-following", "wait", "full"],
      }),
    );
    runtime.dispose();
  });

  test.each([false, true])(
    "offers Waterfall for unsupported staff timing with custom range %s",
    async (customRange) => {
      const song = songRow();
      song.score.notes[0]!.durationBeats = 0.37;
      const original = structuredClone(song.score);
      const runtime = new MusicRuntime();
      render(Page, { songId: "song-1", runtime, library: { get: vi.fn(async () => song) } });
      await vi.waitFor(() =>
        expect(document.body.textContent).toContain("Staff preview unavailable"),
      );
      if (customRange) {
        button("Custom range")?.click();
        await vi.waitFor(() => expect(input("Range start bar")).not.toBeUndefined());
      }
      expect(document.body.textContent).toContain("original timing");
      expect(button("Open Waterfall")).toBeDefined();
      button("Open Waterfall")?.click();
      await vi.waitFor(() =>
        expect(document.querySelector('[aria-label="Waterfall"]')).not.toBeNull(),
      );
      expect(song.score).toEqual(original);
      runtime.dispose();
    },
  );

  test("exports the loaded score as a MIDI download", async () => {
    const library = { get: vi.fn(async () => songRow()) };
    const runtime = new MusicRuntime();
    const createSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:midi");
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    render(Page, { songId: "song-1", runtime, library });
    await vi.waitFor(() => expect(button("Export MIDI")).not.toBeUndefined());
    button("Export MIDI")?.click();

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    createSpy.mockRestore();
    revokeSpy.mockRestore();
    clickSpy.mockRestore();
    runtime.dispose();
  });

  test("switches the canonical score to a guitar tab view", async () => {
    const library = { get: vi.fn(async () => songRow()) };
    const runtime = new MusicRuntime();

    render(Page, { songId: "song-1", runtime, library });

    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Staff notation"] svg')).not.toBeNull(),
    );

    button("Tab")?.click();

    await vi.waitFor(() => {
      // VexFlow tab renders to SVG, with fret numbers as text.
      const svg = document.querySelector('[aria-label="Guitar tab"] svg');
      expect(svg).not.toBeNull();
      expect(svg?.textContent).toMatch(/\d/);
    });
    expect(document.querySelector('[aria-label="Tab tuning"]')).not.toBeNull();
    runtime.dispose();
  });

  test("switches the canonical score to an Aerophone fingering view", async () => {
    const library = { get: vi.fn(async () => songRow()) };
    const runtime = new MusicRuntime();

    render(Page, { songId: "song-1", runtime, library });

    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Staff notation"] svg')).not.toBeNull(),
    );

    button("Fingering")?.click();

    await vi.waitFor(() => {
      const view = document.querySelector('[aria-label="Aerophone fingering"]');
      expect(view).not.toBeNull();
      // one fingering diagram per onset (C4/E4/G4 melody -> 3 notes)
      expect(view?.querySelectorAll("svg").length).toBe(3);
    });
    runtime.dispose();
  });

  test("uses OSMD for stored MusicXML while retaining canonical practice controls", async () => {
    const library = {
      get: vi.fn(async () => ({
        ...songRow(),
        source: { format: "musicxml" as const, content: MUSIC_XML },
        score: { ...score(), origin: "musicxml" as const },
      })),
    };
    const runtime = new MusicRuntime();

    render(Page, { songId: "song-1", runtime, library });

    await vi.waitFor(
      () => expect(document.querySelector('[aria-label="MusicXML score"] svg')).not.toBeNull(),
      { timeout: 5_000 },
    );
    expect(document.querySelector('[aria-label="Staff notation"]')).toBeNull();
    expect(button("Start practice")).not.toBeUndefined();
    const cursor = document.querySelector<HTMLElement>("#cursorImg-0");
    expect(cursor).not.toBeNull();
    await vi.waitFor(() => expect(getComputedStyle(cursor!).display).toBe("block"));

    button("Start practice")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Play C4"));
    await vi.waitFor(() => expect(getComputedStyle(cursor!).display).toBe("block"));
    runtime.dispose();
  });

  test("filters MusicXML rendering and practice targets to selected parts", async () => {
    const library = {
      get: vi.fn(async () => multiPartSongRow()),
    };
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(true);
    const playPattern = vi.spyOn(runtime.sound, "playPattern");

    render(Page, { songId: "song-parts", runtime, library });

    await vi.waitFor(
      () => expect(document.querySelector('[aria-label="MusicXML score"] svg')).not.toBeNull(),
      { timeout: 5_000 },
    );
    const partButtons = document.querySelectorAll<HTMLButtonElement>(
      '[aria-label="Score parts"] button',
    );
    expect([...partButtons].map(({ textContent }) => textContent?.trim())).toEqual([
      "Piano",
      "Bass",
    ]);
    partButtons[0]?.click();
    await vi.waitFor(() => expect(partButtons[0]?.getAttribute("aria-pressed")).toBe("false"));
    partButtons[1]?.click();
    expect(partButtons[1]?.getAttribute("aria-pressed")).toBe("true");

    button("Play preview")?.click();
    await vi.waitFor(() => expect(playPattern).toHaveBeenCalledOnce());
    expect(playPattern.mock.calls[0]?.[0]).toEqual([
      { midiNotes: [40], offsetSeconds: 0, durationSeconds: 2 },
    ]);
    await vi.waitFor(() => expect(button("Pause preview")).not.toBeUndefined());
    button("Pause preview")?.click();
    await vi.waitFor(() => expect(button("Play preview")).not.toBeUndefined());

    button("Start practice")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Play E2"));
    expect(document.body.textContent).not.toContain("Play C4");
    runtime.dispose();
  });

  test("drives the waterfall from the returned preview epoch and reschedules on hand mute", async () => {
    const library = { get: vi.fn(async () => twoHandSongRow()) };
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(true);
    // Two beats of playback have already elapsed when the epoch is reported.
    const playPattern = vi.spyOn(runtime.sound, "playPattern").mockImplementation(() => ({
      clock: "performance",
      startedAt: monotonicMs(performance.now() - 1_000),
    }));

    render(Page, { songId: "song-1", runtime, library });
    await vi.waitFor(() => expect(button("Waterfall")).not.toBeUndefined());
    button("Waterfall")?.click();

    // Staff and waterfall are alternatives, never both.
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Waterfall"]')).not.toBeNull(),
    );
    expect(document.querySelector('[aria-label="Staff notation"]')).toBeNull();
    // Parked at beat 0, the note five beats out is still beyond the lane.
    expect(waterfallNotes()).toEqual(["48", "72"]);

    button("Play preview")?.click();
    await vi.waitFor(() => expect(playPattern).toHaveBeenCalledOnce());
    // At ~beat 2 the later note has come into view: the position is the epoch's.
    await vi.waitFor(() => expect(waterfallNotes()).toEqual(["48", "72", "79"]));

    document.querySelector<HTMLButtonElement>('[data-testid="mute-left"]')?.click();
    await vi.waitFor(() => expect(playPattern).toHaveBeenCalledTimes(2));
    expect(playPattern.mock.calls[1]?.[0]).toEqual([
      { midiNotes: [72], offsetSeconds: 0, durationSeconds: 2 },
      { midiNotes: [79], offsetSeconds: 2.5, durationSeconds: 0.5 },
    ]);
    await vi.waitFor(() =>
      expect(
        document
          .querySelector<HTMLButtonElement>('[data-testid="mute-left"]')
          ?.getAttribute("aria-pressed"),
      ).toBe("true"),
    );
    // The muted hand stays visible to read, marked as muted rather than gone.
    expect(
      document.querySelector<HTMLElement>('[data-testid="waterfall-note"][data-note="48"]')?.dataset
        .muted,
    ).toBe("true");

    // Pausing invalidates the epoch, so the position stops advancing.
    button("Pause preview")?.click();
    await vi.waitFor(() => expect(waterfallNotes()).toEqual(["48", "72"]));
    runtime.dispose();
  });

  test("centres the playhead, not the active section's first bar, under Sections", async () => {
    const library = { get: vi.fn(async () => longSongRow()) };
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "recordPractice").mockResolvedValue();

    render(Page, { songId: "song-long", runtime, library });
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Staff notation"] svg')).not.toBeNull(),
    );

    button("Sections")?.click();
    await vi.waitFor(() => expect(button("A")).not.toBeUndefined());
    button("A")?.click();
    await vi.waitFor(() => expect(button("A")?.getAttribute("aria-pressed")).toBe("true"));

    button("Start practice")?.click();
    const viewport = scrollableViewport();
    await vi.waitFor(() =>
      expect(viewport.querySelector('[data-notation-cursor="current-group"]')).not.toBeNull(),
    );
    // The section is active throughout, so its own line is drawn first in the
    // overlay and spans all eight bars; centring on it would park the viewport
    // on the section's middle, not on the playhead.
    expect(viewport.querySelectorAll("[data-notation-cursor]").length).toBeGreaterThan(1);

    for (let index = 0; index < 28; index += 1) runtime.router.noteOn(60, "onscreen", "piano");

    await vi.waitFor(() => expect(viewport.scrollTop).toBeGreaterThan(0));
    // Centring on the section's own line would park the viewport on the middle
    // of the section, leaving the playhead hundreds of pixels below the frame.
    const centre = playheadCentre(viewport);
    expect(centre).toBeGreaterThanOrEqual(0);
    expect(centre).toBeLessThanOrEqual(viewport.getBoundingClientRect().height);
    runtime.dispose();
  });

  test("clamps a typed bar into the score and writes the applied bar back", async () => {
    const library = { get: vi.fn(async () => longSongRow()) };
    const runtime = new MusicRuntime();

    render(Page, { songId: "song-long", runtime, library });
    await vi.waitFor(() => expect(document.body.textContent).toContain("Autumn Leaves"));
    button("Custom range")?.click();
    await vi.waitFor(() => expect(input("Range end bar")).not.toBeUndefined());

    // Eight bars of 4/4; bar 99 does not exist and must not be left in the box.
    const end = input("Range end bar")!;
    end.value = "99";
    end.dispatchEvent(new Event("change", { bubbles: true }));

    expect(end.value).toBe("8");
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="range-readout"]')?.textContent).toContain(
        "End · bar 8",
      ),
    );

    // An emptied field resyncs rather than reading as bar 0.
    end.value = "";
    end.dispatchEvent(new Event("change", { bubbles: true }));
    expect(end.value).toBe("8");
    runtime.dispose();
  });

  test("selects multiple sections and completes the resolved wait-mode queue", async () => {
    const library = {
      get: vi.fn(async () => songRow()),
    };
    const runtime = new MusicRuntime();
    const recordPractice = vi.spyOn(runtime, "recordPractice").mockResolvedValue();

    render(Page, { songId: "song-1", runtime, library });
    await vi.waitFor(() => expect(document.body.textContent).toContain("Autumn Leaves"));

    button("Sections")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Sequence"));
    button("A")?.click();
    await vi.waitFor(() => expect(button("A")?.getAttribute("aria-pressed")).toBe("true"));
    button("B")?.click();
    await vi.waitFor(() => expect(button("B")?.getAttribute("aria-pressed")).toBe("true"));
    expect(document.body.textContent).toContain("Sequence");
    expect(document.body.textContent).toContain("Per section");

    button("Start practice")?.click();
    for (const midiNote of [60, 64, 67]) {
      runtime.router.noteOn(midiNote, "onscreen", "piano");
    }

    await vi.waitFor(() => expect(document.body.textContent).toContain("Practice complete"));
    expect(recordPractice).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: ["song", "song-1", "score-following", "wait", "sections"],
      }),
    );
    runtime.dispose();
  });

  test("seeds a custom range as bar numbers snapped to measures, with a readout", async () => {
    const library = {
      get: vi.fn(async () => songRow()),
    };
    const runtime = new MusicRuntime();

    render(Page, { songId: "song-1", runtime, library });
    await vi.waitFor(() => expect(document.body.textContent).toContain("Autumn Leaves"));

    button("Custom range")?.click();
    await vi.waitFor(() => expect(input("Range start bar")).not.toBeUndefined());

    expect(input("Range start bar")?.value).toBe("1");
    expect(input("Range end bar")?.value).toBe("1");
    expect(button("Measures")?.getAttribute("aria-pressed")).toBe("true");
    expect(button("Note groups")).not.toBeUndefined();
    const readout = document.querySelector('[data-testid="range-readout"]')?.textContent ?? "";
    expect(readout).toContain("Start · bar 1");
    expect(readout).toContain("End · bar 1");
    expect(readout).toContain("1 bar · 4 beats · ~2 s at 120 BPM");
    runtime.dispose();
  });

  test("marks the two ends of the range on the staff with labelled handles", async () => {
    const library = { get: vi.fn(async () => songRow()) };
    const runtime = new MusicRuntime();

    render(Page, { songId: "song-1", runtime, library });
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Staff notation"] svg')).not.toBeNull(),
    );
    button("Custom range")?.click();

    await vi.waitFor(() =>
      expect(document.querySelector('[data-range-handle="start"]')).not.toBeNull(),
    );
    expect(
      document.querySelector('[data-range-handle="start"]')?.getAttribute("aria-label"),
    ).toContain("bar 1");
    expect(document.querySelector('[data-range-handle="end"]')?.textContent?.trim()).toBe("End");
    runtime.dispose();
  });

  test("counts tab notes below the lowest string and can lift the view an octave", async () => {
    const library = { get: vi.fn(async () => bassSongRow()) };
    const runtime = new MusicRuntime();

    render(Page, { songId: "song-1", runtime, library });
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Staff notation"] svg')).not.toBeNull(),
    );

    button("Tab")?.click();
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("2 notes are below the lowest string"),
    );
    // Tab never falls through to the staff while Tab is pressed.
    expect(document.querySelector('[aria-label="Staff notation"]')).toBeNull();

    button("Show the tab an octave up")?.click();
    await vi.waitFor(() =>
      expect(document.body.textContent).not.toContain("below the lowest string"),
    );
    expect(document.body.textContent).toContain("Tab is shown an octave up");
    runtime.dispose();
  });

  test("names notes above the highest fret for what they are and offers no octave up", async () => {
    const library = { get: vi.fn(async () => highSongRow()) };
    const runtime = new MusicRuntime();

    render(Page, { songId: "song-1", runtime, library });
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Staff notation"] svg')).not.toBeNull(),
    );

    button("Tab")?.click();
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("2 notes are above the highest fret"),
    );
    expect(document.body.textContent).not.toContain("below the lowest string");
    // Transposing up would only push them further off the neck.
    expect(button("Show the tab an octave up")).toBeUndefined();
    runtime.dispose();
  });

  test("keeps the follower cursor inside the score viewport on a long score", async () => {
    const library = { get: vi.fn(async () => longSongRow()) };
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "recordPractice").mockResolvedValue();

    render(Page, { songId: "song-long", runtime, library });
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Staff notation"] svg')).not.toBeNull(),
    );

    button("Start practice")?.click();
    await vi.waitFor(() =>
      expect(
        document.querySelector('[data-testid="score-viewport"] [data-notation-cursor]'),
      ).not.toBeNull(),
    );

    const viewport = scrollableViewport();

    for (let index = 0; index < 20; index += 1) runtime.router.noteOn(60, "onscreen", "piano");

    await vi.waitFor(() => expect(viewport.scrollTop).toBeGreaterThan(0));
    const centre = playheadCentre(viewport);
    expect(centre).toBeGreaterThanOrEqual(0);
    expect(centre).toBeLessThanOrEqual(viewport.getBoundingClientRect().height);
    runtime.dispose();
  });

  test("runs two timed performance takes and logs one structured practice capture", async () => {
    const library = {
      get: vi.fn(async () => songRow()),
    };
    const runtime = new MusicRuntime();
    const register = vi.spyOn(runtime, "registerPracticeContext");
    const beginPerformance = vi.spyOn(runtime, "beginPerformance").mockResolvedValue({
      status: "started",
      downbeat: monotonicMs(performance.now()),
    });
    const endPerformance = vi.spyOn(runtime, "endPerformance");
    const recordPractice = vi.spyOn(runtime, "recordPractice").mockResolvedValue();

    render(Page, { songId: "song-1", runtime, library });
    await vi.waitFor(() => expect(document.body.textContent).toContain("Autumn Leaves"));

    button("Performance")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("floating controls"));
    runtime.setPracticeVariantBpm(240, "v1:song:song-1:full:performance");
    runtime.setCountIn(0);
    await vi.waitFor(() => expect(button("2 takes")).not.toBeUndefined());
    button("2 takes")?.click();
    await vi.waitFor(() => expect(button("2 takes")?.getAttribute("aria-pressed")).toBe("true"));

    button("Start practice")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Practice complete"), {
      timeout: 5_000,
    });
    expect(beginPerformance).toHaveBeenCalledTimes(2);
    expect(endPerformance).toHaveBeenCalled();
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ variantKey: "v1:song:song-1:full:performance" }),
    );
    expect(recordPractice).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "song",
        tags: ["song", "song-1", "score-following", "performance", "full"],
        runs: expect.arrayContaining([
          expect.objectContaining({ exerciseId: "song.score-practice" }),
          expect.objectContaining({ exerciseId: "song.score-practice" }),
        ]),
      }),
    );
    expect(recordPractice.mock.calls[0]?.[0].runs).toHaveLength(2);
    runtime.dispose();
  }, 10_000);

  test.each([
    { numerator: 6, denominator: 8, halfDurationMs: 2_000, endDelayMs: 4_226 },
    { numerator: 2, denominator: 2, halfDurationMs: 500, endDelayMs: 1_057 },
    { numerator: 4, denominator: 4, halfDurationMs: 1_000, endDelayMs: 2_113 },
  ])(
    "converts $numerator/$denominator public BPM at the score-engine boundary",
    async ({ numerator, denominator, halfDurationMs, endDelayMs }) => {
      setTestUrl("/music/songs/song-1");
      const library = { get: vi.fn(async () => songRow({ numerator, denominator })) };
      const runtime = new MusicRuntime();
      let downbeat = 0;
      vi.spyOn(runtime, "beginPerformance").mockImplementation(async () => {
        downbeat = performance.now();
        return { status: "started", downbeat: monotonicMs(downbeat) };
      });
      const startExecution = vi.spyOn(ScorePracticeSession.prototype, "startExecution");

      render(Page, { songId: "song-1", runtime, library });
      await vi.waitFor(() => expect(document.body.textContent).toContain("Autumn Leaves"));
      button("Performance")?.click();
      await vi.waitFor(() => expect(button("Start practice")).not.toBeUndefined());
      runtime.setCountIn(0);
      const setTimeoutSpy = vi.spyOn(window, "setTimeout");

      button("Start practice")?.click();

      await vi.waitFor(() =>
        expect(startExecution.mock.calls.some(([value]) => Number(value) === downbeat)).toBe(true),
      );
      const callIndex = startExecution.mock.calls.findLastIndex(
        ([value]) => Number(value) === downbeat,
      );
      const practice = startExecution.mock.contexts[callIndex] as ScorePracticeSession;
      expect(practice.tick(monotonicMs(downbeat + halfDurationMs)).live?.progress).toBeCloseTo(0.5);
      expect(
        setTimeoutSpy.mock.calls.some(([, delay]) => Math.abs(Number(delay) - endDelayMs) < 150),
      ).toBe(true);
      runtime.dispose();
    },
  );
});

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

function waterfallNotes(): string[] {
  return [...document.querySelectorAll<HTMLElement>('[data-testid="waterfall-note"]')]
    .map((element) => element.dataset.note ?? "")
    .sort();
}

function twoHandSongRow(): SongRow {
  return {
    ...songRow(),
    score: {
      ...score(),
      voices: [
        { id: "melody", name: "Melody", role: "melody" },
        { id: "bass", name: "Bass", role: "bass" },
      ],
      notes: [
        { midiNote: 72, startBeat: 0, durationBeats: 4, velocity: 0.8, voiceId: "melody" },
        { midiNote: 48, startBeat: 0, durationBeats: 4, velocity: 0.8, voiceId: "bass" },
        { midiNote: 79, startBeat: 5, durationBeats: 1, velocity: 0.8, voiceId: "melody" },
      ],
    },
  };
}

function bassSongRow(): SongRow {
  return {
    ...songRow(),
    score: {
      ...score(),
      voices: [{ id: "voice-1", name: "Bass", role: "bass" }],
      // E1 and A1 sit below the low E string of a standard guitar; E2 does not.
      notes: [
        { midiNote: 28, startBeat: 0, durationBeats: 1, velocity: 0.8, voiceId: "voice-1" },
        { midiNote: 33, startBeat: 1, durationBeats: 1, velocity: 0.8, voiceId: "voice-1" },
        { midiNote: 40, startBeat: 2, durationBeats: 2, velocity: 0.8, voiceId: "voice-1" },
      ],
    },
  };
}

function highSongRow(): SongRow {
  return {
    ...songRow(),
    score: {
      ...score(),
      // The top string is E4 with 22 frets, so 87 and above is off the neck.
      notes: [
        { midiNote: 88, startBeat: 0, durationBeats: 1, velocity: 0.8, voiceId: "voice-1" },
        { midiNote: 90, startBeat: 1, durationBeats: 1, velocity: 0.8, voiceId: "voice-1" },
        { midiNote: 64, startBeat: 2, durationBeats: 2, velocity: 0.8, voiceId: "voice-1" },
      ],
    },
  };
}

function longSongRow(): SongRow {
  return {
    ...songRow(),
    id: "song-long",
    score: {
      ...score(),
      id: "song-long",
      notes: Array.from({ length: 32 }, (_, index) => ({
        midiNote: 60,
        startBeat: index,
        durationBeats: 1,
        velocity: 0.8,
        voiceId: "voice-1",
      })),
      sections: [{ id: "a", name: "A", startBeat: 0, endBeat: 32 }],
    },
  };
}

function input(label: string): HTMLInputElement | undefined {
  return document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`) ?? undefined;
}

function songRow(timeSignature = { numerator: 4, denominator: 4 }): SongRow {
  return {
    id: "song-1",
    title: "Autumn Leaves",
    createdAt: 1_000,
    updatedAt: 2_000,
    score: { ...score(), timeSignatures: [{ atBeat: 0, ...timeSignature }] },
  };
}

function score(): Score {
  return {
    id: "song-1",
    title: "Autumn Leaves",
    origin: "midi",
    keySignature: "C major",
    tempoMap: [{ atBeat: 0, bpm: 120 }],
    timeSignatures: [{ atBeat: 0, numerator: 4, denominator: 4 }],
    voices: [{ id: "voice-1", name: "Melody", role: "melody" }],
    notes: [
      { midiNote: 60, startBeat: 0, durationBeats: 1, velocity: 0.8, voiceId: "voice-1" },
      { midiNote: 64, startBeat: 1, durationBeats: 1, velocity: 0.8, voiceId: "voice-1" },
      { midiNote: 67, startBeat: 2, durationBeats: 2, velocity: 0.8, voiceId: "voice-1" },
    ],
    chords: [],
    sections: [
      { id: "a", name: "A", startBeat: 0, endBeat: 2 },
      { id: "b", name: "B", startBeat: 2, endBeat: 4 },
    ],
    markers: [],
  };
}

function multiPartSongRow(): SongRow {
  return {
    id: "song-parts",
    title: "Two Parts",
    createdAt: 1_000,
    updatedAt: 2_000,
    source: { format: "musicxml", content: MULTI_PART_MUSIC_XML },
    score: {
      ...score(),
      id: "song-parts",
      title: "Two Parts",
      origin: "musicxml",
      voices: [
        { id: "P1:voice:1", name: "Piano · Voice 1", role: "other" },
        { id: "P2:voice:1", name: "Bass · Voice 1", role: "bass" },
      ],
      notes: [
        {
          midiNote: 60,
          startBeat: 0,
          durationBeats: 4,
          velocity: 0.8,
          voiceId: "P1:voice:1",
        },
        {
          midiNote: 40,
          startBeat: 0,
          durationBeats: 4,
          velocity: 0.8,
          voiceId: "P2:voice:1",
        },
      ],
      sections: [{ id: "full", name: "Full song", startBeat: 0, endBeat: 4 }],
    },
  };
}

const MUSIC_XML = `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes>
      <divisions>1</divisions>
      <time><beats>4</beats><beat-type>4</beat-type></time>
      <clef><sign>G</sign><line>2</line></clef>
    </attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
    <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
    <note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><type>half</type></note>
  </measure></part>
</score-partwise>`;

const MULTI_PART_MUSIC_XML = `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
    <score-part id="P2"><part-name>Bass</part-name></score-part>
  </part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type><voice>1</voice></note>
  </measure></part>
  <part id="P2"><measure number="1">
    <attributes>
      <divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time>
      <clef><sign>F</sign><line>4</line></clef>
    </attributes>
    <note><pitch><step>E</step><octave>2</octave></pitch><duration>4</duration><type>whole</type><voice>1</voice></note>
  </measure></part>
</score-partwise>`;
