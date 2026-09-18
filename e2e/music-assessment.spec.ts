import { expect, test } from "@playwright/test";

for (const route of ["voicings", "chord-scales", "licks"]) {
  test(`${route} Check hides answer cues from first render through performance`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const response = await page.goto(`/music/play/${route}?mode=check&instrument=piano`);
    const html = await response!.text();
    expect(html).not.toContain('data-highlight="target"');
    if (route === "voicings") expect(html).not.toContain("Drill preview");
    if (route === "chord-scales") expect(html).not.toContain("D Dorian");
    await expect(page.getByRole("button", { name: "Start", exact: true })).toBeEnabled();
    await expect(page.locator('[data-highlight="target"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('[data-highlight="target"]')).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Stop", exact: true }).click();
  });
}
