import { expect, test } from "@playwright/test";

for (const width of [1280, 375]) {
  test(`Library tabs retain their panels and URL at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/music/library?source=review#library");
    await page.getByRole("button", { name: "Reference", exact: true }).click();
    await expect(page.getByText("Chord & Scale Reference", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reference", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page).toHaveURL(/source=review&tab=reference#library$/);
    await page.reload();
    await expect(page.getByText("Chord & Scale Reference", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page.getByLabel("Score file", { exact: true })).toBeAttached();
    await page.getByRole("button", { name: "Transcribe audio", exact: true }).click();
    await expect(page.getByText("Transcription Trainer", { exact: true })).toBeVisible();
    const navigation = page.getByRole("navigation", {
      name: width < 768 ? "Music sections mobile" : "Music sections",
      exact: true,
    });
    await navigation.getByRole("link", { name: "Create", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Create", exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.getByText("Transcription Trainer", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Songs", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Song Library", exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.has("mode")).toBe(false);
  });

  test(`Create modes retain their panels and URL at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/music/create?source=review#compose");
    await page.getByRole("button", { name: "Piano roll", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Piano Roll", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Piano roll", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: "Recorder", exact: true }).focus();
    await page.keyboard.press("Space");
    await expect(page.getByText("Recording & Self-Review", { exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("mode")).toBe("recorder");
    expect(new URL(page.url()).searchParams.get("source")).toBe("review");
    await page.reload();
    await expect(page.getByText("Recording & Self-Review", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Beat grid", exact: true }).click();
    await expect(page.getByText(/^Pad bank ·/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Beat grid", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
  });
}
