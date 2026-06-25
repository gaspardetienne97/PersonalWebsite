import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { monotonicMs, type Score } from "@repo/music-core/domain";
import type { SongRow } from "@repo/music-core/engines/store";

import { MusicRuntime } from "../../_runtime.svelte";
import Page from "./+page.svelte";

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
    runtime.dispose();
  });

  test("filters MusicXML rendering and practice targets to selected parts", async () => {
    const library = {
      get: vi.fn(async () => multiPartSongRow()),
    };
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "enableAudio").mockResolvedValue(true);
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

    button("Start practice")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Play E2"));
    expect(document.body.textContent).not.toContain("Play C4");
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

  test("keeps custom range controls synchronized with canonical beat values", async () => {
    const library = {
      get: vi.fn(async () => songRow()),
    };
    const runtime = new MusicRuntime();

    render(Page, { songId: "song-1", runtime, library });
    await vi.waitFor(() => expect(document.body.textContent).toContain("Autumn Leaves"));

    button("Custom range")?.click();
    await vi.waitFor(() => expect(input("Range start beat")).not.toBeUndefined());

    expect(input("Range start beat")?.value).toBe("0");
    expect(input("Range end beat")?.value).toBe("4");
    expect(button("Note groups")?.getAttribute("aria-pressed")).toBe("true");
    expect(button("Measures")).not.toBeUndefined();
    runtime.dispose();
  });

  test("runs two timed performance takes and logs one structured practice capture", async () => {
    const library = {
      get: vi.fn(async () => songRow()),
    };
    const runtime = new MusicRuntime();
    const runCountIn = vi
      .spyOn(runtime, "runCountIn")
      .mockImplementation(async () => monotonicMs(performance.now()));
    const stopPracticeClock = vi.spyOn(runtime, "stopPracticeClock");
    const recordPractice = vi.spyOn(runtime, "recordPractice").mockResolvedValue();

    render(Page, { songId: "song-1", runtime, library });
    await vi.waitFor(() => expect(document.body.textContent).toContain("Autumn Leaves"));

    button("Performance")?.click();
    await vi.waitFor(() => expect(input("Practice BPM")).not.toBeUndefined());
    input("Practice BPM")!.value = "240";
    input("Practice BPM")!.dispatchEvent(new Event("input", { bubbles: true }));
    button("Off")?.click();
    await vi.waitFor(() => expect(button("2 takes")).not.toBeUndefined());
    button("2 takes")?.click();
    await vi.waitFor(() => expect(button("2 takes")?.getAttribute("aria-pressed")).toBe("true"));

    button("Start practice")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Practice complete"), {
      timeout: 5_000,
    });
    expect(runCountIn).toHaveBeenCalledTimes(2);
    expect(stopPracticeClock).toHaveBeenCalled();
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
});

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

function input(label: string): HTMLInputElement | undefined {
  return document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`) ?? undefined;
}

function songRow(): SongRow {
  return {
    id: "song-1",
    title: "Autumn Leaves",
    createdAt: 1_000,
    updatedAt: 2_000,
    score: score(),
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
