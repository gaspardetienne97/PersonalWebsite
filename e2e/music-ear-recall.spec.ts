import { expect, test } from "@playwright/test";

test("Mixed practice holds the answered sound and correction until Continue", async ({ page }) => {
  await page.goto("/music/learn/ear/mixed?answer=choice&feedback=practice");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const question = page.getByRole("heading", { level: 2 });
  await expect(question).toHaveText(/^What .+ did you hear\?/);
  const firstQuestion = await question.textContent();
  const choices = page.locator(
    '[aria-label="Answer choices"] button, [aria-label="Scale-degree answer choices"] button',
  );
  const selected = await choices.first().textContent();
  await choices.first().click();
  const correction = page.getByRole("region", { name: "Answer correction" });
  await expect(correction).toBeVisible();
  await expect(question).toHaveText(firstQuestion!);
  await expect(correction).toContainText(selected!.trim());
  await expect(correction).toContainText("Correct answer:");
  await expect(choices).toHaveCount(0);
  await page.getByRole("button", { name: "Replay answered sound" }).click();
  await expect(question).toHaveText(firstQuestion!);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(correction).toHaveCount(0);
  await expect(question).not.toHaveText(firstQuestion!);
});

test("Pocket recall reveals before rating and resets for the next prompt on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/music/learn/ear/scale-degrees?answer=listen&level=anchor");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reveal answer" })).toBeVisible();
  await expect(page.getByTestId("revealed-answer")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "I recalled it" })).toHaveCount(0);
  await page.getByRole("button", { name: "Reveal answer" }).click();
  await expect(page.getByTestId("revealed-answer")).toBeVisible();
  await expect(page.getByTestId("revealed-answer")).toBeFocused();
  await expect(page.getByText("Pocket recall · Self-rated", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Missed it", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reveal answer" })).toBeVisible();
  await expect(page.getByTestId("revealed-answer")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
});

test("Listen along advances without a rating and stops cleanly", async ({ page }) => {
  await page.goto("/music/learn/ear/scale-degrees?answer=listen-along&level=anchor");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByText("Listen along · Unscored", { exact: true })).toBeVisible();
  await expect(page.getByTestId("revealed-answer")).toBeVisible();
  await expect(page.getByRole("button", { name: "I recalled it" })).toHaveCount(0);
  await expect(page.getByText("2 / 10", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeEnabled();
});
