import { expect, test } from "@playwright/test";

test("lick chunk selection, recall, repeat and full-line return fit mobile", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/music/play/licks?from=1&to=2&mode=check");
  await expect(page.getByRole("button", { name: "Hear chunk", exact: true })).toBeVisible();
  await expect(page.locator('[data-highlight="target"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Hear at half speed", exact: true }).click();
  await page.getByRole("button", { name: "Stop preview", exact: true }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: /^D4(?:,|$)/ }).click();
  await page.getByRole("button", { name: /^F4(?:,|$)/ }).click();
  await expect(page.getByText("Chunk complete", { exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Tempo ladder" })).toContainText(
    "performed timing is not assessed",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("chunk-summary-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Return to full line", exact: true }).click();
  await expect(page.getByRole("button", { name: "Hear it", exact: true })).toBeVisible();
  await expect(page).not.toHaveURL(/[?&]from=/);
  await page.getByRole("button", { name: "Edit setup", exact: true }).click();
  await page.getByLabel("First note", { exact: true }).fill("5");
  await page.getByLabel("Last note", { exact: true }).fill("8");
  await page.getByLabel("Last note", { exact: true }).press("Tab");
  await expect(page).toHaveURL(/from=5&to=8/);
  await page.reload();
  await expect(page.getByRole("button", { name: "Hear chunk", exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await page.setViewportSize({ width: 1280, height: 900 });
  const darkBefore = await page
    .locator("html")
    .evaluate((element) => element.classList.contains("dark"));
  await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
  await expect
    .poll(() => page.locator("html").evaluate((element) => element.classList.contains("dark")))
    .toBe(!darkBefore);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("chunk-setup-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
});
