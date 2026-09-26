// Transcribe: audio (Basic Pitch in a worker) and MIDI takes into drafts
// fixed in the piano roll, and any saved song's notes edited later.
import { expect, test, type Page } from "@playwright/test";
import { encodeWav } from "../../packages/music-core/src/io/wav";
import { expectNoHorizontalOverflow, installFakeMidi, midiNote, PORTS } from "./fixtures";

const SHOTS = "docs/screenshots/rebuild/transcribe";

/** A plucked, piano-ish tone per note: a few harmonics with a decay. */
function recording(parts: { midis: number[]; at: number; len: number }[], seconds: number) {
  const sr = 44100;
  const out = new Float32Array(Math.round(sr * seconds));
  for (const p of parts)
    for (const m of p.midis) {
      const f = 440 * 2 ** ((m - 69) / 12);
      const start = Math.round(p.at * sr);
      for (let i = 0; i < p.len * sr && start + i < out.length; i++) {
        const t = i / sr;
        const env = Math.min(1, t / 0.005) * Math.exp(-t * 2.5);
        out[start + i] +=
          (env *
            (Math.sin(2 * Math.PI * f * t) +
              0.4 * Math.sin(4 * Math.PI * f * t) +
              0.15 * Math.sin(6 * Math.PI * f * t))) /
          5;
      }
    }
  return Buffer.from(encodeWav([out], sr));
}

async function shoot(page: Page, name: string) {
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(150);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `${SHOTS}/${name}-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

test.describe("transcribe", () => {
  test.beforeEach(async ({ page }) => {
    await page.routeWebSocket(/\/\?token=|vite-hmr/, () => {});
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test("audio with chords: heard in a worker, fixed in the roll, saved, then edited from Song Studio", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/music/library?tab=import");
    await page.getByRole("button", { name: "Transcribe audio" }).click();
    await expect(
      page
        .getByRole("group", { name: "What's in the recording" })
        .getByRole("button", { name: "Chords and parts" }),
    ).toHaveAttribute("aria-pressed", "true");
    // A C major chord, then an A on its own.
    const wav = recording(
      [
        { midis: [60, 64, 67], at: 0.25, len: 1.4 },
        { midis: [69], at: 1.75, len: 1.2 },
      ],
      3.5,
    );
    await page
      .getByLabel("Audio file to transcribe")
      .setInputFiles({ name: "chord.wav", mimeType: "audio/wav", buffer: wav });
    // The listening runs off the page: progress and Cancel show, and the page still answers.
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
    expect(await page.evaluate(() => 1 + 1)).toBe(2);
    await expect(page.getByRole("heading", { name: "Draft" })).toBeVisible({ timeout: 150_000 });
    await expect(page.getByRole("status")).toContainText(/Heard \d+ notes at about \d+ BPM/);
    const roll = page.getByRole("region", { name: "Melody editor" });
    for (const m of [60, 64, 67, 69])
      await expect(roll.locator(`.note[data-note="${m}"]`).first()).toBeAttached();
    await shoot(page, "draft");

    await page.getByLabel("Title").fill("Chord and A");
    await page.getByRole("button", { name: "Save to songs" }).click();
    await expect(page.getByText("Chord and A is in your songs.")).toBeVisible();
    await page.getByRole("link", { name: "Open in Song Studio" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Chord and A" })).toBeVisible();

    // Any song's notes open in the roll to fix.
    await page.getByRole("link", { name: "Edit notes" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Edit notes" })).toBeVisible();
    await expect(page.locator("[data-save-state]")).toHaveText("Saved");
    const grid = page.getByRole("application", { name: /Note grid/ });
    await grid.focus();
    for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toContainText("Added");
    await expect(page.locator("[data-save-state]")).toHaveText("Unsaved edits");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status")).toContainText("Saved Chord and A");
    await page.reload();
    await expect(page.locator("[data-save-state]")).toHaveText("Saved");
    await shoot(page, "edit-notes");
  });

  test("a long recording can be cancelled, and the melody engine is quick", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/music/library?tab=import");
    await page.getByRole("button", { name: "Transcribe audio" }).click();
    const long = recording(
      Array.from({ length: 40 }, (_, i) => ({ midis: [60 + (i % 8)], at: i * 0.5, len: 0.45 })),
      20,
    );
    await page
      .getByLabel("Audio file to transcribe")
      .setInputFiles({ name: "long.wav", mimeType: "audio/wav", buffer: long });
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("status")).toContainText("Stopped listening");
    await expect(page.getByRole("heading", { name: "Draft" })).toHaveCount(0);

    await page
      .getByRole("group", { name: "What's in the recording" })
      .getByRole("button", { name: "One melody line" })
      .click();
    const line = recording(
      [60, 62, 64, 65].map((m, i) => ({ midis: [m], at: 0.2 + i * 0.5, len: 0.45 })),
      2.6,
    );
    await page
      .getByLabel("Audio file to transcribe")
      .setInputFiles({ name: "line.wav", mimeType: "audio/wav", buffer: line });
    await expect(page.getByRole("heading", { name: "Draft" })).toBeVisible({ timeout: 60_000 });
    const roll = page.getByRole("region", { name: "Melody editor" });
    for (const m of [60, 62, 64, 65])
      await expect(roll.locator(`.note[data-note="${m}"]`).first()).toBeAttached();
  });

  test("a MIDI take becomes a song, its tempo found from the playing", async ({ page }) => {
    await installFakeMidi(page, [PORTS.keys]);
    await page.goto("/music/record");
    await page.getByRole("button", { name: "Enable MIDI" }).click();
    await expect(page.getByText("MIDI on: Digital Piano")).toBeVisible();
    await midiNote(page, PORTS.keys.id, 72, 60, 1, 150);
    await page.getByRole("button", { name: "Record", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Recording");
    for (const n of [60, 62, 64, 65, 67, 65, 64, 62])
      await midiNote(page, PORTS.keys.id, n, 90, 1, 400);
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(/Saved Take \d: 8 notes/);

    await page.goto("/music/library?tab=import");
    await page.getByRole("button", { name: "From a MIDI take" }).click();
    await page
      .getByRole("list", { name: "MIDI takes" })
      .getByRole("button", { name: "Use this take" })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: "Draft" })).toBeVisible();
    await expect(page.getByRole("status")).toContainText(/Heard 8 notes at about \d+ BPM/);
    await expect(
      page.getByRole("region", { name: "Melody editor" }).locator(".note[data-note]"),
    ).toHaveCount(8);
    await page.getByRole("button", { name: "Save to songs" }).click();
    await expect(page.getByText(/is in your songs\./)).toBeVisible();
  });

  test("an empty roll drawn by hand saves as a song", async ({ page }) => {
    await page.goto("/music/library?tab=import");
    await page.getByRole("button", { name: "Transcribe audio" }).click();
    await page.getByRole("button", { name: "Start from an empty roll" }).click();
    const grid = page.getByRole("application", { name: /Note grid/ });
    await grid.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await expect(page.locator(".note[data-note]")).toHaveCount(2);
    await page.getByRole("button", { name: "Save to songs" }).click();
    await expect(page.getByText("My song is in your songs.")).toBeVisible();
  });
});
