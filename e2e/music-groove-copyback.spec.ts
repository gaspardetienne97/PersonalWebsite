import { expect, test, type Page } from "@playwright/test";

async function expectNoOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
}

test("groove recall hides targets, finishes an empty bar, and restores custom setup", async ({
  page,
}, testInfo) => {
  test.setTimeout(45000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/music/play/mpc?mode=groove&groove=backbeat&bpm=120");
  await expect(page.getByRole("button", { name: "Groove copy-back", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  if (await page.locator("html").evaluate((element) => element.classList.contains("dark"))) {
    await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
  }
  await page.getByRole("button", { name: /^Count in:/ }).click();
  await page.getByRole("button", { name: "Off", exact: true }).click();
  // The closing portal retains its desktop position until its exit animation finishes.
  await expect(page.locator('[data-slot="popover-content"]')).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByRole("table", { name: "Expected groove" })).toHaveCount(0);
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("groove-mobile-listen.png"), fullPage: true });
  await expect(page.getByRole("heading", { name: "Groove complete", exact: true })).toBeVisible({
    timeout: 15000,
  });
  await expect(
    page.getByText("0 matched · 4 missed · 0 extra. Timing uses matched hits only.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("table", { name: "Expected groove" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Count in: Off", exact: true })).toBeVisible();
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("groove-mobile-summary.png"), fullPage: true });

  await page.getByRole("button", { name: "Again", exact: true }).click();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeEnabled();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
  await page.getByRole("button", { name: "Syncopated kick", exact: true }).click();
  await page.getByRole("button", { name: "Edit setup", exact: true }).click();
  await page.getByLabel("Kick pad", { exact: true }).selectOption("37");
  await expect(page).toHaveURL(/groove=syncopated/);
  await expect(page).toHaveURL(/kick=37/);
  await page.reload();
  await expect(page.getByRole("button", { name: "Syncopated kick", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(
    page.getByText("Your turn. Copy the groove for one bar.", { exact: true }).first(),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("table", { name: "Expected groove" })).toHaveCount(0);
  await page.getByRole("button", { name: "Pad 37", exact: true }).click();
  await expectNoOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("groove-desktop-response.png"),
    fullPage: true,
  });
  await expect(page.getByRole("heading", { name: "Groove complete", exact: true })).toBeVisible({
    timeout: 10000,
  });
  await expect(page.getByText(/Velocity: Not measured/)).toBeVisible();
  await page.goto("/music/track");
  await expect(page.getByText(/MPC groove/).first()).toBeVisible();
});
