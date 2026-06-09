import { expect, test } from "@playwright/test";

test.describe("music recording & self-review", () => {
  test("renders the take list and compare panel", async ({ page }) => {
    const response = await page.goto("/music/recording");
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("heading", { name: "Recording & Self-Review" })).toBeVisible();
    await expect(page.getByText("Compare takes")).toBeVisible();
    await expect(page.getByText(/No takes yet/i)).toBeVisible();
  });
});
