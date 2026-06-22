import { expect, test } from "@playwright/test";

test.describe("music daily routine", () => {
  test("launches from Home and opens the first real drill", async ({ page }) => {
    await page.goto("/music");
    await page.getByRole("link", { name: /Start daily routine/ }).click();

    await expect(page.getByRole("heading", { name: "Daily Routine" })).toBeVisible();
    await page.getByRole("button", { name: "Start routine" }).click();

    await expect(page.getByText("Up first")).toBeVisible();
    await expect(page.getByRole("link", { name: "Start Ear Training" })).toHaveAttribute(
      "href",
      "/music/learn/ear?routine=1",
    );
  });
});
