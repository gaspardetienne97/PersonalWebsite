import { expect, test } from "@playwright/test";

test("personal site links to route apps", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /welcome/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Music" })).toHaveAttribute("href", "/music");
  await expect(page.getByRole("link", { name: "Narrator" })).toHaveAttribute("href", "/pdf");
});

test("music route app renders", async ({ page }) => {
  await page.goto("/music");

  // The Practice hub (post-redesign home): Today / Drills / Paths.
  await expect(page.getByRole("heading", { name: "Practice", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Drills" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Paths" })).toBeVisible();

  // The persistent transport bar owns the shared metronome.
  await page.getByRole("button", { name: "Play metronome" }).click();
  await expect(page.getByRole("button", { name: "Pause metronome" })).toBeVisible();
  await page.getByRole("button", { name: "Pause metronome" }).click();
  await expect(page.getByRole("button", { name: "Play metronome" })).toBeVisible();
});

test("music route app registers its installable PWA", async ({ page }) => {
  await page.goto("/music");

  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration("/music");
        return registration?.scope;
      }),
    )
    .toBe("http://localhost:4173/music");
});

test("music app shell persists across section routes", async ({ page }) => {
  await page.goto("/music");

  const navigation = page.getByRole("navigation", { name: "Music sections" });
  await expect(navigation).toBeVisible();
  // The sidebar holds the four intent hubs; navigate via one.
  await navigation.getByRole("link", { name: "Library" }).click();

  await expect(page).toHaveURL("/music/library");
  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
  // The shared transport bar survives the navigation.
  await expect(page.getByRole("button", { name: "Enable audio" })).toBeVisible();
});

test("music app shell uses bottom navigation on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/music");

  await expect(page.getByRole("navigation", { name: "Music sections", exact: true })).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Music sections mobile" })).toBeVisible();
});

test("narrator route app renders", async ({ page }) => {
  await page.goto("/pdf");

  await expect(page.getByRole("heading", { name: "narrator" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your Library" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Add document/ }).first()).toBeVisible();
});
