import { expect, test } from "@playwright/test";

test.describe("music progress workflows", () => {
  test("shows dashboard analytics and seeded skill tree", async ({ page }) => {
    await page.goto("/music/progress");

    await expect(page.getByRole("heading", { name: "Dashboard & Skill Tree" })).toBeVisible();
    await expect(page.getByText("Today's XP")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Practice next" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mastery rings" })).toBeVisible();
    await expect(page.getByText("Quarter-Note Pulse")).toBeVisible();
    await expect(page.getByText("Weak spots", { exact: true })).toBeVisible();
    await expect(page.getByText("Streak calendar", { exact: true })).toBeVisible();
  });
});
