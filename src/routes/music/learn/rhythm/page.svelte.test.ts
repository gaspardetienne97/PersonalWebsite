import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";
import { setTestUrl } from "../../_components/test-url";
import { MusicRuntime } from "../../_runtime.svelte";

afterEach(() => {
  setTestUrl("/");
  document.body.replaceChildren();
});

describe("/music/learn/rhythm/+page.svelte", () => {
  test("shows pulse setup with MIDI, microphone, and tap-tempo controls", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Rhythm Trainer");
    expect(button("Enable MIDI")).not.toBeUndefined();
    expect(button("Start microphone")).not.toBeUndefined();
    expect(button("Tap tempo")).not.toBeUndefined();
    await vi.waitFor(() => expect(button("Start Rhythm")?.disabled).toBe(false));
  });

  test("starts a pulse run and accepts on-screen taps", async () => {
    render(Page);
    await vi.waitFor(() => expect(button("Start Rhythm")?.disabled).toBe(false));
    button("Start Rhythm")?.click();

    await vi.waitFor(() => expect(button("Tap beat")).not.toBeUndefined());
    button("Tap beat")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Progress"));
  });

  test("restores setup from shareable query parameters", async () => {
    setTestUrl("/music/learn/rhythm?mode=read-and-tap&bpm=72&beats=6&pattern=eighth-rests");
    render(Page);

    expect(button("Read & tap")).toHaveAttribute("aria-pressed", "true");
    expect(select("Pattern")?.value).toBe("eighth-rests");
    expect(input("BPM")?.value).toBe("72");
    expect(input("Beats")?.value).toBe("6");
    await vi.waitFor(() => expect(button("Start Rhythm")?.disabled).toBe(false));
  });

  test("keeps setup changes in the shareable URL", async () => {
    setTestUrl("/music/learn/rhythm");
    render(Page);

    select("Pattern")!.value = "triplets";
    select("Pattern")!.dispatchEvent(new Event("change", { bubbles: true }));
    input("BPM")!.value = "88";
    input("BPM")!.dispatchEvent(new Event("input", { bubbles: true }));
    input("Beats")!.value = "8";
    input("Beats")!.dispatchEvent(new Event("input", { bubbles: true }));
    button("Read & tap")?.click();

    await vi.waitFor(() => expect(window.location.search).toContain("bpm=88"));
    expect(window.location.search).toContain("pattern=triplets");
    expect(window.location.search).toContain("beats=8");
    expect(window.location.search).toContain("mode=read-and-tap");
  });

  test("starts a selected rhythm pattern", async () => {
    setTestUrl("/music/learn/rhythm?pattern=eighth-rests");
    render(Page);
    await vi.waitFor(() => expect(button("Start Rhythm")?.disabled).toBe(false));

    expect(select("Pattern")?.value).toBe("eighth-rests");
    button("Start Rhythm")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Eighth-note rests"));
    expect(button("Tap beat")).not.toBeUndefined();
  });

  test("starts read-and-tap with a visible rhythm target", async () => {
    setTestUrl("/music/learn/rhythm?mode=read-and-tap");
    render(Page);
    await vi.waitFor(() => expect(button("Start Rhythm")?.disabled).toBe(false));

    expect(button("Read & tap")).toHaveAttribute("aria-pressed", "true");
    button("Start Rhythm")?.click();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Read & tap");
      expect(document.querySelector('[aria-label="Rhythm pattern target"]')).not.toBeNull();
    });
    expect(button("Tap rhythm")).not.toBeUndefined();
  });

  test("gap-click schedules audible clicks for the on bar only", async () => {
    setTestUrl("/music/learn/rhythm?pattern=gap-click-1-on-1-off&bpm=120");
    const runtime = new MusicRuntime();
    runtime.audioEnabled = true;
    vi.spyOn(runtime.sound, "playCountIn").mockReturnValue({
      startAudioSeconds: 0,
      delayMs: 2_000,
    });
    const click = vi.spyOn(runtime.sound, "playMetronomeClick").mockImplementation(() => {});
    render(Page, { runtime });

    await vi.waitFor(() => expect(button("Start Rhythm")?.disabled).toBe(false));
    button("Start Rhythm")?.click();

    // 2 bars at 120 BPM starting 2s in: bar 0 clicks (accent on beat 1),
    // bar 1 (beats at 4s+) stays silent — that's the gap.
    await vi.waitFor(() => expect(click).toHaveBeenCalledTimes(4));
    expect(click.mock.calls.map(([atSeconds]) => atSeconds)).toEqual([2, 2.5, 3, 3.5]);
    expect(click.mock.calls.map(([, accented]) => accented)).toEqual([true, false, false, false]);
    runtime.dispose();
  });

  test("offers a slower retry after a completed pulse run", async () => {
    render(Page);
    input("BPM")!.value = "100";
    input("BPM")!.dispatchEvent(new Event("input", { bubbles: true }));
    input("Beats")!.value = "2";
    input("Beats")!.dispatchEvent(new Event("input", { bubbles: true }));

    await vi.waitFor(() => expect(button("Start Rhythm")?.disabled).toBe(false));
    button("Start Rhythm")?.click();
    await vi.waitFor(() => expect(button("Tap beat")).not.toBeUndefined());
    button("Tap beat")?.click();
    button("Tap beat")?.click();

    await vi.waitFor(() => expect(button("Slow down")).not.toBeUndefined());
    button("Slow down")?.click();

    await vi.waitFor(() => expect(input("BPM")?.value).toBe("90"));
    expect(input("Beats")?.value).toBe("2");
    expect(document.body.textContent).toContain("Ready for a rhythm session.");
  });
});

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

function input(label: string): HTMLInputElement | undefined {
  return [...document.querySelectorAll<HTMLInputElement>("input")].find(
    (candidate) => candidate.getAttribute("aria-label") === label,
  );
}

function select(label: string): HTMLSelectElement | undefined {
  return [...document.querySelectorAll<HTMLSelectElement>("select")].find(
    (candidate) => candidate.getAttribute("aria-label") === label,
  );
}
