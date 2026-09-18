import { expect, test } from "@playwright/test";

test("data backup restores a played take, saved score, journal and preferences in a fresh browser", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(60_000);
  await page.goto("/music/create?mode=recorder");
  await expect(page.getByRole("button", { name: "New recording", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: /^Count in:/ }).click();
  await page.getByRole("button", { name: "Off", exact: true }).click();
  await page.getByRole("button", { name: "New recording", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Stop ·/ })).toBeVisible({ timeout: 15_000 });
  for (const name of ["C4", "E4", "G4"]) {
    await page.getByRole("button", { name, exact: true }).click();
  }
  await page.getByRole("button", { name: /^Stop ·/ }).click();
  await expect(page.getByText(/^3 notes ·/)).toBeVisible();
  await page.getByRole("button", { name: "Save to Song Studio", exact: true }).click();
  await expect(page.getByText("Saved to Song Studio.", { exact: true })).toBeVisible();
  const songHref = await page
    .getByRole("link", { name: "Open Song Studio", exact: true })
    .getAttribute("href");
  expect(songHref).toBeTruthy();

  await page.goto("/music/track");
  await page.getByLabel("Journal note", { exact: true }).fill("Backup round-trip practice note");
  await page.getByRole("button", { name: "Save journal entry", exact: true }).click();
  await expect(page.getByText("Journal entry saved.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Edit entry/ }).click();
  await page.getByLabel("Next time (optional)", { exact: true }).fill("Keep the backup reflection");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Journal entry updated.", { exact: true })).toBeVisible();
  await page.goto("/music/settings");
  await expect(page.getByText("Settings loaded.", { exact: true })).toBeVisible();
  await page.getByLabel("Audio input label", { exact: true }).fill("Backup test input");
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Prepare data backup", exact: true }).click();
  await expect(page.getByText(/Audio files and sample files are not included/)).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download data backup", exact: true }).click();
  const download = await downloadEvent;
  const backupPath = testInfo.outputPath("practice-data.json");
  await download.saveAs(backupPath);

  const destination = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    viewport: { width: 375, height: 812 },
  });
  try {
    const restored = await destination.newPage();
    await restored.goto("/music/track");
    await restored.getByLabel("Journal note", { exact: true }).fill("Destination note to replace");
    await restored.getByRole("button", { name: "Save journal entry", exact: true }).click();
    await expect(restored.getByText("Journal entry saved.", { exact: true })).toBeVisible();
    await restored.goto("/music/settings");
    await expect(restored.getByText("Settings loaded.", { exact: true })).toBeVisible();
    await restored.getByLabel("Data backup file", { exact: true }).setInputFiles({
      name: "future-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ format: "practice-os-data-backup", version: 999 })),
    });
    await expect(restored.getByText(/version.*supported|unsupported.*version/i)).toBeVisible();
    await expect(restored.getByRole("button", { name: "Restore data", exact: true })).toHaveCount(
      0,
    );
    await restored.goto("/music/track");
    await expect(restored.getByText("Destination note to replace", { exact: true })).toBeVisible();
    await restored.goto("/music/settings");
    await expect(restored.getByText("Settings loaded.", { exact: true })).toBeVisible();
    await restored.getByLabel("Data backup file", { exact: true }).setInputFiles(backupPath);
    await expect(restored.getByRole("button", { name: "Restore data", exact: true })).toBeEnabled();
    await expect(
      restored.getByRole("region", { name: "Data backup review", exact: true }),
    ).toContainText("All ten Music data tables will be replaced.");
    expect(
      await restored.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await restored
      .getByRole("region", { name: "Data backup review", exact: true })
      .scrollIntoViewIfNeeded();
    await restored.screenshot({
      path: testInfo.outputPath("data-restore-mobile-review.png"),
      animations: "disabled",
    });
    await restored.setViewportSize({ width: 1280, height: 900 });
    await restored.getByRole("button", { name: "Toggle theme", exact: true }).click();
    await expect(restored.locator("html")).toHaveClass(/dark/);
    await restored
      .getByRole("region", { name: "Data backup review", exact: true })
      .scrollIntoViewIfNeeded();
    expect(
      await restored.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);
    await restored.screenshot({
      path: testInfo.outputPath("data-restore-desktop-dark.png"),
      animations: "disabled",
    });
    await restored.getByRole("button", { name: "Toggle theme", exact: true }).click();
    await restored.setViewportSize({ width: 375, height: 812 });
    const beforeRestore = await restored.evaluate(() => performance.timeOrigin);
    await restored.evaluate(
      () =>
        new Promise<void>((ready) => {
          void navigator.locks.request("music-media-library", async () => {
            ready();
            await new Promise<void>((release) => {
              (window as typeof window & { releaseRestoreLock?: () => void }).releaseRestoreLock =
                release;
            });
          });
        }),
    );
    await restored.getByRole("button", { name: "Restore data", exact: true }).click();
    await expect(restored.getByLabel("Data backup file", { exact: true })).toBeDisabled();
    await restored
      .getByRole("navigation", { name: "Music sections mobile", exact: true })
      .getByRole("link", { name: "Progress", exact: true })
      .click();
    await expect(restored).toHaveURL(/\/music\/progress$/);
    expect(await restored.evaluate(() => performance.timeOrigin)).toBe(beforeRestore);
    const reload = restored.waitForEvent("load");
    await restored.evaluate(() =>
      (window as typeof window & { releaseRestoreLock?: () => void }).releaseRestoreLock?.(),
    );
    await reload;
    expect(await restored.evaluate(() => performance.timeOrigin)).not.toBe(beforeRestore);
    await restored.goto("/music/settings");
    await expect(restored.getByLabel("Audio input label", { exact: true })).toHaveValue(
      "Backup test input",
    );
    await restored.goto("/music/track");
    await expect(
      restored.getByText("Backup round-trip practice note", { exact: true }),
    ).toBeVisible();
    await expect(
      restored.getByText("Next time: Keep the backup reflection", { exact: true }),
    ).toBeVisible();
    await expect(restored.getByText("Destination note to replace", { exact: true })).toHaveCount(0);
    await restored.goto("/music/create?mode=recorder");
    await expect(restored.getByText(/^3 notes ·/)).toBeVisible();
    await expect(restored.getByRole("button", { name: "Play Take 1", exact: true })).toBeEnabled();
    await restored.goto(songHref!);
    await expect(
      restored.getByRole("heading", { name: "Take 1", level: 1, exact: true }),
    ).toBeVisible();
  } finally {
    await destination.close();
  }
});
