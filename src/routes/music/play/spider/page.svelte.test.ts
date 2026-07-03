import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { monotonicMs, type NoteOnEvent } from "@repo/music-core/domain";

import Page from "./+page.svelte";
import { setTestUrl } from "../../_components/test-url";

afterEach(() => {
  vi.restoreAllMocks();
  setTestUrl("/");
  document.body.replaceChildren();
});

describe("/music/play/spider/+page.svelte", () => {
  test("completes a guitar 1-2-3-4 pattern on the fretboard", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("String Independence");
    expect(button("Guitar")).toHaveAttribute("aria-pressed", "true");
    await vi.waitFor(() => expect(button("Start spider")?.disabled).toBe(false));

    button("Start spider")?.click();
    await vi.waitFor(() => expect(button("Cancel spider")).not.toBeUndefined());

    for (const fret of [5, 6, 7, 8]) {
      fretButton(6, fret)?.click();
    }

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Spider complete");
      expect(button("Repeat spider")).not.toBeUndefined();
    });
  });

  test("restores setup from shareable query parameters", async () => {
    setTestUrl(
      "/music/play/spider?instrument=ukulele&tuning=ukulele.low-g&string=4&span=adjacent-2&fret=7&bpm=100&pattern=inside-out-1324",
    );

    render(Page);

    expect(button("Ukulele")).toHaveAttribute("aria-pressed", "true");
    expect(select("Pattern")?.value).toBe("inside-out-1324");
    expect(select("Tuning")?.value).toBe("ukulele.low-g");
    expect(select("String")?.value).toBe("4");
    expect(select("String span")?.value).toBe("adjacent-2");
    expect(select("Starting fret")?.value).toBe("7");
    expect(button("100 BPM")).toHaveAttribute("aria-pressed", "true");
    await vi.waitFor(() => expect(button("Start spider")?.disabled).toBe(false));
  });

  test("keeps setup changes in the shareable URL", async () => {
    setTestUrl("/music/play/spider");
    render(Page);

    button("Ukulele")?.click();
    await vi.waitFor(() => expect(window.location.search).toContain("instrument=ukulele"));
    select("Pattern")!.value = "outside-in-1423";
    select("Pattern")!.dispatchEvent(new Event("change", { bubbles: true }));
    select("String")!.value = "3";
    select("String")!.dispatchEvent(new Event("change", { bubbles: true }));
    select("String span")!.value = "adjacent-2";
    select("String span")!.dispatchEvent(new Event("change", { bubbles: true }));
    select("Starting fret")!.value = "4";
    select("Starting fret")!.dispatchEvent(new Event("change", { bubbles: true }));
    button("120 BPM")?.click();

    await vi.waitFor(() => expect(window.location.search).toContain("string=3"));
    expect(window.location.search).toContain("pattern=outside-in-1423");
    expect(window.location.search).toContain("span=adjacent-2");
    expect(window.location.search).toContain("fret=4");
    expect(window.location.search).toContain("bpm=120");
  });

  test("completes note finder mode on the fretboard", async () => {
    setTestUrl("/music/play/spider?mode=note-finder");
    render(Page);

    expect(button("Note Finder")).toHaveAttribute("aria-pressed", "true");
    await vi.waitFor(() => expect(button("Start note finder")?.disabled).toBe(false));
    button("Start note finder")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Find A2"));
    fretButton(6, 5)?.click();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Note found");
      expect(button("Repeat note finder")).not.toBeUndefined();
    });
    expect(window.location.search).toContain("mode=note-finder");
  });

  test("completes a selected spider permutation on the fretboard", async () => {
    setTestUrl("/music/play/spider?pattern=outside-in-1423");
    render(Page);
    await vi.waitFor(() => expect(button("Start spider")?.disabled).toBe(false));

    expect(select("Pattern")?.value).toBe("outside-in-1423");
    button("Start spider")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("1-4-2-3"));

    for (const fret of [5, 8, 6, 7]) {
      fretButton(6, fret)?.click();
    }

    await vi.waitFor(() => expect(document.body.textContent).toContain("Spider complete"));
  });

  test("completes a multi-string spider pattern on the fretboard", async () => {
    setTestUrl("/music/play/spider?span=adjacent-2");
    render(Page);
    await vi.waitFor(() => expect(button("Start spider")?.disabled).toBe(false));

    expect(select("String span")?.value).toBe("adjacent-2");
    button("Start spider")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("strings 6-5"));

    for (const [stringNumber, fret] of [
      [6, 5],
      [6, 6],
      [6, 7],
      [6, 8],
      [5, 5],
      [5, 6],
      [5, 7],
      [5, 8],
    ]) {
      fretButton(stringNumber, fret)?.click();
    }

    await vi.waitFor(() => expect(document.body.textContent).toContain("Spider complete"));
  });

  test("shows microphone input controls for acoustic guitar practice", async () => {
    const audioSource = createAudioSource();
    render(Page, { audioSource, audioSupported: true });

    await vi.waitFor(() => expect(button("Start microphone")?.disabled).toBe(false));
    button("Start microphone")?.click();

    await vi.waitFor(() => {
      expect(audioSource.start).toHaveBeenCalledOnce();
      expect(button("Stop microphone")).not.toBeUndefined();
      expect(document.body.textContent).toContain("Microphone is listening");
    });
  });

  test("completes a spider pattern from microphone pitch events", async () => {
    const audioSource = createAudioSource();
    render(Page, { audioSource, audioSupported: true });

    await vi.waitFor(() => expect(button("Start microphone")?.disabled).toBe(false));
    button("Start microphone")?.click();
    await vi.waitFor(() => expect(button("Start spider")?.disabled).toBe(false));

    button("Start spider")?.click();
    await vi.waitFor(() => expect(button("Cancel spider")).not.toBeUndefined());

    for (const midiNote of [45, 46, 47, 48]) {
      audioSource.emit(audioNote(midiNote));
    }

    await vi.waitFor(() => expect(document.body.textContent).toContain("Spider complete"));
  });

  test("offers a slower retry after a completed spider run", async () => {
    render(Page);
    button("100 BPM")?.click();
    await vi.waitFor(() => expect(button("Start spider")?.disabled).toBe(false));
    button("Start spider")?.click();
    await vi.waitFor(() => expect(button("Cancel spider")).not.toBeUndefined());

    for (const fret of [5, 6, 7, 8]) {
      fretButton(6, fret)?.click();
    }

    await vi.waitFor(() => expect(button("Slow down")).not.toBeUndefined());
    button("Slow down")?.click();

    await vi.waitFor(() => expect(button("Cancel spider")).not.toBeUndefined());
    expect(button("80 BPM")).toHaveAttribute("aria-pressed", "true");
    expect(window.location.search).toContain("bpm=80");
  });
});

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

