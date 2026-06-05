import { expect, test } from "@playwright/test";

test.describe("music practice journal workflows", () => {
  test("saves a free-practice journal entry", async ({ page }) => {
    await page.goto("/music/track");

    await expect(page.getByRole("heading", { name: "Practice Journal" })).toBeVisible();
    await expect(page.getByText("This week", { exact: true })).toBeVisible();
    await expect(page.getByText("Last week", { exact: true })).toBeVisible();

    const note = `E2E journal ${crypto.randomUUID()}`;
    await page.getByLabel("Journal note").fill(note);
    await page.getByRole("button", { name: "Save journal entry" }).click();

    await expect(page.getByText(note)).toBeVisible();
    await expect(page.getByText(/free-practice/)).toBeVisible();
  });
});
