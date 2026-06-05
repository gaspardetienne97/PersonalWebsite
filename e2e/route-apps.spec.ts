import { expect, test } from "@playwright/test";

test("personal site links to route apps", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /welcome/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Music" })).toHaveAttribute("href", "/music");
  await expect(page.getByRole("link", { name: "PDF" })).toHaveAttribute("href", "/pdf");
});

test("music route app renders", async ({ page }) => {
  await page.goto("/music");

  await expect(page.getByRole("heading", { name: "Musicianship OS" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "MIDI devices" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Live MIDI events" })).toBeVisible();
  // Input state now lives in the shared topbar readout.
  await expect(page.getByText("On-screen confidence 80%")).toBeVisible();
  await page.getByRole("button", { name: "Answer m6" }).click();
  await expect(page.getByText(/Correct\..*m6 mastery/i)).toBeVisible();

  await page.getByRole("button", { name: "Start metronome" }).click();
  await expect(page.getByText(/Playing beat [1-4]/)).toBeVisible();
  await page.getByRole("button", { name: "Stop metronome" }).click();
  await expect(page.getByText("Metronome stopped")).toBeVisible();
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
  // The Practice OS sidebar groups Learn into focused entries; navigate via one.
  await navigation.getByRole("link", { name: "Ear Training" }).click();

  await expect(page).toHaveURL("/music/learn/ear");
  await expect(page.getByRole("heading", { name: "Ear Training" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enable audio" })).toBeVisible();
});

test("music app shell uses bottom navigation on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/music");

  await expect(page.getByRole("navigation", { name: "Music sections", exact: true })).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Music sections mobile" })).toBeVisible();
});

test("pdf route app renders", async ({ page }) => {
  await page.goto("/pdf");

  await expect(page.getByRole("heading", { name: "PDF Reader & Narrator" })).toBeVisible();
  await expect(page.getByText(/Upload PDF/i)).toBeVisible();
});
