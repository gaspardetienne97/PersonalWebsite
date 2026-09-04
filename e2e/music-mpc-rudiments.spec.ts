import { expect, test } from "@playwright/test";

test.describe("music MPC rudiment workflows", () => {
  test("opens MPC rudiments from Play, completes a paced run, and records it", async ({ page }) => {
    await page.goto("/music/play");
    await page.locator('section[aria-label="Play tools"] a[href="/music/play/mpc"]').click();

    await expect(page).toHaveURL(/\/music\/play\/mpc(?:\?|$)/);
    await expect(page.getByRole("heading", { name: "MPC Rudiments" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start", exact: true })).toBeEnabled();

    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    const pads = [36, 38, 36, 38, 36, 38, 36, 38];
    for (const [index, midi] of pads.entries()) {
      if (index > 0) await page.waitForTimeout(375);
      await page.getByRole("button", { name: `Pad ${midi}`, exact: true }).click();
    }

    await expect(page.getByRole("heading", { name: "Rudiment complete" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Again" }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.waitForTimeout(500);
    await page.goto("/music/track");
    await expect(page.getByText(/MPC single strokes/)).toBeVisible();
  });

  test("fits the MPC trainer at a mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/music/play/mpc");

    await expect(page.getByRole("heading", { name: "MPC Rudiments" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}
