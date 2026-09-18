import { midiToNote } from "@repo/music-core/engines/theory";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import {
  GUITAR_BOX_ONE_LICK,
  LICK_PHRASES,
  lickMidiNotes,
  lickTimeline,
} from "@repo/music-core/engines/jazz";
import { monotonicMs, type InstrumentId } from "@repo/music-core/domain";
import { SkillGraphStore } from "@repo/music-core/engines/skills";

import Page from "./+page.svelte";

/** Lick 1's pitched notes; the jazz phrases carry no rests. */
const LICK_1 = lickMidiNotes(LICK_PHRASES[1]!);
import { setTestUrl } from "../../_components/test-url";
import { MusicRuntime } from "../../_runtime.svelte";

beforeEach(() => {
  vi.spyOn(MusicRuntime.prototype, "ensurePlaybackVoice").mockResolvedValue(true);
  vi.spyOn(MusicRuntime.prototype, "beginPerformance").mockResolvedValue({
    status: "started",
    downbeat: monotonicMs(1_000),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  setTestUrl("/");
});

describe("/music/play/licks/+page.svelte", () => {
  test("previews only the selected range at normal and half speed, then returns to the full line", async () => {
    setTestUrl("/music/play/licks?from=5&to=8");
    const harness = makeRuntime();
    render(Page, { runtime: harness.runtime as unknown as MusicRuntime });
    button("Hear chunk")?.click();
    await vi.waitFor(() => expect(harness.runtime.sound.playPattern).toHaveBeenCalledOnce());
    const normal = harness.runtime.sound.playPattern.mock.calls[0]![0];
    expect(normal.map((note) => note.midiNotes[0])).toEqual(LICK_1.slice(4, 8));
    button("Hear at half speed")?.click();
    await vi.waitFor(() => expect(harness.runtime.sound.playPattern).toHaveBeenCalledTimes(2));
    const slow = harness.runtime.sound.playPattern.mock.calls[1]![0];
    expect(slow[1].offsetSeconds).toBe(normal[1].offsetSeconds * 2);
    expect(slow[0].durationSeconds).toBe(normal[0].durationSeconds * 2);
    await openSetup();
    button("Full line")?.click();
    await vi.waitFor(() =>
      expect(new URLSearchParams(window.location.search).has("from")).toBe(false),
    );
    expect(button("Hear it")).not.toBeUndefined();
  });

  test("suggests the missed chunk and records its range without awarding full-line evidence", async () => {
    const harness = makeRuntime();
    render(Page, { runtime: harness.runtime as unknown as MusicRuntime });
    button("Start")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    LICK_1.forEach((midi, index) => harness.emit(index === 5 ? midi + 1 : midi, index * 100));
    await vi.waitFor(() => expect(button("Practise notes 5–8")).not.toBeUndefined());
    button("Practise notes 5–8")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    LICK_1.slice(4, 8).forEach((midi, index) => harness.emit(midi, index * 100));
    await vi.waitFor(() => expect(harness.runtime.recordPractice).toHaveBeenCalledTimes(2));
    const chunk = harness.runtime.recordPractice.mock.calls[1]![0];
    expect(chunk.scoringEvents[0].skillIds).toEqual(["harmony.ii-v-i"]);
    expect(chunk.comparison.settings).toBe(JSON.stringify({ start: 5, end: 8 }));
    expect(chunk.note).toContain("Notes 5–8");
    expect(document.body.textContent).toContain("performed timing is not assessed");
    harness.runtime.setPracticeVariantBpm(270);
    await Promise.resolve();
    expect(button("Try 280 BPM")).toBeUndefined();
    expect(button("Try 160 BPM")).not.toBeUndefined();
    button("Try 160 BPM")?.click();
    await vi.waitFor(() =>
      expect(harness.runtime.setPracticeVariantBpm).toHaveBeenCalledWith(
        160,
        "v1:licks:piano:1:playback",
      ),
    );
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
  });

  test.each([false, true])(
    "loops clean responses at most three times; mistake=%s",
    async (mistake) => {
      setTestUrl("/music/play/licks?from=1&to=2&mode=check");
      const harness = makeRuntime();
      render(Page, { runtime: harness.runtime as unknown as MusicRuntime });
      expect(document.querySelector('[data-highlight="target"]')).toBeNull();
      button("Loop chunk 3 times")?.click();
      for (let turn = 1; turn <= (mistake ? 1 : 3); turn++) {
        await vi.waitFor(() =>
          expect(document.body.textContent).toContain(`Loop response ${turn} of 3`),
        );
        LICK_1.slice(0, 2).forEach((midi, index) =>
          harness.emit(midi + (mistake ? 1 : 0), index * 100),
        );
        await vi.waitFor(() => expect(harness.runtime.recordPractice).toHaveBeenCalledTimes(turn));
      }
      await vi.waitFor(() => expect(button("Stop loop")).toBeUndefined());
      expect(button("Change setup")).not.toBeUndefined();
      expect(harness.runtime.beginPerformance).toHaveBeenCalledTimes(mistake ? 1 : 3);
    },
  );

  test("stopping a loop while saving preserves captured range and cannot restart it", async () => {
    setTestUrl("/music/play/licks?from=5&to=6");
    let release!: () => void;
    vi.spyOn(SkillGraphStore.prototype, "ingest").mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const harness = makeRuntime();
    render(Page, { runtime: harness.runtime as unknown as MusicRuntime });
    button("Loop chunk 3 times")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    LICK_1.slice(4, 6).forEach((midi, index) => harness.emit(midi, index * 100));
    await vi.waitFor(() => expect(release).toBeDefined());
    button("Stop loop")?.click();
    await openSetup();
    button("Full line")?.click();
    release();
    await vi.waitFor(() => expect(harness.runtime.recordPractice).toHaveBeenCalledOnce());
    const entry = harness.runtime.recordPractice.mock.calls[0]![0];
    expect(entry.tags).toContain("chunk");
    expect(entry.note).toContain("Notes 5–6");
    expect(harness.runtime.beginPerformance).toHaveBeenCalledOnce();
    expect(button("Start")).not.toBeUndefined();
  });

  test("a failed save stops automatic repetition and reports the failure", async () => {
    setTestUrl("/music/play/licks?from=1&to=2");
    const harness = makeRuntime();
    harness.runtime.recordPractice.mockRejectedValueOnce(new Error("storage unavailable"));
    render(Page, { runtime: harness.runtime as unknown as MusicRuntime });
    button("Loop chunk 3 times")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    LICK_1.slice(0, 2).forEach((midi, index) => harness.emit(midi, index * 100));
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Could not save this result"),
    );
    expect(button("Stop loop")).toBeUndefined();
    expect(harness.runtime.beginPerformance).toHaveBeenCalledOnce();
  });

  test("Check mode hides target cues before the answer", async () => {
    setTestUrl("/music/play/licks?mode=check");
    const runtime = new MusicRuntime();
    render(Page, { runtime });
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    expect(document.querySelector('[data-highlight="target"]')).toBeNull();
    button("Start")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    expect(document.querySelector('[data-highlight="target"]')).toBeNull();
    expect(document.body.textContent).not.toContain(
      LICK_1.map((midi) => midiToNote(midi, true)).join("  "),
    );
    expect(button("Hear it")).toBeUndefined();
    runtime.dispose();
  });

  test("keeps duplicate starts single-flight and cancels a late activation on teardown", async () => {
    const runtime = new MusicRuntime();
    let resolveVoice!: (enabled: boolean) => void;
    const ensurePlaybackVoice = vi.spyOn(runtime, "ensurePlaybackVoice").mockReturnValue(
      new Promise((resolve) => {
        resolveVoice = resolve;
      }),
    );
    const beginPerformance = vi.spyOn(runtime, "beginPerformance");
    const subscribe = vi.spyOn(runtime.router, "subscribe");
    const view = render(Page, { runtime });
    // The piano surface subscribes on mount to light held notes; the page's
    // own session subscription is what must not happen here.
    const mountedSubscriptions = subscribe.mock.calls.length;

    button("Start")?.click();
    button("Start")?.click();
    await vi.waitFor(() => expect(ensurePlaybackVoice).toHaveBeenCalledOnce());
    view.unmount();
    resolveVoice(true);
    await Promise.resolve();

    expect(beginPerformance).not.toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalledTimes(mountedSubscriptions);
  });

  test("replaces previews and cancels delayed preview work on attempt start and teardown", async () => {
    const runtime = new MusicRuntime();
    let resolveFirst!: (enabled: boolean) => void;
    const ensureVoice = vi
      .spyOn(runtime, "ensurePlaybackVoice")
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValue(true);
    const playPattern = vi.spyOn(runtime.sound, "playPattern");
    const stopPattern = vi.spyOn(runtime.sound, "stopPattern");
    const view = render(Page, { runtime });

    button("Hear it")?.click();
    button("Hear it")?.click();
    await vi.waitFor(() => expect(playPattern).toHaveBeenCalledOnce());
    resolveFirst(true);
    await Promise.resolve();
    expect(playPattern).toHaveBeenCalledOnce();

    const stopsBeforeAttempt = stopPattern.mock.calls.length;
    button("Start")?.click();
    await vi.waitFor(() => expect(runtime.beginPerformance).toHaveBeenCalledOnce());
    expect(stopPattern.mock.calls.length).toBeGreaterThan(stopsBeforeAttempt);

    let resolveNavigation!: (enabled: boolean) => void;
    ensureVoice.mockImplementationOnce(
      () => new Promise((resolve) => (resolveNavigation = resolve)),
    );
    button("Hear it")?.click();
    const stopsBeforeUnmount = stopPattern.mock.calls.length;
    view.unmount();
    resolveNavigation(true);
    await Promise.resolve();
    expect(playPattern).toHaveBeenCalledOnce();
    expect(stopPattern.mock.calls.length).toBeGreaterThan(stopsBeforeUnmount);
  });

  test("keeps the attempt stopped when playback voice activation fails", async () => {
    const runtime = new MusicRuntime();
    runtime.audioMessage = "Preferred voice unavailable.";
    vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(false);
    render(Page, { runtime });

    button("Start")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain(runtime.audioMessage));
    expect(runtime.beginPerformance).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Play the lick.");
  });

  test("renders the licks drill with category + lick selectors and play controls", async () => {
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(true);
    const register = vi.spyOn(runtime, "registerPracticeContext");
    render(Page, { runtime });

    expect(document.querySelector("h1")?.textContent).toContain("Jazz Licks Drill");

    await openSetup();
    const categories = [...document.querySelectorAll('[aria-label="Lick category"] button')].map(
      (button) => button.textContent?.trim(),
    );
    expect(categories).toEqual([
      "Major ii-V-I",
      "ii-V-I-VI",
      "Minor ii-V-i",
      "Minor chord",
      "Guitar pentatonic",
    ]);

    // The lick picker exposes a button per lick in the active category.
    const lickButtons = document.querySelectorAll('[aria-label="Pick a lick"] button');
    expect(lickButtons.length).toBeGreaterThan(0);

    const actions = [...document.querySelectorAll("button")].map((b) => b.textContent?.trim());
    expect(actions).toContain("Hear it");
    expect(actions).toContain("Start");

    button("Hear it")?.click();
    await vi.waitFor(() => expect(runtime.ensurePlaybackVoice).toHaveBeenCalledOnce());
    expect(runtime.beginPerformance).not.toHaveBeenCalled();
    button("Start")?.click();
    await vi.waitFor(() => expect(runtime.beginPerformance).toHaveBeenCalledOnce());
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ variantKey: "v1:licks:piano:1:playback" }),
    );
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
    setTestUrl("/music/play/licks?category=minor-chord&lick=26");

    render(Page);

    await vi.waitFor(() => expect(document.body.textContent).toContain("Lick #26"));
    await openSetup();
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

  test.each(["practice", "check"])(
    "records a completed %s lick with scoring events and run metadata",
    async (mode) => {
      setTestUrl(`/music/play/licks?mode=${mode}`);
      const harness = makeRuntime();
      render(Page, { props: { runtime: harness.runtime as unknown as MusicRuntime } });

      button("Start")?.click();
      await vi.waitFor(() => expect(document.body.textContent).toContain("Play the lick"));
      const expected = LICK_1;
      for (const [index, midi] of expected.entries()) {
        harness.emit(midi, index * 100, index === 0 ? "midi" : "onscreen");
      }

      await vi.waitFor(() => expect(harness.runtime.recordPractice).toHaveBeenCalledOnce());
      const entry = harness.runtime.recordPractice.mock.calls[0]![0];
      expect(entry.tags).toEqual(["jazz", "licks"]);
      expect(entry.scoringEvents).toHaveLength(1);
      expect(entry.runs).toHaveLength(1);
      expect(entry.scoringEvents[0]).toMatchObject({
        exerciseId: "jazz.lick.playback",
        skillIds: ["harmony.ii-v-i", "harmony.ii-v-i.licks.major-ii-V-I"],
        partialCredit: 1,
        assistance: mode === "check" ? "independent" : "guided",
        source: "mixed",
        instrument: "piano",
      });
      expect(entry.runs[0]).toMatchObject({
        exerciseId: "jazz.lick.playback",
        targetSkillIds: ["harmony.ii-v-i", "harmony.ii-v-i.licks.major-ii-V-I"],
      });
    },
  );

  test("hides setup during the play stage and moves run controls into the stage", async () => {
    const runtime = new MusicRuntime();
    render(Page, { runtime });

    // Setup phase exposes the lick picker on the ready stage and the category
    // control behind Edit setup.
    await openSetup();
    expect(document.querySelector('[aria-label="Lick category"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Pick a lick"]')).not.toBeNull();

    button("Start")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Play the lick"));

    // Setup is hidden while playing; the lick picker and category selector are gone.
    expect(document.querySelector('[aria-label="Lick category"]')).toBeNull();
    expect(document.querySelector('[aria-label="Pick a lick"]')).toBeNull();
    // Run controls live on the stage now that setup is hidden.
    expect(button("Stop")).not.toBeUndefined();
    expect(button("Hear it")).not.toBeUndefined();

    button("Stop")?.click();
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(
        document.querySelector('[data-testid="licks-setup-heading"]'),
      ),
    );
  });

  test("returns to setup from the graded summary via Change setup", async () => {
    const harness = makeRuntime();
    render(Page, { props: { runtime: harness.runtime as unknown as MusicRuntime } });

    button("Start")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Play the lick"));
    const expected = LICK_1;
    for (const [index, midi] of expected.entries()) harness.emit(midi, index * 100);

    await vi.waitFor(() => expect(button("Change setup")).not.toBeUndefined());
    button("Change setup")?.click();

    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Pick a lick"]')).not.toBeNull(),
    );
    expect(button("Change setup")).toBeUndefined();
    expect(document.activeElement).toBe(
      document.querySelector('[data-testid="licks-setup-heading"]'),
    );
  });

  test("uses the shared retry bar after a graded lick", async () => {
    const harness = makeRuntime();
    render(Page, { props: { runtime: harness.runtime as unknown as MusicRuntime } });

    button("Start")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Play the lick"));
    const expected = LICK_1;
    for (const [index, midi] of expected.entries()) harness.emit(midi, index * 100);

    await vi.waitFor(() => expect(button("Again")).not.toBeUndefined());
    button("Again")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Play the lick"));
    expect(button("Again")).toBeUndefined();
  });

  test("keeps a retry authoritative when the prior completion settles late", async () => {
    let releaseIngest!: () => void;
    const ingest = vi.spyOn(SkillGraphStore.prototype, "ingest").mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseIngest = resolve;
        }),
    );
    const harness = makeRuntime();
    render(Page, { props: { runtime: harness.runtime as unknown as MusicRuntime } });

    button("Start")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Play the lick"));
    const expected = LICK_1;
    for (const [index, midi] of expected.entries()) harness.emit(midi, index * 100);

    await vi.waitFor(() => expect(ingest).toHaveBeenCalledOnce());
    button("Again")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    button("Stop")?.click();
    harness.changeInstrument("guitar");

    releaseIngest();
    await vi.waitFor(() => expect(harness.runtime.recordPractice).toHaveBeenCalledOnce());
    const entry = harness.runtime.recordPractice.mock.calls[0]![0];
    expect(entry.instrument).toBe("piano");
    expect(entry.runs[0]?.instrument).toBe(entry.instrument);
    expect(entry.scoringEvents[0]?.runId).toBe(entry.runs[0]?.id);
    expect(document.body.textContent).toContain("Play the lick.");
    expect(document.body.textContent).not.toContain("notes · 100% · +");
  });
});

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

