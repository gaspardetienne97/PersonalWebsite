import { expect, test } from "@playwright/test";

test("a take recorded on /music/record is shared with Practice Lab", async ({ page }) => {
  test.setTimeout(45_000);

  // On-screen keys are the deterministic input surface in headless Chromium
  // (no Web MIDI), exactly as the backup specs record their takes.
  const response = await page.goto("/music/record");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Record", level: 1 })).toBeVisible();
  await expect(page.getByText(/No takes yet/i)).toBeVisible();

  await expect(page.getByRole("button", { name: "New recording", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: /^Count in:/ }).click();
  await page.getByRole("button", { name: "Off", exact: true }).click();
  await page.getByRole("button", { name: "New recording", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Stop ·/ })).toBeVisible({ timeout: 15_000 });
  for (const name of ["C4", "E4", "G4"]) {
    await page.getByRole("button", { name, exact: true }).click();
  }
  await page.getByRole("button", { name: /^Stop ·/ }).click();
  await expect(page.getByText(/^3 notes ·/)).toBeVisible();

  const name = page.getByLabel("Take name for Take 1", { exact: true });
  await name.fill("Shared record take");
  await name.blur();
  await expect(page.getByLabel("Take name for Shared record take", { exact: true })).toBeVisible();

  // A full document load, so this proves the take survives in Dexie and Practice
  // Lab reads the same list. The no-reload sharing (one instance per runtime) is
  // covered by take-recorder.svelte.test.ts, which a browser spec cannot see.
  await page.goto("/music/play");
  await expect(page.getByLabel("Take name for Shared record take", { exact: true })).toBeVisible();

  // Record is a Create sub-destination in the rail.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/music/create");
  const railLink = page.getByRole("link", { name: "Record", exact: true }).first();
  await expect(railLink).toHaveAttribute("href", "/music/record");
  await railLink.click();
  await expect(page).toHaveURL(/\/music\/record/);
  await expect(page.getByLabel("Take name for Shared record take", { exact: true })).toBeVisible();
});

test("the old Create recorder mode lands on /music/record", async ({ page }) => {
  await page.goto("/music/create?mode=recorder&bpm=132");
  // Record syncs its tempo into the query on mount, so match the path, not a
  // full URL: the address bar becomes /music/record?bpm=132 moments later.
  await expect(page).toHaveURL(/\/music\/record(\?|$)/);
  await expect(page).toHaveURL(/bpm=132/);
  await expect(page.getByRole("heading", { name: "Record", level: 1 })).toBeVisible();
});

test("a drill follow-up link prefills the take note", async ({ page }) => {
  await page.goto("/music/record?from=/music/play/two-hand");
  await expect(page.getByText("Recording after Two-Hand Independence")).toBeVisible();
});
