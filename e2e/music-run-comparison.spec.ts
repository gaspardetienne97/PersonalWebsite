import { expect, test } from "@playwright/test";

test("Reading compares a later visit with the same setup and explains a changed note range", async ({
  page,
}) => {
  const complete = async (midi: number, note: string) => {
    await page.goto(`/music/learn/reading?low=${midi}&high=${midi}`);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const answer = page
      .locator('[aria-label="Answer choices"]')
      .getByRole("button", { name: note, exact: true });
    for (let index = 0; index < 10; index += 1) await answer.click();
    await expect(page.getByTestId("last-run-delta")).toBeVisible();
  };
  await complete(60, "C");
  await expect(page.getByTestId("last-run-delta")).toContainText("First visit with a logged run");
  await complete(60, "C");
  await expect(page.getByTestId("last-run-delta")).toContainText("previous matching run");
  await expect(page.getByTestId("last-run-delta")).toContainText(
    "Answer buttons / Piano / independent",
  );
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await complete(62, "D");
  await expect(page.getByTestId("last-run-delta")).toContainText("different setup");
  await expect(page.getByTestId("last-run-delta")).not.toContainText("previous matching run");
});
