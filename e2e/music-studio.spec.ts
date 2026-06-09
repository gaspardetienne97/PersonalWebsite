import { expect, test } from "@playwright/test";

test.describe("music studio step sequencer", () => {
  test("renders the pad rows and step grid, and toggles a step", async ({ page }) => {
    const response = await page.goto("/music/studio");
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("heading", { name: "Studio" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Kick", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Snare", exact: true })).toBeVisible();

    // The 16-step grid renders and steps are toggleable.
    const step = page.getByRole("button", { name: "808 step 1", exact: true });
    await expect(step).toBeVisible();
    await step.click();
    await expect(step).toHaveAttribute("aria-pressed", "true");
  });
});
