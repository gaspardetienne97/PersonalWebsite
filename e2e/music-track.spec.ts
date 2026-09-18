import { expect, test } from "@playwright/test";

test.describe("music practice journal workflows", () => {
  test("saves a journal entry and reloads its optional Next time reflection", async ({
    page,
  }, testInfo) => {
    await page.goto("/music/track");

    await expect(page.getByRole("heading", { name: "Practice Journal" })).toBeVisible();
    await expect(page.getByText("This week", { exact: true })).toBeVisible();
    await expect(page.getByText("Last week", { exact: true })).toBeVisible();

    const note = `E2E journal ${crypto.randomUUID()}`;
    await page.getByLabel("Journal note").fill(note);
    await page.getByRole("button", { name: "Save journal entry" }).click();

    await expect(page.getByText(note)).toBeVisible();
    await expect(page.getByText(/free-practice/)).toBeVisible();
    await page.getByRole("button", { name: /^Edit entry/ }).click();
    await page
      .getByLabel("Next time (optional)", { exact: true })
      .fill("Start slowly with the left hand");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(
      page.getByText("Next time: Start slowly with the left hand", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("Next time: Start slowly with the left hand", { exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });
    if (!(await page.locator("html").evaluate((element) => element.classList.contains("dark")))) {
      await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
    }
    await page.screenshot({
      path: testInfo.outputPath("next-time-desktop-dark.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
    await page.setViewportSize({ width: 375, height: 812 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: /^Edit entry/ }).click();
    await expect(page.getByLabel("Next time (optional)", { exact: true })).toHaveValue(
      "Start slowly with the left hand",
    );
    await page.screenshot({
      path: testInfo.outputPath("next-time-mobile-editor.png"),
      fullPage: true,
    });
    await page.getByLabel("Next time (optional)", { exact: true }).fill("");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page.getByText("Journal entry updated.", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText(note, { exact: true })).toBeVisible();
    await expect(page.getByText(/^Next time:/)).toHaveCount(0);
  });
});