describe("guitar licks with fretted positions", () => {
  test("shows the fret window with the lick's targets, and an empty window in check mode", async () => {
    setTestUrl(`/music/play/licks?category=guitar-pentatonic&lick=${GUITAR_BOX_ONE_LICK}`);
    const harness = makeRuntime();
    render(Page, { runtime: harness.runtime as unknown as MusicRuntime });

    // G3 sits in frets 12 to 15, so the window is frets 11 to 16.
    const strip = document.querySelector('[data-testid="fret-window-strip"] [role="img"]');
    expect(strip?.getAttribute("aria-label")).toBe("Frets 11 to 16 of 22");
    const lit = () =>
      [...document.querySelectorAll('[aria-label*="target"]')].map((node) =>
        node.getAttribute("aria-label"),
      );
    expect(lit()).toContain("String 4 fret 14, E4, target");
    expect(lit()).toContain("String 2 fret 15, D5, target");
    // B4 is authored at string 2 fret 12; the same pitch at string 3 fret 16 is
    // inside the window and must stay dark, or the page would point at a dot
    // that gradeLickPositions then marks wrong.
    expect(lit()).toContain("String 2 fret 12, B4, target");
    expect(lit()).not.toContain("String 3 fret 16, B4, target");
    // Six authored string/fret pairs across strings 2 to 4.
    expect(lit()).toHaveLength(6);

    await openSetup();
    button("Check")?.click();
    await vi.waitFor(() => expect(lit()).toEqual([]));
    expect(document.querySelector('[data-testid="fret-window-strip"] [role="img"]')).not.toBeNull();
  });

  test("counts notes, not events, so the rest can never be a chunk of its own", async () => {
    // G3 is 14 events: 13 notes and one rest.
    setTestUrl(
      `/music/play/licks?category=guitar-pentatonic&lick=${GUITAR_BOX_ONE_LICK}&from=13&to=14`,
    );
    const harness = makeRuntime();
    render(Page, { runtime: harness.runtime as unknown as MusicRuntime });

    await vi.waitFor(() => expect(document.body.textContent).toContain("of 13"));
    // Clamped to the notes that exist; the totals the HUD and the picker show agree.
    expect(document.body.textContent).toContain("Notes 13–13 of 13");
    expect(document.body.textContent).not.toContain("of 14");

    button("Start")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    expect(document.body.textContent).toContain("0 / 1");
  });

  test("grades timing from the follower and says the position is not verified", async () => {
    setTestUrl(`/music/play/licks?category=guitar-pentatonic&lick=${GUITAR_BOX_ONE_LICK}`);
    const harness = makeRuntime();
    render(Page, { runtime: harness.runtime as unknown as MusicRuntime });
    button("Start")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());

    // Dead on the grid at the harness tempo (150 BPM, 400 ms a beat).
    for (const note of lickTimeline(LICK_PHRASES[GUITAR_BOX_ONE_LICK]!)) {
      harness.emit(note.midi, note.offsetBeats * 400);
    }

    await vi.waitFor(() => expect(harness.runtime.recordPractice).toHaveBeenCalledOnce());
    const record = harness.runtime.recordPractice.mock.calls[0]![0];
    expect(record.note).toContain("13/13 notes on time");
    // Pitch arrived without a string or fret, so the box itself is unproven.
    expect(record.note).toContain("position not verified");
    expect(document.body.textContent).toContain("On time");
    expect(document.body.textContent).not.toContain("performed timing is not assessed");
  });
});

