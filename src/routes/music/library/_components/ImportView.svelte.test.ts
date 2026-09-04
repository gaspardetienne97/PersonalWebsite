import { Midi } from "@tonejs/midi";
import JSZip from "jszip";
import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import type { SongSource } from "@repo/music-core/engines/store";

import type { MusicRuntime } from "../../_runtime.svelte";
import Page from "./ImportView.svelte";

function midiFile(): File {
  const midi = new Midi();
  midi.header.setTempo(120);
  const track = midi.addTrack();
  [60, 64, 67].forEach((note, index) =>
    track.addNote({ midi: note, time: index * 0.5, duration: 0.4 }),
  );
  return new File([midi.toArray()], "test.mid", { type: "audio/midi" });
}

function shortMidiFile(): File {
  const midi = new Midi();
  midi.header.setTempo(120);
  midi.addTrack().addNote({ midi: 60, time: 0, duration: 0.01 });
  return new File([midi.toArray()], "short.mid", { type: "audio/midi" });
}

function playbackRuntime(ensurePlaybackVoice = vi.fn(async () => true)) {
  return {
    audioMessage: "Audio unavailable.",
    ensurePlaybackVoice,
    sound: {
      playPattern: vi.fn(),
      stopPattern: vi.fn(),
    },
  } as unknown as MusicRuntime;
}

async function importMidi(file: File): Promise<void> {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await vi.waitFor(() => expect(document.body.textContent).toContain("Analysis complete"));
}

describe("/music/library?tab=import", () => {
  test("renders the drop zone and header", () => {
    render(Page);
    expect(document.querySelector("h2")?.textContent).toContain("Import & Play-Along");
    expect(document.body.textContent).toContain("Drop a MIDI file");
    expect(document.querySelector('input[type="file"]')).not.toBeNull();
  });

  test("parses an imported MIDI file and shows the summary", async () => {
    render(Page);
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    Object.defineProperty(input, "files", { value: [midiFile()], configurable: true });
    input?.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => expect(document.body.textContent).toContain("Analysis complete"));
    expect(document.body.textContent).toContain("120 bpm");
    expect(document.body.textContent).toContain("Projection");
  });

  test("plays and pauses an imported score locally", async () => {
    const runtime = playbackRuntime();
    render(Page, { runtime });
    await importMidi(midiFile());

    const play = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Play",
    );
    play?.click();
    await vi.waitFor(() => expect(runtime.sound.playPattern).toHaveBeenCalled());
    await vi.waitFor(() => expect(play?.textContent).toContain("Pause"));

    play?.click();
    await vi.waitFor(() => expect(runtime.sound.stopPattern).toHaveBeenCalled());
    expect(play?.textContent).toContain("Play");
  });

  test("returns to Play after natural completion and reports enablement failure", async () => {
    const ensurePlaybackVoice = vi.fn(async () => true);
    const runtime = playbackRuntime(ensurePlaybackVoice);
    render(Page, { runtime });
    await importMidi(shortMidiFile());
    const play = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Play",
    );
    play?.click();
    await vi.waitFor(() => expect(play?.textContent).toContain("Pause"));
    await vi.waitFor(() => expect(play?.textContent).toContain("Play"), { timeout: 1_000 });
    expect(document.body.textContent).toContain("Preview complete.");

    ensurePlaybackVoice.mockResolvedValue(false);
    play?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Audio unavailable."));
    expect(play?.textContent).toContain("Play");
  });

  test("does not start a pending preview after teardown", async () => {
    let resolveVoice!: (enabled: boolean) => void;
    const ensurePlaybackVoice = vi.fn(
      () => new Promise<boolean>((resolve) => (resolveVoice = resolve)),
    );
    const runtime = playbackRuntime(ensurePlaybackVoice);
    const view = render(Page, { runtime });
    await importMidi(midiFile());
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Play")
      ?.click();
    await vi.waitFor(() => expect(ensurePlaybackVoice).toHaveBeenCalled());

    view.unmount();
    resolveVoice(true);
    await Promise.resolve();
    expect(runtime.sound.playPattern).not.toHaveBeenCalled();
    expect(runtime.sound.stopPattern).toHaveBeenCalled();
  });

  test("saves an imported MIDI file to repertoire", async () => {
    const library = { saveImportedSong: vi.fn(async () => ({ id: "song-1", title: "test" })) };
    render(Page, { library });
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    Object.defineProperty(input, "files", { value: [midiFile()], configurable: true });
    input?.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => expect(document.body.textContent).toContain("Analysis complete"));
    const save = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.includes("Save to repertoire"),
    );
    save?.click();

    await vi.waitFor(() => expect(library.saveImportedSong).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(document.body.textContent).toContain("Saved to repertoire."));
    expect(
      document.querySelector<HTMLAnchorElement>('a[href="/music/library?tab=songs"]')?.textContent,
    ).toContain("Open songs");
  });

  test("parses and saves an uncompressed MusicXML score with its source", async () => {
    const saveScore = vi.fn(async (_score: unknown, _source?: SongSource) => ({
      id: "song-xml",
      title: "XML Study",
    }));
    const library = {
      saveImportedSong: vi.fn(),
      saveScore,
    };
    render(Page, { library });
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    const file = new File([MUSIC_XML], "xml-study.musicxml", {
      type: "application/vnd.recordare.musicxml+xml",
    });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input?.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => expect(document.body.textContent).toContain("XML Study"));
    expect(document.body.textContent).toContain("MusicXML");
    const save = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.includes("Save to repertoire"),
    );
    save?.click();

    await vi.waitFor(() => expect(saveScore).toHaveBeenCalledOnce());
    expect(saveScore).toHaveBeenCalledWith(
      expect.objectContaining({ origin: "musicxml", title: "XML Study" }),
      { format: "musicxml", content: MUSIC_XML },
    );
    await vi.waitFor(() => expect(document.body.textContent).toContain("Saved to repertoire."));
  });

  test("extracts and saves a compressed MusicXML score with its source", async () => {
    const saveScore = vi.fn(async (_score: unknown, _source?: SongSource) => ({
      id: "song-mxl",
      title: "XML Study",
    }));
    render(Page, { library: { saveImportedSong: vi.fn(), saveScore } });
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    const archive = new JSZip();
    archive.file(
      "META-INF/container.xml",
      `<container><rootfiles><rootfile full-path="score.musicxml"/></rootfiles></container>`,
    );
    archive.file("score.musicxml", MUSIC_XML);
    const file = new File([await archive.generateAsync({ type: "uint8array" })], "xml-study.mxl", {
      type: "application/vnd.recordare.musicxml",
    });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input?.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => expect(document.body.textContent).toContain("XML Study"));
    const save = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.includes("Save to repertoire"),
    );
    save?.click();

    await vi.waitFor(() => expect(saveScore).toHaveBeenCalledOnce());
    expect(saveScore).toHaveBeenCalledWith(
      expect.objectContaining({ origin: "musicxml", title: "XML Study" }),
      { format: "musicxml", content: MUSIC_XML },
    );
  });
});

const MUSIC_XML = `<?xml version="1.0"?>
<score-partwise version="4.0">
  <work><work-title>XML Study</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes>
      <divisions>1</divisions>
      <time><beats>4</beats><beat-type>4</beat-type></time>
    </attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>
  </measure></part>
</score-partwise>`;
