import { expect, test } from "@playwright/test";

test.describe("music jam / improv", () => {
  test("renders the jam screen and registers a progression playback source", async ({ page }) => {
    const response = await page.goto("/music/jam");
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("heading", { name: "Jam / Improv" })).toBeVisible();

    // The transport Play button is context-aware: it plays the on-screen progression.
    await expect(page.getByRole("button", { name: "Play ii–V–I progression" })).toBeVisible();

    // Switching progression re-labels the transport Play button.
    await page.getByRole("button", { name: "12-bar blues" }).click();
    await expect(page.getByRole("button", { name: "Play 12-bar blues progression" })).toBeVisible();
  });
});
