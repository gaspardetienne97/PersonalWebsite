import { expect, test } from "@playwright/test";

test.describe("music progress workflows", () => {
  test("opens on What next and switches to Skills and Sessions", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/music/progress");

    await expect(page.getByRole("heading", { name: "Progress", exact: true })).toBeVisible();
    // C is the default landing view.
    await expect(page.getByRole("button", { name: "What next", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("region", { name: "What to practise next" })).toBeVisible();
    await expect(page.getByText(/^Practise next ·/)).toBeVisible();
    await expect(page.getByRole("list", { name: "Today's routine" })).toBeVisible();
    await expect(page.getByRole("button", { name: "20", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    for (const list of ["Falling", "Holding", "Not measured yet"]) {
      await expect(page.getByRole("heading", { name: list, exact: true })).toBeVisible();
    }
    await expect(
      page.getByText("Fewer than five unaided attempts: no verdict, only an invitation."),
    ).toBeVisible();
    // The XP ring has left the hero; it returns as "practice points" in Sessions.
    await expect(page.getByText("Today's XP", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Skills", exact: true }).click();
    await expect(page.getByRole("region", { name: "Skill estimates" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /skills$/ })).toBeVisible();
    await expect(page.getByTestId("skill-row").first()).toBeVisible();
    // Every skill has a row: no "show all" step, and the legend explains the bar.
    await expect(page.getByText("Quarter-Note Pulse")).toBeVisible();
    await expect(page.getByText("Review due, dropped 10+ points")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Reading the estimate" })).toBeVisible();
    await expect(page.getByText(/Skill map ·/)).toBeVisible();
    expect(new URL(page.url()).searchParams.get("view")).toBe("skills");

    await page.getByRole("button", { name: "Sessions", exact: true }).click();
    await expect(page.getByRole("region", { name: "Practice sessions" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Journal", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "This week", exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: /minutes this week/ })).toBeVisible();
    await expect(page.getByText("Practice points", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Streak calendar" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Daily challenges" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Achievements" })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("view")).toBe("sessions");

    // Leaving and coming back lands on the same view.
    await page
      .getByRole("navigation", { name: "Music sections", exact: true })
      .getByRole("link", { name: "Create", exact: true })
      .click();
    await expect(page.getByRole("heading", { name: "Create", exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Journal", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sessions", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  for (const view of ["next", "skills", "sessions"]) {
    test(`?view=${view} opens that view at 375px with no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(`/music/progress?view=${view}`);

      const region = {
        next: "What to practise next",
        skills: "Skill estimates",
        sessions: "Practice sessions",
      }[view]!;
      await expect(page.getByRole("region", { name: region })).toBeVisible();
      // The streak and the week bars stay in the header row of every view.
      await expect(page.getByText("Streak", { exact: true })).toBeVisible();
      await expect(page.getByRole("img", { name: /XP this week/ })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(1);
    });
  }
});
