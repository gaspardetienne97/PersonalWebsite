import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import JSZip from "jszip";

test.describe("music studio step sequencer", () => {
  test("renders the pad rows and step grid, and toggles a step", async ({ page }) => {
    const response = await page.goto("/music/create");
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("heading", { name: "Studio" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Kick", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Snare", exact: true })).toBeVisible();

    // The 16-step grid renders and steps are toggleable.
    const step = page.getByRole("button", { name: "808 step 1", exact: true });
    await expect(step).toBeVisible();
    await step.click();
    await expect(step).toHaveAttribute("aria-pressed", "true");
  });

  test("creates a persistent sample kit and exports it as an MPC ZIP", async ({ page }) => {
    await page.goto("/music/create");

    // Create a kit.
    await page.getByRole("button", { name: "New kit" }).click();
    await page.locator("#new-kit-name").fill("E2E Kit");
    await page.getByRole("button", { name: "Create kit" }).click();

    // Import three one-shot samples as generated PCM WAV buffers.
    await page.locator("#import-samples").setInputFiles([
      { name: "kick.wav", mimeType: "audio/wav", buffer: wavFixture(1000) },
      { name: "snare.wav", mimeType: "audio/wav", buffer: wavFixture(-1000) },
      { name: "closed-hat.wav", mimeType: "audio/wav", buffer: wavFixture(500) },
    ]);

    // Deterministic Bank A mapping: kick -> 36 (pad 1), snare -> 38 (pad 3),
    // closed hat -> 42 (pad 7).
    await expect(page.getByRole("button", { name: /Pad A1,.*Kick/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Pad A3,.*Snare/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Pad A7,.*Closed Hat/i })).toBeVisible();

    // Activate and audition.
    await page.getByRole("button", { name: "Activate kit" }).click();
    await page.getByRole("button", { name: /Pad A1,.*Kick/i }).click();

    // Sequence and play/stop.
    await page.getByRole("button", { name: "Kick step 2", exact: true }).click();
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.getByRole("button", { name: "Pause", exact: true }).click();

    // Metadata survives a reload (OPFS + settings, no DB migration).
    await page.reload();
    await expect(page.getByRole("button", { name: /Pad A1,.*Kick/i })).toBeVisible();

    // Download the MPC ZIP and inspect its structure.
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download ZIP" }).click();
    const download = await downloadPromise;
    const archivePath = await download.path();
    const archive = await JSZip.loadAsync(readFileSync(archivePath));
    const names = Object.keys(archive.files);
    expect(names.some((name) => name.endsWith(".xpm"))).toBe(true);
    expect(names.some((name) => /Samples\/036-kick\.wav$/i.test(name))).toBe(true);

    // No page-level horizontal overflow on a phone viewport.
    await page.setViewportSize({ width: 375, height: 812 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  });
});

/** A valid 16-bit mono 44.1kHz PCM WAV with one sample frame. */
function wavFixture(sample: number): Buffer {
  const buffer = Buffer.alloc(46);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(38, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(44_100, 24);
  buffer.writeUInt32LE(88_200, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(2, 40);
  buffer.writeInt16LE(sample, 44);
  return buffer;
}
