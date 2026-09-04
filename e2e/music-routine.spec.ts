import { expect, test } from "@playwright/test";

test.describe("music daily routine", () => {
  test("launches from Home and opens the first real drill", async ({ page }) => {
    // The routine lives inline on the Practice home (TodayPlan); /music/routine is gone.
    await page.goto("/music");
    await page.getByRole("button", { name: "Start routine" }).click();

    await expect(page.getByText("Up first")).toBeVisible();
    await expect(page.getByRole("link", { name: "Start Ear Training" })).toHaveAttribute(
      "href",
      "/music/learn/ear?routine=1",
    );
  });
});
