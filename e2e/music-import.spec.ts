import { expect, test } from "@playwright/test";

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
});
