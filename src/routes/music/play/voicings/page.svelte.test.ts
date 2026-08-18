import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { monotonicMs, unixMs } from "@repo/music-core/domain";
import { type DailyRoutineStep } from "@repo/music-core/engines/daily-routine";
import { midiToNote } from "@repo/music-core/engines/theory";
import { buildVoicingDrillTargets } from "@repo/music-core/engines/voicing-drill-session";

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
  test("keeps the engine stopped when playback voice activation fails", async () => {
    const runtime = new MusicRuntime();
    runtime.audioMessage = "Preferred voice unavailable.";
    vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(false);
    render(Page, { runtime });

    await vi.waitFor(() => expect(button("Start drill")?.disabled).toBe(false));
    button("Start drill")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain(runtime.audioMessage));
    expect(runtime.beginPerformance).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Play the voicing");
    expect(button("Start drill")?.disabled).toBe(false);
    expect(button("Cancel drill")).toBeUndefined();
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

    await vi.waitFor(() => expect(button("Start drill")?.disabled).toBe(false));
    button("Start drill")?.click();
    await vi.waitFor(() => expect(runtime.ensurePlaybackVoice).toHaveBeenCalledOnce());

    expect(button("Piano")?.closest("fieldset")?.disabled).toBe(true);
    expect(button("Start drill")?.disabled).toBe(true);
    expect(button("Cancel drill")).toBeUndefined();

    resolveVoice(false);
    await vi.waitFor(() => expect(button("Start drill")?.disabled).toBe(false));
    expect(button("Piano")?.closest("fieldset")?.disabled).toBe(false);
  });

  test("renders the drill with an instrument toggle and a start button", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("ii-V-I Voicing Drill");

    const instruments = [...document.querySelectorAll('[aria-label="Instrument"] button')].map(
      (button) => button.textContent?.trim(),
    );
    expect(instruments).toEqual(["Piano", "Guitar", "Ukulele", "Aerophone"]);

    const variants = [...document.querySelectorAll('[aria-label="Drill variant"] button')].map(
      (button) => button.textContent?.trim(),
    );
    expect(variants).toEqual(["Major", "Minor", "Altered V7"]);

    await vi.waitFor(() =>
      expect(
        [...document.querySelectorAll("button")].find((button) =>
          button.textContent?.includes("Start drill"),
        )?.disabled,
      ).toBe(false),
    );
    const start = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Start drill"),
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
        [...document.querySelectorAll("button")].find((button) =>
          button.textContent?.includes("Start drill"),
        )?.disabled,
      ).toBe(false),
    );

    [...document.querySelectorAll('[aria-label="Drill variant"] button')]
      .find((button) => button.textContent?.includes("Altered V7"))
      ?.click();
    expect(document.body.textContent).toContain("Altered V7");

    [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Start drill"))
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

    expect(button("Guitar")).toHaveAttribute("aria-pressed", "true");
    expect(button("Minor")).toHaveAttribute("aria-pressed", "true");
    expect(button("Held")).toHaveAttribute("aria-pressed", "true");
    expect(button("Manual")).toHaveAttribute("aria-pressed", "true");
    await vi.waitFor(() => expect(button("Start drill")?.disabled).toBe(false));
  });

  test("keeps setup changes in the shareable URL", async () => {
    setTestUrl("/music/play/voicings");
    render(Page);

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
        [...document.querySelectorAll("button")].find((button) =>
          button.textContent?.includes("Start drill"),
        )?.disabled,
      ).toBe(false),
    );
    const start = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Start drill"),
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
    await vi.waitFor(() => expect(button("Start drill")?.disabled).toBe(false));
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

    await vi.waitFor(() => expect(button("Start drill")?.disabled).toBe(false));
    button("Start drill")?.click();

    const advanceButton = () =>
      [...document.querySelectorAll("button")].find(
        (candidate) =>
          candidate.textContent?.includes("Skip chord") ||
          candidate.textContent?.includes("Check chord"),
      );

    await vi.waitFor(() => expect(button("Cancel drill")).not.toBeUndefined());
    expect(button("Piano")).toBeUndefined();
    expect(document.activeElement?.textContent).toContain("Dm7");
    expect(button("Cancel drill")?.closest('[data-surface="stage"]')).toBeNull();
    expect(advanceButton()).not.toBeUndefined();
    for (let index = 0; index < 36; index += 1) {
      advanceButton()?.click();
      if (index === 35) {
        await vi.waitFor(() => expect(document.body.textContent).toContain("Drill complete"));
      } else {
        await vi.waitFor(() => expect(document.body.textContent).toContain(`${index + 2} / 36`));
      }
    }

    await vi.waitFor(() => expect(button("Repeat voicings")).not.toBeUndefined());
    button("Repeat voicings")?.click();
    await vi.waitFor(() => expect(button("Cancel drill")).not.toBeUndefined());
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

    button("Repeat voicings")?.click();
    await vi.waitFor(() => expect(ensurePlaybackVoice).toHaveBeenCalledOnce());
    expect(document.body.textContent).not.toContain("Drill complete");
    expect(button("Start drill")?.disabled).toBe(true);
    expect(button("Change setup")).toBeUndefined();

    resolveVoice(false);
    await vi.waitFor(() => expect(document.body.textContent).toContain(runtime.audioMessage));
    expect(document.body.textContent).not.toContain("Drill complete");
    expect(button("Start drill")?.disabled).toBe(false);
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
    button("Repeat voicings")?.click();
    button("Change setup")?.click();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(beginPerformance).not.toHaveBeenCalled();
    expect(button("Cancel drill")).toBeUndefined();
    expect(button("Start drill")?.disabled).toBe(false);
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

    await vi.waitFor(() => expect(button("Start drill")?.disabled).toBe(false));
    button("Start drill")?.click();
    await vi.waitFor(() => expect(button("Check chord")).not.toBeUndefined());

    // Grading is by pitch class, so play each expected one in the shown octave.
    const [target] = buildVoicingDrillTargets("piano", { strict: true });
    for (const pitchClass of target.expectedPitchClasses) {
      const note = midiToNote(48 + pitchClass);
      document.querySelector<HTMLButtonElement>(`button[data-note="${note}"]`)?.click();
    }

    // Each click latches, so the notes are held together and the chord fills.
    await vi.waitFor(() => expect(notesMatched()).toBe("100%"));
  });

  test("cancels an active run and returns focus to setup", async () => {
    const runtime = new MusicRuntime();
    const endPerformance = vi.spyOn(runtime, "endPerformance");
    render(Page, { runtime });

    await vi.waitFor(() => expect(button("Start drill")?.disabled).toBe(false));
    button("Start drill")?.click();
    await vi.waitFor(() => expect(button("Cancel drill")).not.toBeUndefined());
    button("Cancel drill")?.click();

    await vi.waitFor(() => expect(button("Start drill")?.disabled).toBe(false));
    expect(button("Cancel drill")).toBeUndefined();
    expect(document.activeElement?.textContent).toContain("Rootless ii-V-I");
    expect(document.querySelector("p.sr-only[aria-live='polite']")?.textContent).toContain(
      "Drill cancelled",
    );
    expect(endPerformance).toHaveBeenCalled();
    runtime.dispose();
  });
});

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

async function completeDrill(): Promise<void> {
  await vi.waitFor(() => expect(button("Start drill")?.disabled).toBe(false));
  button("Start drill")?.click();

  const advance = () => button("Skip chord") ?? button("Check chord");
  await vi.waitFor(() => expect(advance()).not.toBeUndefined());
  for (let index = 0; index < 36; index += 1) {
    advance()?.click();
    if (index < 35) {
      await vi.waitFor(() => expect(document.body.textContent).toContain(`${index + 2} / 36`));
    }
  }
  await vi.waitFor(() => expect(button("Repeat voicings")).not.toBeUndefined());
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
    skillId: "harmony.ii-v-i",
  };
}
