import { expect, test } from "@playwright/test";

test.describe("music daily routine", () => {
  test("launches from Home and opens the first real drill", async ({ page }) => {
    // The routine lives inline on the Practice home (TodayPlan); /music/routine is gone.
    await page.goto("/music");
    await page.getByRole("button", { name: "Start routine" }).click();

    // Decision 7: Start routine navigates to the first step.
    // The drill appends its own config to the query, so match the prefix only.
    await expect(page).toHaveURL(/\/music\/learn\/ear\?routine=1/);
    await expect(page.getByRole("heading", { name: "Ear Training" })).toBeVisible();

    // Back on Today (client-side, so the in-memory routine survives) the card
    // shows the current step with one Continue button.
    await page.getByRole("link", { name: "Practice", exact: true }).first().click();
    await expect(page).toHaveURL(/\/music(?:\?|$)/);
    await expect(page.getByText("Up first")).toBeVisible();
    await expect(page.getByRole("link", { name: "Continue routine" })).toHaveAttribute(
      "href",
      "/music/learn/ear?routine=1",
    );
  });
});
