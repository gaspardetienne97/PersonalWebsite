import { expect, test } from "@playwright/test";

test.describe("music jam / improv", () => {
  test("renders local backing controls", async ({ page }) => {
    const response = await page.goto("/music/jam");
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("heading", { name: "Jam / Improv" })).toBeVisible();

    await expect(page.getByRole("button", { name: "Play backing" })).toBeVisible();
    await expect(page.locator("[data-practice-controls]")).toBeVisible();
    await expect(page.getByRole("button", { name: /Play .* progression/ })).toHaveCount(0);
  });
});
