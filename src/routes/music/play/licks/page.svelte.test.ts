import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { LICK_PHRASES } from "@repo/music-core/engines/jazz";
import { monotonicMs, type InstrumentId } from "@repo/music-core/domain";
import { SkillGraphStore } from "@repo/music-core/engines/skills";

import Page from "./+page.svelte";
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

    button("Play it back")?.click();
    button("Play it back")?.click();
    await vi.waitFor(() => expect(ensurePlaybackVoice).toHaveBeenCalledOnce());
    view.unmount();
    resolveVoice(true);
    await Promise.resolve();

    expect(beginPerformance).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
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
    button("Play it back")?.click();
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

    button("Play it back")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain(runtime.audioMessage));
    expect(runtime.beginPerformance).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Play the lick…");
  });

  test("renders the licks drill with category + lick selectors and play controls", async () => {
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(true);
    const register = vi.spyOn(runtime, "registerPracticeContext");
    render(Page, { runtime });

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

    button("Hear it")?.click();
    await vi.waitFor(() => expect(runtime.ensurePlaybackVoice).toHaveBeenCalledOnce());
    expect(runtime.beginPerformance).not.toHaveBeenCalled();
    button("Play it back")?.click();
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
    await vi.waitFor(() => expect(document.body.textContent).toContain("Play the lick"));
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

  test("hides setup during the play stage and moves run controls into the stage", async () => {
    const runtime = new MusicRuntime();
    render(Page, { runtime });

    // Setup phase exposes the config surface.
    expect(document.querySelector('[aria-label="Lick category"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Pick a lick"]')).not.toBeNull();

    button("Play it back")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Play the lick"));

    // Setup is hidden while playing; the lick picker and category selector are gone.
    expect(document.querySelector('[aria-label="Lick category"]')).toBeNull();
    expect(document.querySelector('[aria-label="Pick a lick"]')).toBeNull();
    // Run controls live on the stage now that setup is hidden.
    expect(button("Cancel")).not.toBeUndefined();
    expect(button("Hear it")).not.toBeUndefined();

    button("Cancel")?.click();
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(
        document.querySelector('[data-testid="licks-setup-heading"]'),
      ),
    );
  });

  test("returns to setup from the graded summary via Change setup", async () => {
    const harness = makeRuntime();
    render(Page, { props: { runtime: harness.runtime as unknown as MusicRuntime } });

    button("Play it back")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Play the lick"));
    const expected = LICK_PHRASES[1]!.map(([midi]) => midi);
    for (const [index, midi] of expected.entries()) harness.emit(midi, index * 100);

    await vi.waitFor(() => expect(button("Change setup")).not.toBeUndefined());
    button("Change setup")?.click();

    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Lick category"]')).not.toBeNull(),
    );
    expect(button("Change setup")).toBeUndefined();
    expect(document.activeElement).toBe(
      document.querySelector('[data-testid="licks-setup-heading"]'),
    );
  });

  test("uses the shared retry bar after a graded lick", async () => {
    const harness = makeRuntime();
    render(Page, { props: { runtime: harness.runtime as unknown as MusicRuntime } });

    button("Play it back")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Play the lick"));
    const expected = LICK_PHRASES[1]!.map(([midi]) => midi);
    for (const [index, midi] of expected.entries()) harness.emit(midi, index * 100);

    await vi.waitFor(() => expect(button("Repeat lick")).not.toBeUndefined());
    button("Repeat lick")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Play the lick"));
    expect(button("Repeat lick")).toBeUndefined();
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

    button("Play it back")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Play the lick"));
    const expected = LICK_PHRASES[1]!.map(([midi]) => midi);
    for (const [index, midi] of expected.entries()) harness.emit(midi, index * 100);

    await vi.waitFor(() => expect(ingest).toHaveBeenCalledOnce());
    button("Repeat lick")?.click();
    await vi.waitFor(() => expect(button("Cancel")).not.toBeUndefined());
    button("Cancel")?.click();
    harness.changeInstrument("guitar");

    releaseIngest();
    await vi.waitFor(() => expect(harness.runtime.recordPractice).toHaveBeenCalledOnce());
    const entry = harness.runtime.recordPractice.mock.calls[0]![0];
    expect(entry.instrument).toBe("piano");
    expect(entry.runs[0]?.instrument).toBe(entry.instrument);
    expect(entry.scoringEvents[0]?.runId).toBe(entry.runs[0]?.id);
    expect(document.body.textContent).toContain("Play the lick…");
    expect(document.body.textContent).not.toContain("notes · 100% · +");
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
  let onInstrumentChange: ((instrument: InstrumentId) => void) | undefined;
  const runtime = {
    activeSource: "onscreen",
    activeInstrument: "piano",
    audioEnabled: false,
    audioMessage: "",
    dailyRoutine: undefined,
    enableAudio: vi.fn(async () => true),
    ensurePlaybackVoice: vi.fn(async () => true),
    sound: { playNote: vi.fn(), playPattern: vi.fn(), stopPattern: vi.fn() },
    router: {
      subscribe: vi.fn((next) => {
        listener = next;
        return vi.fn();
      }),
      push: vi.fn(() => true),
    },
    recordPractice: vi.fn(async () => undefined),
    setActiveInstrument: vi.fn(),
    registerPracticeContext: vi.fn(
      async (context: Parameters<MusicRuntime["registerPracticeContext"]>[0]) => {
        onInstrumentChange = context.onInstrumentChange;
        context.onBpmChange?.(150);
        return vi.fn();
      },
    ),
    beginPerformance: vi.fn(async () => ({ status: "started", downbeat: monotonicMs(1_000) })),
    endPerformance: vi.fn(),
  };

  return {
    runtime,
    emit(midiNote: number, timestamp: number) {
      listener?.({ type: "noteOn", midiNote, velocity: 1, timestamp });
    },
    changeInstrument(instrument: InstrumentId) {
      onInstrumentChange?.(instrument);
    },
  };
}
