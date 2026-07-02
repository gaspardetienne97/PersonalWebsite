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

function renderLab(options: { navigateToCreate?: (href: string) => void | Promise<void> } = {}) {
  const runtime = new MusicRuntime();
  runtime.audioEnabled = true;
  runtime.setCountIn(0);
  const recordPractice = vi.spyOn(runtime, "recordPractice").mockResolvedValue();
  render(Page, { runtime, ...options });
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
    expect(document.querySelector('a[href="/music/library?tab=songs"]')?.textContent).toContain(
      "Song Library",
    );
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

  test("adds recorded MIDI notes to the shared take review panel", async () => {
    const { runtime } = renderLab();

    button("Start recording")?.click();
    runtime.router.noteOn(60, "midi", "piano");
    runtime.router.noteOn(64, "midi", "piano");
    await vi.waitFor(() => expect(document.body.textContent).toContain("2 notes"));

    button("Stop recording")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("MIDI takes"));
    expect(document.body.textContent).toContain("Practice Lab take 1");
    expect(document.querySelectorAll("[data-density-bucket]")).toHaveLength(16);
  });

  test("sends a recorded MIDI take to the Create piano roll", async () => {
    const navigateToCreate = vi.fn();
    const { runtime } = renderLab({ navigateToCreate });
    const writeLocalState = vi.spyOn(runtime, "writeLocalState").mockResolvedValue();

    button("Start recording")?.click();
    runtime.router.noteOn(60, "midi", "piano");
    runtime.router.noteOn(64, "midi", "piano");
    await vi.waitFor(() => expect(document.body.textContent).toContain("2 notes"));
    button("Stop recording")?.click();

    await vi.waitFor(() => expect(button("Open in Piano Roll")).not.toBeUndefined());
    button("Open in Piano Roll")?.click();

    await vi.waitFor(() => {
      expect(writeLocalState).toHaveBeenCalledWith(
        "music.piano-roll.pending-take-import",
        expect.objectContaining({
          bpm: runtime.transportBpm,
          take: expect.objectContaining({
            name: "Practice Lab take 1",
            notes: [expect.objectContaining({ midi: 60 }), expect.objectContaining({ midi: 64 })],
          }),
        }),
      );
      expect(navigateToCreate).toHaveBeenCalledWith(
        "/music/create?mode=piano-roll&source=practice-lab-take",
      );
    });
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
