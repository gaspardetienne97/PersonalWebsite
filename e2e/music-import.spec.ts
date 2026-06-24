import { expect, test } from "@playwright/test";
import * as TonejsMidi from "@tonejs/midi";

const Midi: typeof TonejsMidi.Midi =
  (TonejsMidi as { Midi?: typeof TonejsMidi.Midi }).Midi ??
  (TonejsMidi as unknown as { default: { Midi: typeof TonejsMidi.Midi } }).default.Midi;

test.describe("music import & play-along", () => {
  // Regression guard: @tonejs/midi is CJS and once 500'd the SSR of this route
  // (named `import { Midi }` is not resolvable under server ESM). The page must
  // render server-side.
  test("renders the import screen without a server error", async ({ page }) => {
    const response = await page.goto("/music/import");
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("heading", { name: "Import & Play-Along" })).toBeVisible();
    await expect(page.getByText("Drop a score file, or browse", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Score file")).toBeAttached();
  });

  test("saves an imported MIDI file and logs repertoire practice", async ({ page }) => {
    const midi = new Midi();
    midi.header.setTempo(120);
    const track = midi.addTrack();
    [60, 64, 67].forEach((note, index) =>
      track.addNote({ midi: note, time: index * 0.5, duration: 0.4 }),
    );

    await page.goto("/music/import");
    await page.setInputFiles('input[type="file"]', {
      name: "autumn-test.mid",
      mimeType: "audio/midi",
      buffer: Buffer.from(midi.toArray()),
    });

    await expect(page.getByText("Analysis complete")).toBeVisible();
    await page.getByRole("button", { name: "Save to repertoire" }).click();
    await expect(page.getByText("Saved to repertoire.")).toBeVisible();

    await page.getByRole("link", { name: "Open songs" }).click();
    await expect(page.getByRole("heading", { name: "Song Library" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open autumn-test" })).toBeVisible();
    await page.getByRole("button", { name: /Log practice/ }).click();
    await expect(page.getByText("Song practice logged.")).toBeVisible();

    await page.getByRole("link", { name: "Open Song Studio" }).click();
    await expect(page).toHaveURL(/\/music\/songs\/song-/);
    await expect(page.getByRole("heading", { name: "autumn-test", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Start follow-along" }).click();
    for (const note of ["C4", "E4", "G4"]) {
      await page.getByRole("button", { name: note, exact: true }).click();
    }
    await expect(page.getByRole("heading", { name: "Score complete" })).toBeVisible();
    await page.setViewportSize({ width: 375, height: 812 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });

  test("imports MusicXML and renders it with OSMD in Song Studio", async ({ page }) => {
    await page.goto("/music/import");
    await page.setInputFiles('input[type="file"]', {
      name: "xml-study.musicxml",
      mimeType: "application/vnd.recordare.musicxml+xml",
      buffer: Buffer.from(MUSIC_XML),
    });

    await expect(page.getByRole("heading", { name: "XML Study" })).toBeVisible();
    await page.getByRole("button", { name: "Save to repertoire" }).click();
    await expect(page.getByText("Saved to repertoire.")).toBeVisible();

    await page.getByRole("link", { name: "Open songs" }).click();
    await page.getByRole("link", { name: "Open Song Studio" }).click();
    await expect(page.getByRole("heading", { name: "XML Study", level: 1 })).toBeVisible();
    await expect(page.getByLabel("MusicXML score").locator("svg")).toBeVisible();

    await page.getByRole("button", { name: "Start follow-along" }).click();
    for (const note of ["C4", "E4", "G4"]) {
      await page.getByRole("button", { name: note, exact: true }).click();
    }
    await expect(page.getByRole("heading", { name: "Score complete" })).toBeVisible();

    await page.setViewportSize({ width: 375, height: 812 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
});

const MUSIC_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>XML Study</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes>
      <divisions>1</divisions>
      <key><fifths>0</fifths></key>
      <time><beats>4</beats><beat-type>4</beat-type></time>
      <clef><sign>G</sign><line>2</line></clef>
    </attributes>
    <direction><sound tempo="100"/></direction>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
    <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
    <note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><type>half</type></note>
  </measure></part>
</score-partwise>`;
