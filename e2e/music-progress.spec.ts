import { expect, test } from "@playwright/test";

test.describe("music progress workflows", () => {
  test("shows dashboard analytics and seeded skill tree", async ({ page }) => {
    await page.goto("/music/progress");

    await expect(page.getByRole("heading", { name: "Progress" })).toBeVisible();
    await expect(page.getByText("Today's XP", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Practise next" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mastery" })).toBeVisible();
    // The mastery grid shows eight skills until expanded.
    await page.getByRole("button", { name: /^Show all \d+ skills$/ }).click();
    await expect(page.getByText("Quarter-Note Pulse")).toBeVisible();
    await expect(page.getByText(/Current estimates use a time-based heuristic/)).toBeVisible();
    await page.setViewportSize({ width: 375, height: 812 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
    // Weak spots fold into the "Practise next" list; the calendar keeps its own heading.
    await expect(page.getByText("Weak spots and today's challenge", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Streak calendar" })).toBeVisible();
  });
});
