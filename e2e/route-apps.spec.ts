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
  await page.getByRole("button", { name: "Answer m6" }).click();
  await expect(page.getByText(/Correct\..*m6 mastery/i)).toBeVisible();
});

test("pdf route app renders", async ({ page }) => {
  await page.goto("/pdf");

  await expect(page.getByRole("heading", { name: "PDF Reader & Narrator" })).toBeVisible();
  await expect(page.getByText(/Upload PDF/i)).toBeVisible();
});
