import { expect, test } from "@playwright/test";

test.describe("music connect instruments", () => {
  test("renders device profiles, routing, and the on-screen fallback", async ({ page }) => {
    const response = await page.goto("/music/connect");
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("heading", { name: "Connect Instruments" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "MIDI devices" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Preferred source per instrument" }),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "On-screen fallback" })).toBeVisible();
  });
});
