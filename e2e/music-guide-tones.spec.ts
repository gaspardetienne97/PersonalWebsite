import { expect, test } from "@playwright/test";

test("guide tones is unaided from SSR through two manual transitions and survives a mobile key change", async ({
  page,
  request,
}, testInfo) => {
  const href = "/music/play/voicings?variant=guide-tones&key=0&mode=practice";
  const html = await (await request.get(href)).text();
  expect(html).toContain("Guide tones");
  expect(html.replace(/<!--[\s\S]*?-->/g, "")).toContain("Current Dm7: F3 C4");
  expect(html).not.toContain("Drill preview");
  expect(html).not.toContain('data-highlight="target"');
  await page.goto(href);
  await expect(page.getByText("Register: C3–B4", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("heading", { name: "G7", exact: true })).toBeVisible();
  await expect(page.locator('[data-highlight="target"]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("guide-tones-desktop.png"), fullPage: true });
  const play = async (names: string[]) => {
    for (const name of names) await page.locator(`button[data-note="${name}"]`).click();
  };
  await play(["F3", "B3"]);
  await expect(page.getByText("Two notes selected", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "G7", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Check chord", exact: true }).click();
  await expect(page.getByText("Current G7: F3 B3", { exact: true })).toBeVisible();
  await play(["E3", "B3"]);
  await page.getByRole("button", { name: "Check chord", exact: true }).click();
  await expect(page.getByText("Drill complete", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Voice-leading results" })).toContainText(
    "Membership: correct",
  );
  await expect(page.getByRole("list", { name: "Voice-leading results" })).toContainText(
    "Movement: 1 semitone; minimum 1 semitone",
  );
  await expect(page.getByTestId("last-run-delta")).toBeVisible();

  await page.getByRole("button", { name: "Change setup", exact: true }).click();
  const beforeTheme = await page.locator("html").getAttribute("class");
  await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
  await expect.poll(() => page.locator("html").getAttribute("class")).not.toBe(beforeTheme);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "Edit setup", exact: true }).click();
  await page.getByLabel("Key", { exact: true }).selectOption("2");
  await expect(page).toHaveURL(/key=2/);
  await page.reload();
  await expect(page.getByText("Register: D3–C#5", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("heading", { name: "A7", exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: testInfo.outputPath("guide-tones-mobile-theme.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeEnabled();
});
