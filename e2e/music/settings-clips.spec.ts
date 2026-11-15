// Test recordings (/music/clips): reached from Settings, the grid of 42 clips,
// a clip shown on its instrument, and one take recorded through two inputs at
// once into a folder. Chromium's fake devices stand in for the microphones and
// the origin's private file system stands in for the picked folder.
import { expect, test, type Page } from "@playwright/test";
import { muteHmr } from "./fixtures";

test.use({
  launchOptions: {
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  },
});

const FOLDER = "clips-e2e";

/** The folder picker hands back a folder in the origin's private file system. */
async function fakeFolder(page: Page) {
  await page.addInitScript((name) => {
    (window as any).showDirectoryPicker = async () =>
      (await navigator.storage.getDirectory()).getDirectoryHandle(name, { create: true });
  }, FOLDER);
}

const openClip = (page: Page, n: string) =>
  page
    .getByTestId("clips-grid")
    .getByRole("button", { name: new RegExp(`^${n} `) })
    .click();

test.describe("Test recordings", () => {
  test.beforeEach(async ({ page }) => {
    await muteHmr(page);
  });

  test("Settings links to the page, the grid lists 42 clips and each kind of clip shows on its instrument", async ({
    page,
  }) => {
    await page.goto("/music/settings");
    await page.getByRole("link", { name: "Record test clips" }).click();
    await expect(page).toHaveURL(/\/music\/clips/);
    await expect(page.getByRole("heading", { level: 1, name: "Test recordings" })).toBeVisible();

    const grid = page.getByTestId("clips-grid");
    await expect(grid.locator("th[scope=row]")).toHaveCount(42);
    for (const section of ["Room", "Guitar", "Ukulele", "Piano", "Aerophone", "Voice"])
      await expect(grid.locator("th[scope=rowgroup]", { hasText: section })).toBeVisible();

    const panel = page.getByTestId("clip-panel");
    // A chord: its box, with the fingering.
    await openClip(page, "05");
    await expect(panel.getByRole("heading", { level: 2 })).toContainText("G chord, 320003");
    await expect(panel).toContainText("target length 10 s");
    await expect(panel.getByRole("img", { name: "Guitar G chord shape" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Hear it" })).toBeVisible();
    await expect(page).toHaveURL(/clip=5/);

    // A strum pattern: the row of beats, and a click meant for headphones.
    await openClip(page, "15");
    const strum = panel.getByRole("list", { name: "Strumming, one bar" });
    await expect(strum.getByRole("listitem")).toHaveCount(8);
    await expect(strum).toContainText("2: down");
    await expect(strum).toContainText("&: up");
    await expect(panel.getByRole("button", { name: "Metronome, 80 BPM" })).toBeVisible();
    await expect(panel).toContainText("Wear headphones for the click");

    // The two clips that test the click itself say speakers.
    await openClip(page, "02");
    await expect(panel).toContainText("Play the click through the speakers");
    await openClip(page, "16");
    await expect(panel).toContainText("Play the click through the speakers");

    // Notes on the neck, the piano and the Aerophone.
    await openClip(page, "18");
    await expect(panel.getByRole("group", { name: /Guitar fretboard/ })).toBeVisible();
    await openClip(page, "33");
    await expect(panel.getByRole("group", { name: "Piano keys for this clip" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Step 4: Am" })).toBeVisible();
    await openClip(page, "37");
    await expect(panel.getByRole("img", { name: /^Fingering for C4/ })).toBeVisible();
    await panel.getByRole("button", { name: "Step 5: G4" }).click();
    await expect(panel.getByRole("img", { name: /^Fingering for G4/ })).toBeVisible();
    await openClip(page, "41");
    await expect(panel.getByRole("button", { name: "Step 1: do" })).toBeVisible();

    // No input ticked: nothing to record yet.
    await expect(panel.getByRole("button", { name: /^Record/ })).toBeDisabled();
  });

  test("one take records every ticked input at once and saves WAV files, a manifest and notes", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await fakeFolder(page);
    await page.goto("/music/clips?clip=5");
    const inputs = page.getByTestId("clip-inputs");
    // The inputs list once the browser has allowed the microphone (the fake prompt may already have).
    const allow = page.getByRole("button", { name: "Allow microphone" });
    await expect(allow.or(inputs.getByRole("checkbox").first())).toBeVisible();
    if (await allow.isVisible()) await allow.click();
    await inputs.getByRole("checkbox", { name: "Fake Audio Input 1" }).check();
    await inputs.getByRole("checkbox", { name: "Fake Audio Input 2" }).check();
    await expect(inputs.getByRole("meter")).toHaveCount(2);
    await expect(inputs).toContainText("fake-audio-input-1");

    await page.getByRole("button", { name: "Choose folder" }).click();
    await expect(page.getByTestId("clip-folder-name")).toHaveText(FOLDER);

    // Space starts every input: Wait, then Play after the second of silence.
    const stage = page.getByTestId("clip-stage");
    await page.keyboard.press("Space");
    await expect(stage).toHaveAttribute("data-phase", "recording");
    await expect(page.getByTestId("clip-cue")).toHaveText("Wait");
    await expect(page.getByTestId("clip-cue")).toHaveText("Play", { timeout: 3000 });
    // Both inputs stay ticked: Space on a focused checkbox records, it never unticks.
    await expect(inputs.getByRole("checkbox", { name: "Fake Audio Input 2" })).toBeChecked();
    await page.waitForTimeout(1200);
    await page.keyboard.press("Space");
    await expect(stage).toHaveAttribute("data-phase", "review");
    await expect(page.getByTestId("clip-take")).toHaveCount(2);

    await stage.getByRole("button", { name: /^Save take/ }).click();
    await expect(page.getByTestId("clip-status")).toContainText("Take saved: 05-guitar-g.wav");
    // Saved, and on to the next clip.
    await expect(page.getByTestId("clip-panel").getByRole("heading", { level: 2 })).toContainText(
      "320033",
    );
    const grid = page.getByTestId("clips-grid");
    await expect(grid.locator("[data-done]")).toHaveCount(2);
    await expect(
      grid.getByRole("button", { name: "Clip 05, G chord, 320003, Fake Audio Input 1: saved" }),
    ).toBeVisible();

    await page.getByText("Notes for the whole set").click();
    await page.getByLabel("Piano model").fill("Upright in the hall");
    await expect(page.getByTestId("clip-folder")).toContainText("Notes saved to notes.json.");

    const saved = await page.evaluate(async (name) => {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(name);
      const text = async (f: string) => (await (await dir.getFileHandle(f)).getFile()).text();
      const sub = await dir.getDirectoryHandle("fake-audio-input-2");
      const wav = await (await sub.getFileHandle("05-guitar-g.wav")).getFile();
      const v = new DataView(await wav.arrayBuffer());
      const tag = (at: number) =>
        String.fromCharCode(
          v.getUint8(at),
          v.getUint8(at + 1),
          v.getUint8(at + 2),
          v.getUint8(at + 3),
        );
      return {
        manifest: JSON.parse(await text("manifest.json")),
        notes: JSON.parse(await text("notes.json")),
        wav: {
          size: wav.size,
          riff: tag(0),
          format: v.getUint16(20, true),
          channels: v.getUint16(22, true),
          rate: v.getUint32(24, true),
          bits: v.getUint16(34, true),
          frames: v.getUint32(46, true),
          dataBytes: v.getUint32(54, true),
        },
      };
    }, FOLDER);

    expect(saved.manifest.takes).toHaveLength(2);
    const take = saved.manifest.takes.find(
      (t: { inputSlug: string }) => t.inputSlug === "fake-audio-input-2",
    );
    expect(take).toMatchObject({
      file: "fake-audio-input-2/05-guitar-g.wav",
      clip: 5,
      title: "G chord, 320003",
      inputLabel: "Fake Audio Input 2",
    });
    expect(take.durationSec).toBeGreaterThan(2);
    expect(take.durationSec).toBeLessThan(8);
    expect(typeof take.peakDbfs).toBe("number");
    expect(Date.parse(take.recordedAt)).toBeGreaterThan(0);
    // 32-bit float, at the input's own rate, every channel, as long as the manifest says.
    expect(saved.wav).toMatchObject({
      riff: "RIFF",
      format: 3,
      bits: 32,
      rate: take.sampleRate,
      channels: take.channels,
    });
    expect(saved.wav.frames / take.sampleRate).toBeCloseTo(take.durationSec, 2);
    expect(saved.wav.dataBytes).toBe(saved.wav.frames * take.channels * 4);
    expect(saved.wav.size).toBe(58 + saved.wav.dataBytes);
    expect(saved.notes.pianoModel).toBe("Upright in the hall");

    // A reload reads the folder again: the takes are still marked, and recording over one asks first.
    await page.goto("/music/clips?clip=5");
    await expect(page.getByTestId("clip-folder-name")).toHaveText(FOLDER);
    await expect(page.getByTestId("clips-grid").locator("[data-done]")).toHaveCount(2);
    await expect(page.getByLabel("Piano model")).toHaveValue("Upright in the hall");
    await expect(page.getByTestId("clip-inputs").getByRole("meter")).toHaveCount(2);
    await page.keyboard.press("Space");
    await expect(stage).toHaveAttribute("data-phase", "confirm");
    await expect(stage).toContainText(
      "already saved for Fake Audio Input 1 and Fake Audio Input 2",
    );
    await page.keyboard.press("Escape");
    await expect(stage).toHaveAttribute("data-phase", "idle");
  });
});