function makeRuntime() {
  type HarnessListener = (event: {
    type: "noteOn";
    midiNote: number;
    velocity: number;
    timestamp: number;
    source: "midi" | "onscreen";
  }) => void;
  // Every subscriber hears the event: the page's session and any PianoSurface
  // that lights held notes from the router.
  const listeners = new Set<HarnessListener>();
  let onInstrumentChange: ((instrument: InstrumentId) => void) | undefined;
  let onBpmChange: ((bpm: number) => void) | undefined;
  const runtime = {
    setPracticeVariantBpm: vi.fn((bpm: number) => onBpmChange?.(bpm)),
    activeSource: "onscreen",
    activeInstrument: "piano",
    audioEnabled: false,
    audioMessage: "",
    dailyRoutine: undefined,
    enableAudio: vi.fn(async () => true),
    ensurePlaybackVoice: vi.fn(async () => true),
    sound: { playNote: vi.fn(), playPattern: vi.fn(), stopPattern: vi.fn() },
    router: {
      subscribe: vi.fn((next: HarnessListener) => {
        listeners.add(next);
        return vi.fn(() => listeners.delete(next));
      }),
      push: vi.fn(() => true),
    },
    recordPractice: vi.fn(async () => undefined),
    setActiveInstrument: vi.fn(),
    registerPracticeContext: vi.fn(
      async (context: Parameters<MusicRuntime["registerPracticeContext"]>[0]) => {
        onInstrumentChange = context.onInstrumentChange;
        onBpmChange = context.onBpmChange;
        context.onBpmChange?.(150);
        return vi.fn();
      },
    ),
    beginPerformance: vi.fn(async () => ({ status: "started", downbeat: monotonicMs(1_000) })),
    endPerformance: vi.fn(),
  };

  return {
    runtime,
    emit(midiNote: number, timestamp: number, source: "midi" | "onscreen" = "onscreen") {
      for (const listener of Array.from(listeners)) {
        listener({ type: "noteOn", midiNote, velocity: 1, timestamp, source });
      }
    },
    changeInstrument(instrument: InstrumentId) {
      onInstrumentChange?.(instrument);
    },
  };
}

/** Setup is collapsed behind its summary line; open it before touching the category control. */
async function openSetup(): Promise<void> {
  if (button("Hide setup")) return;
  await vi.waitFor(() => expect(button("Edit setup")).not.toBeUndefined());
  button("Edit setup")?.click();
  await vi.waitFor(() =>
    expect(document.querySelector('[aria-label="Lick category"]')).not.toBeNull(),
  );
}
