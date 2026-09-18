import { expect, test, type Page } from "@playwright/test";

async function expectVisibleAnchor(page: Page) {
  await expect(page.locator(".dot-text").filter({ hasText: /^A$/ })).toBeVisible();
  await expect
    .poll(async () =>
      page
        .locator(".dot-text")
        .filter({ hasText: /^A$/ })
        .evaluate((label) => label.getBoundingClientRect().height),
    )
    .toBeGreaterThanOrEqual(10);
  const contrast = await page
    .locator(".dot-text")
    .filter({ hasText: /^A$/ })
    .evaluate((label) => {
      const circle = label.parentElement!.querySelector(".dot-circle")!;
      const context = document.createElement("canvas").getContext("2d")!;
      function luminance(color: string) {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const rgb = Array.from(context.getImageData(0, 0, 1, 1).data)
          .slice(0, 3)
          .map((channel) => {
            const value = channel / 255;
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
          });
        return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
      }
      const text = luminance(getComputedStyle(label).fill);
      const background = luminance(getComputedStyle(circle).fill);
      return (Math.max(text, background) + 0.05) / (Math.min(text, background) + 0.05);
    });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
}

test("guitar interval recall hides names, grades a fret position and restores its region", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/music/play/spider?mode=interval-recall&instrument=ukulele&interval=4&region=5");
  if (await page.locator("html").evaluate((element) => element.classList.contains("dark"))) {
    await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
  }
  await expect(page.getByRole("button", { name: "Guitar", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible({
    timeout: 15000,
  });
  const anchor = page.getByRole("button", { name: "String 1 fret 5, anchor", exact: true });
  await expect(anchor).toBeAttached();
  await expectVisibleAnchor(page);
  await expect(page.getByRole("button", { name: /fret 9, C/ })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("interval-mobile-stage.png"), fullPage: true });
  // The renderer's native keyboard layer carries exact string/fret identity.
  await page.getByRole("button", { name: "String 1 fret 9", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Interval checked", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Position and pitch: found/)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Change setup", exact: true }).click();
  await page.getByRole("button", { name: "Edit setup", exact: true }).click();
  await page.getByLabel("Interval", { exact: true }).selectOption("12");
  await page.getByLabel("Fret region", { exact: true }).selectOption("10");
  await expect(page).toHaveURL(/interval=12/);
  await expect(page).toHaveURL(/region=10/);
  await page.reload();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByRole("heading", { name: /ascending octave.*10–14/ })).toBeVisible();
  await expectVisibleAnchor(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: testInfo.outputPath("interval-desktop-stage.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Stop", exact: true }).click();
});
