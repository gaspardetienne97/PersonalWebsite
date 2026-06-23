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
    await expect(page.getByText("Drop a MIDI file, or browse", { exact: true })).toBeVisible();
    await expect(page.getByLabel("MIDI file")).toBeAttached();
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
  });
});
