import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import JSZip from "jszip";

test("full backup restores a saved song, MIDI take, backing and sample bytes in a fresh browser", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.goto("/music/record");
  await expect(page.getByRole("button", { name: "New recording", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: /^Count in:/ }).click();
  await page.getByRole("button", { name: "Off", exact: true }).click();
  await page.getByRole("button", { name: "New recording", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Stop ·/ })).toBeVisible({ timeout: 15_000 });
  for (const name of ["C4", "E4", "G4"])
    await page.getByRole("button", { name, exact: true }).click();
  await page.getByRole("button", { name: /^Stop ·/ }).click();
  await expect(page.getByText(/^3 notes ·/)).toBeVisible();
  await page.getByRole("button", { name: "Save to Song Studio", exact: true }).click();
  await expect(page.getByText("Saved to Song Studio.", { exact: true })).toBeVisible();
  const songHref = await page
    .getByRole("link", { name: "Open Song Studio", exact: true })
    .getAttribute("href");
  expect(songHref).toBeTruthy();

  const wav = wavFixture();
  await page.goto("/music/create");
  await page.getByRole("button", { name: "New kit", exact: true }).click();
  await page.locator("#new-kit-name").fill("Full backup kit");
  await page.getByRole("button", { name: "Create kit", exact: true }).click();
  await page
    .locator("#import-samples")
    .setInputFiles({ name: "kick.wav", mimeType: "audio/wav", buffer: wav });
  await expect(page.getByRole("button", { name: /Pad A01\b.*Kick/i })).toBeVisible();
  await page.goto("/music/play");
  await page.getByRole("button", { name: "Imported backing", exact: true }).click();
  await page
    .getByLabel("Import MP3 or WAV", { exact: true })
    .setInputFiles({ name: "backup-loop.wav", mimeType: "audio/wav", buffer: wav });
  await expect(
    page.getByRole("button", { name: /Use imported backing backup-loop/ }),
  ).toBeVisible();
  await page.goto("/music/settings");
  await page.getByRole("button", { name: "Prepare full backup", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Download full backup", exact: true }),
  ).toBeEnabled();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download full backup", exact: true }).click();
  const backupPath = testInfo.outputPath("practice-full.zip");
  await (await downloadEvent).saveAs(backupPath);
  const archive = await JSZip.loadAsync(readFileSync(backupPath));
  const manifest = JSON.parse(await archive.file("manifest.json")!.async("string"));
  expect(manifest.assets).toHaveLength(2);
  const digest = createHash("sha256").update(wav).digest("hex");
  for (const asset of manifest.assets) {
    expect(asset.sha256).toBe(digest);
    expect(await archive.file(asset.path)!.async("nodebuffer")).toEqual(wav);
  }

  const destination = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    viewport: { width: 375, height: 812 },
  });
  try {
    const restored = await destination.newPage();
    await restored.goto("/music/track");
    await restored
      .getByLabel("Journal note", { exact: true })
      .fill("Keep this until restore succeeds");
    await restored.getByRole("button", { name: "Save journal entry", exact: true }).click();
    await expect(restored.getByText("Journal entry saved.", { exact: true })).toBeVisible();
    await restored.goto("/music/settings");
    const corrupt = await JSZip.loadAsync(readFileSync(backupPath), { createFolders: false });
    corrupt.file(manifest.assets[0].path, Buffer.alloc(wav.length), { createFolders: false });
    await restored.getByLabel("Full backup file", { exact: true }).setInputFiles({
      name: "corrupt.zip",
      mimeType: "application/zip",
      buffer: await corrupt.generateAsync({ type: "nodebuffer" }),
    });
    await expect(
      restored.getByRole("alert").filter({ hasText: /SHA-256 mismatch/i }),
    ).toBeVisible();
    await expect(
      restored.getByRole("button", { name: "Restore full backup", exact: true }),
    ).toHaveCount(0);
    await restored.goto("/music/track");
    await expect(
      restored.getByText("Keep this until restore succeeds", { exact: true }),
    ).toBeVisible();
    await restored.goto("/music/settings");
    await restored.getByLabel("Full backup file", { exact: true }).setInputFiles(backupPath);
    const review = restored.getByRole("region", { name: "Full backup review", exact: true });
    await expect(review).toBeVisible();
    await expect(
      restored.getByRole("button", { name: "Restore full backup", exact: true }),
    ).toBeEnabled();
    expect(
      await restored.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);
    await review.scrollIntoViewIfNeeded();
    await restored.screenshot({
      path: testInfo.outputPath("full-restore-mobile-review.png"),
      animations: "disabled",
    });
    await restored.setViewportSize({ width: 1280, height: 900 });
    await restored.getByRole("button", { name: "Toggle theme", exact: true }).click();
    await expect(restored.locator("html")).toHaveClass(/dark/);
    await review.scrollIntoViewIfNeeded();
    expect(
      await restored.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);
    await restored.screenshot({
      path: testInfo.outputPath("full-restore-desktop-dark.png"),
      animations: "disabled",
    });
    const before = await restored.evaluate(() => performance.timeOrigin);
    const reload = restored.waitForEvent("load");
    await restored.getByRole("button", { name: "Restore full backup", exact: true }).click();
    await reload;
    expect(await restored.evaluate(() => performance.timeOrigin)).not.toBe(before);
    await restored.getByRole("button", { name: "Prepare full backup", exact: true }).click();
    await expect(
      restored.getByRole("button", { name: "Download full backup", exact: true }),
    ).toBeEnabled();
    const restoredDownload = restored.waitForEvent("download");
    await restored.getByRole("button", { name: "Download full backup", exact: true }).click();
    const restoredZip = await JSZip.loadAsync(readFileSync(await (await restoredDownload).path()));
    const restoredManifest = JSON.parse(await restoredZip.file("manifest.json")!.async("string"));
    expect(restoredManifest.assets).toEqual(manifest.assets);
    for (const asset of restoredManifest.assets)
      expect(await restoredZip.file(asset.path)!.async("nodebuffer")).toEqual(wav);

    await restored.goto("/music/track");
    await expect(
      restored.getByText("Keep this until restore succeeds", { exact: true }),
    ).toHaveCount(0);
    await restored.goto("/music/record");
    await expect(restored.getByText(/^3 notes ·/)).toBeVisible();
    await expect(restored.getByRole("button", { name: "Play Take 1", exact: true })).toBeEnabled();
    await restored.goto(songHref!);
    await expect(
      restored.getByRole("heading", { name: "Take 1", level: 1, exact: true }),
    ).toBeVisible();
    await restored.goto("/music/play");
    await restored.getByRole("button", { name: "Imported backing", exact: true }).click();
    await expect(
      restored.getByRole("button", { name: /Use imported backing backup-loop/ }),
    ).toBeVisible();
    await restored.goto("/music/create");
    await expect(restored.getByRole("button", { name: /Pad A01\b.*Kick/i })).toBeVisible();
    await restored.getByRole("button", { name: "Activate kit", exact: true }).click();
    await restored.getByRole("button", { name: /Pad A01\b.*Kick/i }).click();
    const kitDownload = restored.waitForEvent("download");
    await restored.getByRole("button", { name: "Download ZIP", exact: true }).click();
    const kit = await JSZip.loadAsync(readFileSync(await (await kitDownload).path()));
    const sample = Object.values(kit.files).find((entry) =>
      /Samples\/036-kick\.wav$/i.test(entry.name),
    );
    expect(sample).toBeDefined();
    expect(await sample!.async("nodebuffer")).toEqual(wav);
  } finally {
    await destination.close();
  }
});

function wavFixture(): Buffer {
  const frames = 4410;
  const buffer = Buffer.alloc(44 + frames * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(44100, 24);
  buffer.writeUInt32LE(88200, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++)
    buffer.writeInt16LE(Math.round(1000 * Math.sin((i * 2 * Math.PI * 220) / 44100)), 44 + i * 2);
  return buffer;
}