function fretButton(stringNumber: number, fret: number): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find((candidate) =>
    candidate.getAttribute("aria-label")?.startsWith(`String ${stringNumber} fret ${fret},`),
  );
}

function select(label: string): HTMLSelectElement | undefined {
  return [...document.querySelectorAll<HTMLSelectElement>("select")].find(
    (candidate) => candidate.getAttribute("aria-label") === label,
  );
}

function createAudioSource() {
  let listener: ((event: NoteOnEvent) => void) | undefined;
  let stateListener: ((state: { status: "idle" | "running" }) => void) | undefined;
  return {
    state: { status: "idle" as const },
    start: vi.fn(async function (this: { state: { status: "idle" | "running" } }) {
      this.state = { status: "running" };
      stateListener?.(this.state);
    }),
    stop: vi.fn(async function (this: { state: { status: "idle" | "running" } }) {
      this.state = { status: "idle" };
      stateListener?.(this.state);
    }),
    subscribeState: vi.fn((next: (state: { status: "idle" | "running" }) => void) => {
      stateListener = next;
      return vi.fn();
    }),
    subscribeEvents: vi.fn((next: (event: NoteOnEvent) => void) => {
      listener = next;
      return vi.fn();
    }),
    emit(event: NoteOnEvent): void {
      listener?.(event);
    },
  };
}

function audioNote(midiNote: number): NoteOnEvent {
  return {
    type: "noteOn",
    midiNote,
    velocity: 1,
    source: "audio",
    confidence: 0.9,
    timestamp: monotonicMs(0),
    clock: "performance",
  };
}
