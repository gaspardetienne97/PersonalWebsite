import { expect, test } from "@playwright/test";

test.describe("ear training path and drills", () => {
  test("the path lists six steps and each opens one drill with its setup", async ({ page }) => {
    await page.goto("/music/learn/ear");
    await expect(page.getByRole("heading", { name: "Ear Training Path" })).toBeVisible();
    const steps = page.getByTestId("ear-path-steps").locator("li");
    await expect(steps).toHaveCount(6);
    await expect(page.getByTestId("ear-path-continue")).toHaveAttribute(
      "href",
      "/music/learn/ear/scale-degrees?answer=listen&level=anchor",
    );

    await steps.first().getByRole("link", { name: "Practice" }).click();
    await expect(page).toHaveURL(/\/music\/learn\/ear\/scale-degrees\?answer=listen&level=anchor/);
    await expect(page.getByRole("heading", { name: "Scale degrees" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start", exact: true })).toBeEnabled({
      timeout: 15_000,
    });
  });

  test("legacy single-route links redirect onto the drill route", async ({ page }) => {
    await page.goto("/music/learn/ear?drill=cadence&answer=listen");
    await expect(page).toHaveURL(/\/music\/learn\/ear\/cadences\?answer=listen/);
    await expect(page.getByRole("heading", { name: "Cadences" })).toBeVisible();
  });

  test("every ear drill is its own card on Practice", async ({ page }) => {
    await page.goto("/music?tab=drills");
    for (const slug of [
      "intervals",
      "chord-qualities",
      "cadences",
      "scale-degrees",
      "melody-dictation",
      "repertoire-transfer",
      "mixed",
    ]) {
      await expect(page.locator(`a[href="/music/learn/ear/${slug}"]`).first()).toBeVisible();
    }
  });
});
