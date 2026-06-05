import { expect, test } from "@playwright/test";

test.describe("music rhythm workflows", () => {
  test("opens rhythm trainer from Learn and completes an on-screen pulse", async ({ page }) => {
    await page.goto("/music/learn");
    await page.getByRole("link", { name: /Rhythm Trainer/ }).click();

    await expect(page).toHaveURL("/music/learn/rhythm");
    await expect(page.getByRole("heading", { name: "Rhythm Trainer" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start Pulse" })).toBeEnabled();

    await page.getByRole("button", { name: "Start Pulse" }).click();
    await expect(page.getByRole("button", { name: "Tap beat" })).toBeVisible();

    for (let index = 0; index < 4; index += 1) {
      await page.getByRole("button", { name: "Tap beat" }).click();
    }

    await expect(page.getByText("Pulse complete")).toBeVisible();
    await expect(page.getByText(/Average timing error:/)).toBeVisible();
  });
});
