import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { monotonicMs, unixMs, type ScoringEvent } from "@repo/music-core/domain";
import { type DailyRoutineStep } from "@repo/music-core/engines/daily-routine";
import { midiToNote } from "@repo/music-core/engines/theory";
import {
  buildVoicingDrillTargets,
  VoicingDrillSession,
} from "@repo/music-core/engines/voicing-drill-session";

import { MusicRuntime } from "../../_runtime.svelte";
import Page from "./+page.svelte";
import { setTestUrl } from "../../_components/test-url";

beforeEach(() => {
  vi.spyOn(MusicRuntime.prototype, "ensurePlaybackVoice").mockResolvedValue(true);
  vi.spyOn(MusicRuntime.prototype, "beginPerformance").mockResolvedValue({
    status: "started",
    downbeat: monotonicMs(1_000),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  setTestUrl("/");
  document.body.replaceChildren();
});

describe("/music/play/voicings/+page.svelte", () => {
  test("does not submit a guide-tone Check after teardown during deferred audio activation", async () => {
    setTestUrl("/music/play/voicings?variant=guide-tones");
    const runtime = new MusicRuntime();
    let release!: (enabled: boolean) => void;
    const audio = vi.spyOn(runtime, "enableAudio").mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const submit = vi.spyOn(VoicingDrillSession.prototype, "submit").mockResolvedValue({
      target: buildVoicingDrillTargets("piano", { variant: "guide-tones" })[0]!,
      event: { metrics: [] } as unknown as ScoringEvent,
      xp: 0,
      correct: false,
      score: 0,
    });
    const view = render(Page, { runtime });
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();
    await vi.waitFor(() => expect(button("Check chord")?.disabled).toBe(false));
    button("Check chord")?.click();
    await vi.waitFor(() => expect(audio).toHaveBeenCalledOnce());
    view.unmount();
    release(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(submit).not.toHaveBeenCalled();
    runtime.dispose();
  });
  test("guide tones stays manual and unaided, carries the source forward and reports both dimensions", async () => {
    setTestUrl("/music/play/voicings?variant=guide-tones&mode=practice");
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "enableAudio").mockResolvedValue(true);
    const record = vi.spyOn(runtime, "recordPractice").mockResolvedValue(undefined);
    render(Page, { runtime });
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    expect(document.body.textContent).toContain("Current Dm7: F3 C4");
    expect(document.body.textContent).toContain("Register: C3–B4");
    expect(document.body.textContent).not.toContain("Drill preview");
    expect(document.querySelector('[data-highlight="target"]')).toBeNull();
    button("Start")?.click();
    await vi.waitFor(() => expect(button("Check chord")).not.toBeUndefined());
    for (const note of [53, 59]) runtime.router.noteOn(note, "onscreen");
    await vi.waitFor(() => expect(document.body.textContent).toContain("Two notes selected"));
    expect(document.querySelector("h2")?.textContent).toContain("G7");
    button("Check chord")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Current G7: F3 B3"));
    expect(document.body.textContent).toContain("Movement: 1 semitone; minimum 1 semitone");
    for (const note of [52, 59]) runtime.router.noteOn(note, "onscreen");
    button("Check chord")?.click();
    await vi.waitFor(() => expect(button("Again")).not.toBeUndefined());
    expect(document.body.textContent).toContain("Membership: correct");
    expect(document.body.textContent).toContain("Movement: 1 semitone; minimum 1 semitone");
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        scoringEvents: expect.arrayContaining([
          expect.objectContaining({
            assistance: "independent",
            skillIds: ["harmony.ii-v-i.voice-leading"],
          }),
        ]),
        comparison: expect.objectContaining({
          variantKey: expect.stringContaining("guide-tones:0:48-71:independent"),
        }),
      }),
    );
    runtime.dispose();
  });

  test("guide-tone key setup persists, remains piano-only, and cancellation restores setup", async () => {
    setTestUrl("/music/play/voicings?variant=guide-tones&key=2&instrument=guitar");
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "enableAudio").mockResolvedValue(true);
    render(Page, { runtime });
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Edit setup")?.click();
    await vi.waitFor(() =>
      expect(document.querySelector<HTMLSelectElement>('[aria-label="Key"]')?.value).toBe("2"),
    );
    expect(button("Guitar")).toBeUndefined();
    expect(document.body.textContent).toContain("Register: D3–C#5");
    expect(window.location.search).toContain("key=2");
    expect(window.location.search).toContain("instrument=piano");
    button("Start")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    button("Check chord")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Restored current pair"));
    button("Stop")?.click();
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    expect(document.body.textContent).toContain("Drill cancelled");
    expect(document.body.textContent).toContain("Guide tones");
    runtime.dispose();
  });

  test("reports extra notes after a lenient unaided answer", async () => {
    setTestUrl("/music/play/voicings?mode=check");
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "enableAudio").mockResolvedValue(true);
    render(Page, { runtime });
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();
    await vi.waitFor(() => expect(button("Check chord")).not.toBeUndefined());
    for (const pc of [1, ...buildVoicingDrillTargets("piano")[0]!.expectedPitchClasses]) {
      runtime.router.noteOn(60 + pc, "onscreen");
    }
    button("Check chord")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Extra notes: C#"));
    expect(document.body.textContent).toContain("Notes collected");
    runtime.dispose();
  });
  test("Check mode hides target cues before the answer", async () => {
    setTestUrl("/music/play/voicings?mode=check");
    const runtime = new MusicRuntime();
    render(Page, { runtime });
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    expect(document.querySelector('[data-highlight="target"]')).toBeNull();
    button("Start")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    expect(document.querySelector('[data-highlight="target"]')).toBeNull();
    expect(button("Check chord")).not.toBeUndefined();
    expect(document.body.textContent).not.toContain("Drill preview");
    expect(document.body.textContent).not.toContain("Notes collected");
    runtime.dispose();
  });

  test("keeps the engine stopped when playback voice activation fails", async () => {
    const runtime = new MusicRuntime();
    runtime.audioMessage = "Preferred voice unavailable.";
    vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(false);
    render(Page, { runtime });

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain(runtime.audioMessage));
    expect(runtime.beginPerformance).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Play the voicing");
    expect(button("Start")?.disabled).toBe(false);
    expect(button("Stop")).toBeUndefined();
    expect(document.querySelector("p.sr-only[aria-live='polite']")?.textContent).toContain(
      runtime.audioMessage,
    );
  });

  test("keeps setup visible and locked while start preflight settles", async () => {
    const runtime = new MusicRuntime();
    let resolveVoice!: (enabled: boolean) => void;
    vi.spyOn(runtime, "ensurePlaybackVoice").mockReturnValue(
      new Promise((resolve) => {
        resolveVoice = resolve;
      }),
    );
    render(Page, { runtime });

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Edit setup")?.click();
    await vi.waitFor(() => expect(button("Piano")).not.toBeUndefined());
    button("Start")?.click();
    await vi.waitFor(() => expect(runtime.ensurePlaybackVoice).toHaveBeenCalledOnce());

    expect(button("Piano")?.closest("fieldset")?.disabled).toBe(true);
    expect(button("Start")?.disabled).toBe(true);
    expect(button("Stop")).toBeUndefined();

    resolveVoice(false);
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    expect(button("Piano")?.closest("fieldset")?.disabled).toBe(false);
  });

  test("renders the drill with an instrument toggle and a start button", async () => {
    render(Page);
    // Setup is collapsed behind its summary line until asked for.
    await vi.waitFor(() => expect(button("Edit setup")).not.toBeUndefined());
    button("Edit setup")?.click();
    await vi.waitFor(() => expect(button("Piano")).not.toBeUndefined());

    expect(document.querySelector("h1")?.textContent).toContain("ii-V-I Voicing Drill");

    const instruments = [...document.querySelectorAll('[aria-label="Instrument"] button')].map(
      (button) => button.textContent?.trim(),
    );
    expect(instruments).toEqual(["Piano", "Guitar", "Ukulele", "Aerophone"]);

    const variants = [...document.querySelectorAll('[aria-label="Drill variant"] button')].map(
      (button) => button.textContent?.trim(),
    );
    expect(variants).toEqual(["Major", "Minor", "Altered V7", "Guide tones", "Inversions"]);

    await vi.waitFor(() =>
      expect(
        [...document.querySelectorAll("button")].find(
          (button) => button.textContent?.trim() === "Start",
        )?.disabled,
      ).toBe(false),
    );
    const start = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Start",
    );
    expect(start).not.toBeUndefined();
  });

  test("shows the configured 12-key drill preview before starting", async () => {
    render(Page);

    expect(document.body.textContent).toContain("Drill preview");
    expect(document.body.textContent).toContain("C major");
    expect(document.body.textContent).toContain("Dm7");
    expect(document.body.textContent).toContain("G7");
    expect(document.body.textContent).toContain("Cmaj7");
  });

  test("starts the altered dominant variant", async () => {
    const runtime = new MusicRuntime();
    const register = vi.spyOn(runtime, "registerPracticeContext");
    render(Page, { runtime });

    await vi.waitFor(() =>
      expect(
        [...document.querySelectorAll("button")].find(
          (button) => button.textContent?.trim() === "Start",
        )?.disabled,
      ).toBe(false),
    );
    button("Edit setup")?.click();
    await vi.waitFor(() => expect(button("Altered V7")).not.toBeUndefined());

    [...document.querySelectorAll('[aria-label="Drill variant"] button')]
      .find((button) => button.textContent?.includes("Altered V7"))
      ?.click();
    expect(document.body.textContent).toContain("Altered V7");

    [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Start")
      ?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("G7b9"));
    expect(runtime.beginPerformance).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({
        variantKey: "v1:voicings:piano:altered:A:lenient:auto",
      }),
    );
  });

  test("restores setup from shareable query parameters", async () => {
    setTestUrl(
      "/music/play/voicings?instrument=guitar&variant=minor&start=B&strict=held&advance=manual",
    );

    render(Page);

    await vi.waitFor(() => expect(button("Edit setup")).not.toBeUndefined());
    button("Edit setup")?.click();
    await vi.waitFor(() => expect(button("Guitar")).not.toBeUndefined());
    expect(button("Guitar")).toHaveAttribute("aria-pressed", "true");
    expect(button("Minor")).toHaveAttribute("aria-pressed", "true");
    expect(button("Held")).toHaveAttribute("aria-pressed", "true");
    expect(button("Manual")).toHaveAttribute("aria-pressed", "true");
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
  });

  test("keeps setup changes in the shareable URL", async () => {
    setTestUrl("/music/play/voicings");
    render(Page);

    await vi.waitFor(() => expect(button("Edit setup")).not.toBeUndefined());
    button("Edit setup")?.click();
    await vi.waitFor(() => expect(button("Ukulele")).not.toBeUndefined());
    button("Ukulele")?.click();
    button("Altered V7")?.click();
    button("Held")?.click();
    button("Manual")?.click();

    await vi.waitFor(() => expect(window.location.search).toContain("instrument=ukulele"));
    expect(window.location.search).toContain("variant=altered");
    expect(window.location.search).toContain("strict=held");
    expect(window.location.search).toContain("advance=manual");
  });

  test("renders the routine continuation action after a completed drill", async () => {
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "enableAudio").mockResolvedValue(true);
    runtime.startDailyRoutine([routineStep()], unixMs(1_000));
    render(Page, { runtime });

    await vi.waitFor(() =>
      expect(
        [...document.querySelectorAll("button")].find(
          (button) => button.textContent?.trim() === "Start",
        )?.disabled,
      ).toBe(false),
    );
    const start = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Start",
    );
    start?.click();

    // Auto-advance is the default, so the manual action reads "Skip chord";
    // either label grades the current chord and moves on.
    const advanceButton = () =>
      [...document.querySelectorAll("button")].find(
        (button) =>
          button.textContent?.includes("Skip chord") || button.textContent?.includes("Check chord"),
      );

    await vi.waitFor(() => expect(advanceButton()).not.toBeUndefined());
    for (let index = 0; index < 36; index += 1) {
      advanceButton()?.click();
      if (index === 35) {
        await vi.waitFor(() => expect(document.body.textContent).toContain("Drill complete"));
      } else {
        await vi.waitFor(() => expect(document.body.textContent).toContain(`${index + 2} / 36`));
      }
    }

    await vi.waitFor(() => expect(document.body.textContent).toContain("View routine summary"));
    expect(button("Change setup")).not.toBeUndefined();
    expect(document.activeElement?.textContent).toContain("Drill complete");
    expect(document.querySelector("p.sr-only[aria-live='polite']")?.textContent).toContain(
      "Voicing results ready",
    );

    button("Change setup")?.click();
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    expect(button("Change setup")).toBeUndefined();
    expect(document.body.textContent).not.toContain("Drill complete");
    expect(document.activeElement?.textContent).toContain("Rootless ii-V-I");
    expect(document.querySelector("p.sr-only[aria-live='polite']")?.textContent).toContain(
      "Setup ready",
    );
    runtime.dispose();
  });

  test("offers a repeat action after a completed drill", async () => {
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "enableAudio").mockResolvedValue(true);
    render(Page, { runtime });

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();

    const advanceButton = () =>
      [...document.querySelectorAll("button")].find(
        (candidate) =>
          candidate.textContent?.includes("Skip chord") ||
          candidate.textContent?.includes("Check chord"),
      );

    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    expect(button("Piano")).toBeUndefined();
    expect(document.activeElement?.textContent).toContain("Dm7");
    expect(button("Stop")?.closest('[data-surface="stage"]')).toBeNull();
    expect(advanceButton()).not.toBeUndefined();
    for (let index = 0; index < 36; index += 1) {
      advanceButton()?.click();
      if (index === 35) {
        await vi.waitFor(() => expect(document.body.textContent).toContain("Drill complete"));
      } else {
        await vi.waitFor(() => expect(document.body.textContent).toContain(`${index + 2} / 36`));
      }
    }

    await vi.waitFor(() => expect(button("Again")).not.toBeUndefined());
    button("Again")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    expect(document.body.textContent).toContain("1 / 36");
    runtime.dispose();
  });

  test("dismisses stale results while a deferred retry activation fails", async () => {
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "enableAudio").mockResolvedValue(true);
    render(Page, { runtime });
    await completeDrill();

    runtime.audioMessage = "Preferred voice unavailable.";
    let resolveVoice!: (enabled: boolean) => void;
    const ensurePlaybackVoice = vi.mocked(runtime.ensurePlaybackVoice);
    ensurePlaybackVoice.mockClear();
    ensurePlaybackVoice.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveVoice = resolve;
      }),
    );

    button("Again")?.click();
    await vi.waitFor(() => expect(ensurePlaybackVoice).toHaveBeenCalledOnce());
    expect(document.body.textContent).not.toContain("Drill complete");
    expect(button("Start")?.disabled).toBe(true);
    expect(button("Change setup")).toBeUndefined();

    resolveVoice(false);
    await vi.waitFor(() => expect(document.body.textContent).toContain(runtime.audioMessage));
    expect(document.body.textContent).not.toContain("Drill complete");
    expect(button("Start")?.disabled).toBe(false);
    expect(document.querySelector("p.sr-only[aria-live='polite']")?.textContent).toContain(
      runtime.audioMessage,
    );
    runtime.dispose();
  });

  test("keeps Change setup authoritative when it races retry preflight", async () => {
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "enableAudio").mockResolvedValue(true);
    render(Page, { runtime });
    await completeDrill();

    const beginPerformance = vi.mocked(runtime.beginPerformance);
    beginPerformance.mockClear();
    button("Again")?.click();
    button("Change setup")?.click();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(beginPerformance).not.toHaveBeenCalled();
    expect(button("Stop")).toBeUndefined();
    expect(button("Start")?.disabled).toBe(false);
    expect(document.body.textContent).not.toContain("Drill complete");
    expect(document.querySelector("p.sr-only[aria-live='polite']")?.textContent).toContain(
      "Setup ready",
    );
    runtime.dispose();
  });

  test("completes a held chord from sequential mouse clicks (click-to-latch)", async () => {
    setTestUrl("/music/play/voicings?strict=held&advance=manual");
    const runtime = new MusicRuntime();
    render(Page, { runtime });

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();
    await vi.waitFor(() => expect(button("Check chord")).not.toBeUndefined());

    // Grading is by pitch class, so play each expected one in whatever octave
    // the keyboard shows (it now frames the target voicing, not a fixed C3-C5).
    const [target] = buildVoicingDrillTargets("piano", { strict: true });
    for (const pitchClass of target.expectedPitchClasses) {
      const name = midiToNote(60 + pitchClass).replace(/\d+$/, "");
      [...document.querySelectorAll<HTMLButtonElement>("button[data-note]")]
        .find((key) => key.dataset.note?.replace(/\d+$/, "") === name)
        ?.click();
    }

    // Each click latches, so the notes are held together and the chord fills.
    await vi.waitFor(() => expect(notesMatched()).toBe("100%"));
  });

  test("cancels an active run and returns focus to setup", async () => {
    const runtime = new MusicRuntime();
    const endPerformance = vi.spyOn(runtime, "endPerformance");
    render(Page, { runtime });

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    button("Stop")?.click();

    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    expect(button("Stop")).toBeUndefined();
    expect(document.activeElement?.textContent).toContain("Rootless ii-V-I");
    expect(document.querySelector("p.sr-only[aria-live='polite']")?.textContent).toContain(
      "Drill cancelled",
    );
    expect(endPerformance).toHaveBeenCalled();
    runtime.dispose();
  });

  test("runs the P2 inversions drill: piano-only, held, and graded on the bass note", async () => {
    setTestUrl("/music/play/voicings?variant=inversions");
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "enableAudio").mockResolvedValue(true);
    render(Page, { runtime });
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    expect(document.body.textContent).toContain("first chord C");
    expect(document.body.textContent).toContain("C3 C4 E4 G4");
    expect(document.body.textContent).toContain("F2 C4 F4 A4");
    expect(button("Guitar")).toBeUndefined();
    expect(button("Lenient")).toBeUndefined();
    expect(window.location.search).toContain("strict=held");
    expect(window.location.search).toContain("advance=manual");

    button("Start")?.click();
    await vi.waitFor(() => expect(button("Check chord")).not.toBeUndefined());
    // Root position C: C3 in the left hand, C4 E4 G4 in the right.
    for (const note of [48, 60, 64, 67]) runtime.router.noteOn(note, "onscreen");
    button("Check chord")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Inversion: correct"));

    // Bar 2 wants F/C; F4 A4 C5 is the same pitch classes in root position.
    for (const note of [41, 65, 69, 72]) runtime.router.noteOn(note, "onscreen");
    button("Check chord")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("wrong bass note"));
    runtime.dispose();
  });

  test("builds a P2 bar from sequential pointer clicks, because the surface latches", async () => {
    setTestUrl("/music/play/voicings?variant=inversions");
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "enableAudio").mockResolvedValue(true);
    render(Page, { runtime });
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();
    await vi.waitFor(() => expect(button("Check chord")).not.toBeUndefined());

    // A mouse holds one key at a time; in latch mode each click adds to the chord.
    for (const note of ["C3", "C4", "E4", "G4"]) pianoKey(note)?.click();
    await vi.waitFor(() => expect(notesMatched()).toBe("100%"));
    button("Check chord")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Inversion: correct"));
    expect(document.body.textContent).toContain("F/C");
    runtime.dispose();
  });

  test("fails a P2 bar played without the left-hand root", async () => {
    setTestUrl("/music/play/voicings?variant=inversions");
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "enableAudio").mockResolvedValue(true);
    render(Page, { runtime });
    await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
    button("Start")?.click();
    await vi.waitFor(() => expect(button("Check chord")).not.toBeUndefined());
    // The right hand alone covers every expected pitch class — "LH plays roots" does not.
    for (const note of ["C4", "E4", "G4"]) pianoKey(note)?.click();
    button("Check chord")?.click();
    // Every pitch class is present, so the halved score is the missing root.
    await vi.waitFor(() => expect(document.body.textContent).toContain("50% — keep going"));
    runtime.dispose();
  });
});

