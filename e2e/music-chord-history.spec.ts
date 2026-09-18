import { expect, test } from "@playwright/test";

test("one-minute chord history persists the selected pair and observed input", async ({
  page,
}, testInfo) => {
  test.setTimeout(100_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(
    "/music/play/chord-perfect?mode=changes&instrument=guitar&shape=guitar.c-major&to=guitar.g-major&timed=1",
  );
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeEnabled();
  if (await page.locator("html").evaluate((element) => element.classList.contains("dark"))) {
    await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
  }
  await page.getByRole("button", { name: /^Count in:/ }).click();
  await page.getByRole("button", { name: "Off", exact: true }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByTestId("change-clock")).toHaveText("60s timed run", { timeout: 15_000 });
  // Use the fretboard's real keyboard controls, preserving the shared input path.
  for (const [string, fret] of [
    [5, 3],
    [4, 2],
    [3, 0],
    [2, 1],
    [1, 0],
  ]) {
    await page.getByRole("button", { name: new RegExp(`^String ${string} fret ${fret},`) }).focus();
    await page.keyboard.press("Enter");
  }
  await expect(page.getByRole("button", { name: "Again", exact: true })).toBeVisible({
    timeout: 65_000,
  });
  const history = page.getByRole("region", { name: "Chord-pair history", exact: true });
  await expect(history.getByRole("listitem")).toHaveCount(1);
  await expect(history).toContainText("1 changes/min");
  await expect(history).toContainText("On-screen");
  await expect(history).toContainText("Guided");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: testInfo.outputPath("chord-history-mobile-summary.png"),
    fullPage: true,
  });

  await page.reload();
  await expect(history.getByRole("listitem")).toHaveCount(1);
  await expect(history).toContainText("1 changes/min");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: testInfo.outputPath("chord-history-desktop-reloaded.png"),
    fullPage: true,
  });
  await page.getByLabel("To chord", { exact: true }).selectOption("guitar.d-major");
  await expect(history.getByRole("listitem")).toHaveCount(0);
  await page.getByLabel("To chord", { exact: true }).selectOption("guitar.g-major");
  await expect(history.getByRole("listitem")).toHaveCount(1);
});
