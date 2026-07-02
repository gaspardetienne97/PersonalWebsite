import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { unixMs } from "@repo/music-core/domain";
import { type DailyRoutineStep } from "@repo/music-core/engines/daily-routine";

import { MusicRuntime } from "../../_runtime.svelte";
import Page from "./+page.svelte";

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
  document.body.replaceChildren();
});

describe("/music/play/voicings/+page.svelte", () => {
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
    render(Page);

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
  });

  test("restores setup from shareable query parameters", async () => {
    window.history.replaceState(
      {},
      "",
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
    window.history.replaceState({}, "", "/music/play/voicings");
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

    await vi.waitFor(() => expect(advanceButton()).not.toBeUndefined());
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
    await vi.waitFor(() => expect(advanceButton()).not.toBeUndefined());
    expect(document.body.textContent).toContain("1 / 36");
    runtime.dispose();
  });
});

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
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
