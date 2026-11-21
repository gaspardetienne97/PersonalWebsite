import { expect, test } from "@playwright/test";

test("a missing address gets the site's error page, in any section", async ({ page }) => {
  for (const path of ["/does-not-exist", "/blog/does-not-exist", "/music/does-not-exist"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
    // Inside the site's header and footer, with a way home and to each section.
    await expect(page.getByRole("link", { name: "Gaspard Etienne, home" })).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
    for (const [name, href] of [
      ["Home", "/"],
      ["About", "/about"],
      ["Studio", "/studio"],
      // A missing post leads with the list of posts, in place of the nav's own link to it.
      [path.startsWith("/blog/") ? "All posts" : "Writing", "/blog"],
    ])
      await expect(page.getByRole("main").getByRole("link", { name, exact: true })).toHaveAttribute(
        "href",
        href,
      );
  }
});

test("Listplay shows a signed-out state instead of an empty playlists page", async ({ page }) => {
  await page.goto("/listplay");
  await expect(page.getByRole("heading", { level: 1, name: "Listplay" })).toBeVisible();
  // Which of the two it is depends on whether this server has a Spotify client id.
  await expect(
    page
      .getByText("Sign in to see your playlists")
      .or(page.getByText("Listplay isn't set up on this server yet")),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your Playlists" })).toHaveCount(0);
});