/** An on-screen keyboard key by pitch, e.g. "E4" — most keys carry no visible label. */
function pianoKey(note: string): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(
    `[aria-label="On-screen keyboard"] button[data-note="${note}"]`,
  );
}

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

async function completeDrill(): Promise<void> {
  await vi.waitFor(() => expect(button("Start")?.disabled).toBe(false));
  button("Start")?.click();

  const advance = () => button("Skip chord") ?? button("Check chord");
  await vi.waitFor(() => expect(advance()).not.toBeUndefined());
  for (let index = 0; index < 36; index += 1) {
    advance()?.click();
    if (index < 35) {
      await vi.waitFor(() => expect(document.body.textContent).toContain(`${index + 2} / 36`));
    }
  }
  await vi.waitFor(() => expect(button("Again")).not.toBeUndefined());
}

/** The live "Notes matched" readout next to its label. */
function notesMatched(): string | undefined {
  const label = [...document.querySelectorAll("span")].find(
    (span) => span.textContent?.trim() === "Notes matched",
  );
  return label?.nextElementSibling?.textContent?.trim();
}

function routineStep(): DailyRoutineStep {
  return {
    id: "voicings",
    label: "ii-V-I Voicings",
    href: "/music/play/voicings",
    description: "Cycle the graded ii-V-I drill through all 12 keys.",
    minutes: 5,
    skillId: "harmony.ii-v-i",
  };
}
