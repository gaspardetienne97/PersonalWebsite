import { expect, test } from "@playwright/test";

test("Guide returns to Practice through client navigation without a runtime error", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/music/guide");
  await expect(
    page.getByRole("heading", { name: "How to use Practice OS", exact: true }),
  ).toBeVisible();
  // This journal text is populated by onMount; the SSR heading alone is not a hydration gate.
  await expect(
    page.getByText(
      "Finishing one session awards XP, starts your streak and writes a journal entry.",
      { exact: true },
    ),
  ).toBeVisible();
  const initialTimeOrigin = await page.evaluate(() => performance.timeOrigin);

  for (const from of ["sidebar", "guide"] as const) {
    const link =
      from === "sidebar"
        ? page
            .getByRole("navigation", { name: "Music sections", exact: true })
            .getByRole("link", { name: "Practice", exact: true })
        : page.getByRole("link", { name: "Open Practice", exact: true });
    await link.click();
    await expect(page.getByRole("heading", { name: "Practice", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Drills", exact: true })).toBeVisible();
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(initialTimeOrigin);
    expect(errors).toEqual([]);
    if (from === "sidebar") {
      await page.getByRole("link", { name: "Guide", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "How to use Practice OS", exact: true }),
      ).toBeVisible();
    }
  }
});
