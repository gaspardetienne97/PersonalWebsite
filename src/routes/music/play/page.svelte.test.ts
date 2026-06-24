import { MusicRuntime } from "../_runtime.svelte";
import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

function button(name: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) =>
      candidate.textContent?.trim() === name ||
      candidate.getAttribute("aria-label") === name ||
      candidate.textContent?.includes(name),
  );
}

function renderLab() {
  const runtime = new MusicRuntime();
  runtime.audioEnabled = true;
  runtime.setCountIn(0);
  const recordPractice = vi.spyOn(runtime, "recordPractice").mockResolvedValue();
  render(Page, { runtime });
  return { runtime, recordPractice };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("/music/play/+page.svelte", () => {
  test("renders the Practice Lab workspace and retains tool links", () => {
    renderLab();

    expect(document.getElementById("practice-lab")).not.toBeNull();
    expect(button("Start recording")).toBeDefined();
    expect(button("Monitor")).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelector('a[href="/music/play/scales"]')?.textContent).toContain(
      "Scales & Technique",
    );
    expect(document.querySelector('a[href="/music/play/mpc"]')?.textContent).toContain(
      "MPC Rudiments",
    );
    expect(document.querySelector('a[href="/music/play/spider"]')?.textContent).toContain(
      "Spider Drill",
    );
    expect(document.querySelector('a[href="/music/songs"]')?.textContent).toContain("Song Library");
  });

  test("records MIDI notes into a free-practice journal capture", async () => {
    const { runtime, recordPractice } = renderLab();

    button("Start recording")?.click();
    runtime.router.noteOn(60, "midi", "piano");

    await vi.waitFor(() => expect(document.body.textContent).toContain("1 note"));
    button("Stop recording")?.click();

    await vi.waitFor(() =>
      expect(recordPractice).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "free-practice",
          instrument: "piano",
          startedAt: expect.any(Number),
          endedAt: expect.any(Number),
        }),
      ),
    );
  });

  test("captures on-screen input through the same router subscription", async () => {
    const { recordPractice } = renderLab();

    button("Start recording")?.click();
    button("C4")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("1 note"));
    button("Stop recording")?.click();

    await vi.waitFor(() => expect(recordPractice).toHaveBeenCalledOnce());
  });

  test("monitor off prevents note preview playback", async () => {
    const { runtime } = renderLab();
    const playNote = vi.spyOn(runtime.sound, "playNote");

    button("Monitor")?.click();
    runtime.router.noteOn(60, "midi", "piano");
    await flush();

    expect(playNote).not.toHaveBeenCalled();
  });

  test("does not save an empty recording without audio", async () => {
    const { recordPractice } = renderLab();

    button("Start recording")?.click();
    button("Stop recording")?.click();
    await flush();

    expect(recordPractice).not.toHaveBeenCalled();
  });

  test("shows retry save when journal persistence fails", async () => {
    const runtime = new MusicRuntime();
    runtime.audioEnabled = true;
    runtime.setCountIn(0);
    vi.spyOn(runtime, "recordPractice").mockRejectedValue(new Error("Persistence unavailable"));
    render(Page, { runtime });

    button("Start recording")?.click();
    runtime.router.noteOn(60, "midi", "piano");
    await vi.waitFor(() => expect(document.body.textContent).toContain("1 note"));
    button("Stop recording")?.click();

    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Retry save"]')).not.toBeNull(),
    );
    expect(document.body.textContent).toContain("Persistence unavailable");
  });
});
