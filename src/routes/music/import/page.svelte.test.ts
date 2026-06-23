import { Midi } from "@tonejs/midi";
import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

function midiFile(): File {
  const midi = new Midi();
  midi.header.setTempo(120);
  const track = midi.addTrack();
  [60, 64, 67].forEach((note, index) =>
    track.addNote({ midi: note, time: index * 0.5, duration: 0.4 }),
  );
  return new File([midi.toArray()], "test.mid", { type: "audio/midi" });
}

describe("/music/import/+page.svelte", () => {
  test("renders the drop zone and header", () => {
    render(Page);
    expect(document.querySelector("h1")?.textContent).toContain("Import & Play-Along");
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
      document.querySelector<HTMLAnchorElement>('a[href="/music/songs"]')?.textContent,
    ).toContain("Open songs");
  });
});
