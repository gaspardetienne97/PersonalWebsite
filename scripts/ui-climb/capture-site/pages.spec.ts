// About, the writing list, one article, Listplay, sign-in and the not-found page.
import { expect, test } from "@playwright/test";
import { WIDTHS, scrollTo, settle, snap } from "../capture-common.ts";
import { returning, visit } from "./site.ts";

for (const width of WIDTHS) {
  test(`about ${width}`, async ({ page }) => {
    await returning(page, width);
    await visit(page, "/about");
    await snap(page, "about", "page", width, "About page, top: who this is and the work", {
      full: true,
    });
    await scrollTo(page, "#this-website");
    await snap(
      page,
      "about",
      "this-website",
      width,
      "About page scrolled to the section about this website and its links into the site",
    );
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
    await settle(page);
    await snap(page, "about", "end", width, "About page, the end: contact links and the footer");
  });

  test(`blog index ${width}`, async ({ page }) => {
    await returning(page, width);
    await visit(page, "/blog");
    await snap(
      page,
      "blog-index",
      "list",
      width,
      "Writing list: category filter, the latest post featured, older posts by year",
      { full: true },
    );
    const filter = page.getByRole("radio", { name: "personal" });
    if (await filter.count()) {
      await filter.click();
      await settle(page);
      await snap(page, "blog-index", "filtered", width, "Writing list filtered to one category");
    }
    if (width === "desktop") {
      await page.locator(".year a.row").first().hover();
      await settle(page, 300);
      await snap(page, "blog-index", "row-hover", width, "Writing list, pointer over a post row", {
        keepMouse: true,
      });
    }
  });

  test(`blog post ${width}`, async ({ page }) => {
    await returning(page, width);
    // The post with a code block. No post has images yet.
    await visit(page, "/blog/post3");
    await snap(
      page,
      "blog-post",
      "top",
      width,
      "an article, top: back link, categories, title, date and reading time, cover art",
      { full: true },
    );
    await scrollTo(page, ".gm-prose pre");
    await snap(page, "blog-post", "code", width, "an article scrolled to its body and a code block");
    await scrollTo(page, "nav.more");
    await snap(
      page,
      "blog-post",
      "end",
      width,
      "an article, the end: links to the newer and older posts, then the footer",
    );
  });

  test(`listplay ${width}`, async ({ page }) => {
    await returning(page, width);
    await visit(page, "/listplay");
    await snap(
      page,
      "listplay",
      "index",
      width,
      "Listplay, the playlists page, with no music account connected (this server has no Spotify client set up)",
      { full: true },
    );
    await visit(page, "/listplay/playlist/37i9dQZF1DXcBWIGoYBM5M");
    await snap(
      page,
      "listplay",
      "playlist",
      width,
      "Listplay, one playlist's page, with no music account connected (no tracks can load)",
    );
  });

  test(`sign in ${width}`, async ({ page }) => {
    await returning(page, width);
    await visit(page, "/login");
    const ready = await page.locator("form button[type=submit]").count();
    await snap(
      page,
      "sign-in",
      ready ? "login" : "login-unavailable",
      width,
      ready
        ? "Sign-in page, signed out: one button to continue with the identity provider"
        : "Sign-in page, signed out, on a server where sign-in is not set up (no database): it says so and offers no button",
    );
    await visit(page, "/login?error=access_denied");
    await snap(
      page,
      "sign-in",
      "login-cancelled",
      width,
      "Sign-in page after a cancelled sign-in: the error message",
    );
    await visit(page, "/private");
    await expect(page).toHaveURL(/\/login\?redirectTo=%2Fprivate/);
    await snap(
      page,
      "sign-in",
      "private-signed-out",
      width,
      "the private page opened while signed out: it sends you to sign in",
    );
  });

  test(`not found ${width}`, async ({ page }) => {
    await returning(page, width);
    await visit(page, "/this-page-does-not-exist");
    await snap(page, "not-found", "404", width, "a page that does not exist (404)", { full: true });
    await visit(page, "/blog/no-such-post");
    await snap(page, "not-found", "404-post", width, "an article that does not exist (404)");
  });
}

// French, phone: the longest locale, to catch overflow and leftover English.
test("pages in French phone", async ({ page }) => {
  await returning(page, "phone", { locale: "fr" });
  await visit(page, "/about");
  await snap(page, "about", "page", "phone", "About page, top", { full: true, fr: true });
  await visit(page, "/blog");
  await snap(page, "blog-index", "list", "phone", "Writing list", { full: true, fr: true });
  await visit(page, "/blog/post3");
  await snap(page, "blog-post", "top", "phone", "an article, top (posts are written in English)", {
    fr: true,
  });
  await scrollTo(page, "nav.more");
  await snap(page, "blog-post", "end", "phone", "an article, the end: newer and older posts", {
    fr: true,
  });
  await visit(page, "/login");
  await snap(page, "sign-in", "login", "phone", "Sign-in page, signed out", { fr: true });
  await visit(page, "/this-page-does-not-exist");
  await snap(page, "not-found", "404", "phone", "a page that does not exist (404)", { fr: true });
  await visit(page, "/listplay");
  await snap(page, "listplay", "index", "phone", "Listplay, the playlists page", { fr: true });
});
