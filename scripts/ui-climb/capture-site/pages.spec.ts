// About, the writing list, one article, Listplay, sign-in and the not-found page.
import { expect, test } from "@playwright/test";
import { WIDTHS, scrollTo, settle, snap } from "../capture-common.ts";
import { returning, visit } from "./site.ts";

// A second server with sign-in switched on, for the shots of the sign-in button. It is this
// site started with DATABASE_URL (any Postgres address, nothing has to listen there),
// AUTHENTIK_ISSUER and AUTHENTIK_CLIENT_ID set. The button is never pressed. Without the
// variable those shots are skipped and the main server's "not set up" state is all there is.
const SIGNIN_BASE = process.env.UI_CLIMB_SIGNIN_BASE;

for (const width of WIDTHS) {
  test(`about ${width}`, async ({ page }) => {
    await returning(page, width);
    await visit(page, "/about");
    await snap(
      page,
      "about",
      "page",
      width,
      width === "desktop"
        ? "About page: the greeting with pieces of the work beside it, then a page index that stays in view beside the sections (work, outside work, this website, say hello)"
        : "About page: the greeting with pieces of the work, then a page index as a row of chips over the sections (work, outside work, this website, say hello)",
      {
        full: true,
      },
    );
    if (width === "desktop") {
      await scrollTo(page, "#outside");
      await expect(page.locator('nav.index a[href="#outside"]')).toHaveAttribute(
        "aria-current",
        "location",
      );
      await snap(
        page,
        "about",
        "index-current",
        width,
        "About page scrolled to the section about life outside work: the page index beside it marks that section",
      );
    }
    await scrollTo(page, "#this-website");
    await snap(
      page,
      "about",
      "this-website",
      width,
      "About page scrolled to the section about this website and its links into the site",
    );
    await page.evaluate(() =>
      window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }),
    );
    await settle(page);
    await snap(
      page,
      "about",
      "end",
      width,
      width === "desktop"
        ? 'About page, the end: contact links and the footer, with "Say hello" marked in the page index'
        : "About page, the end: contact links and the footer",
    );
    const colophon = page.locator("details.colophon > summary");
    await colophon.scrollIntoViewIfNeeded();
    await colophon.click();
    await expect(page.locator("details.colophon")).toHaveAttribute("open", "");
    await scrollTo(page, "details.colophon");
    await snap(
      page,
      "about",
      "colophon-open",
      width,
      'About page with the "How it\'s built" disclosure opened: what the site is made with',
    );
  });

  test(`blog index ${width}`, async ({ page }) => {
    await returning(page, width);
    await visit(page, "/blog");
    await snap(
      page,
      "blog-index",
      "list",
      width,
      "Writing list: one post featured with its date and reading time, the others in a list by year",
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
      "an article, top: back link, title, then date, reading time and categories, then the text",
      { full: true },
    );
    await scrollTo(page, ".gm-prose pre");
    await snap(
      page,
      "blog-post",
      "code",
      width,
      "an article scrolled to its body and a code block",
    );
    await scrollTo(page, "nav.more");
    await snap(
      page,
      "blog-post",
      "end",
      width,
      "an article, the end: links to the previous and next posts, then the footer",
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
    await expect(page.locator("form button[type=submit]")).toHaveCount(0);
    await snap(
      page,
      "sign-in",
      "login-unavailable",
      width,
      "Sign-in page, signed out, on a server where sign-in is not set up (no database): a short notice says sign-in is unavailable, with the way back to the site",
    );
  });

  test(`sign in with the button ${width}`, async ({ page }) => {
    test.skip(!SIGNIN_BASE, "UI_CLIMB_SIGNIN_BASE is not set");
    await returning(page, width);
    const at = (path: string) => `${SIGNIN_BASE}${path}`;
    const button = page.locator("form button[type=submit]");
    await visit(page, at("/login"));
    await expect(button).toBeVisible();
    await snap(
      page,
      "sign-in",
      "login",
      width,
      'Sign-in page, signed out: what signing in is for, one "Sign in" button, a line that says which service it uses, and the way back to the site',
    );
    if (width === "desktop") {
      // Never pressed: the pointer only rests on it.
      await button.hover();
      await settle(page, 500);
      await snap(
        page,
        "sign-in",
        "login-hover",
        width,
        "Sign-in page, pointer over the Sign in button: the circuit traces at its sides light up",
        { keepMouse: true },
      );
      await page.mouse.move(40, 700);
    }
    await visit(page, at("/login?error=access_denied"));
    await expect(button).toBeVisible();
    await snap(
      page,
      "sign-in",
      "login-cancelled",
      width,
      "Sign-in page after a cancelled sign-in: an information notice says it was cancelled and what to do next, over the same Sign in button",
    );
    // The private page, opened signed out, sends you to /login?redirectTo=/private.
    await visit(page, at("/private"));
    await expect(page).toHaveURL(/\/login\?redirectTo=%2Fprivate/);
    await expect(button).toBeVisible();
    await snap(
      page,
      "sign-in",
      "login-return",
      width,
      "the private page opened while signed out sends you to sign in: the page names where signing in leads back to",
    );
  });

  test(`not found ${width}`, async ({ page }) => {
    await returning(page, width);
    await visit(page, "/this-page-does-not-exist");
    await snap(
      page,
      "not-found",
      "404",
      width,
      "a page that does not exist (404): the status drawn as a broken connection from the logo, a heading, the address asked for, buttons to each part of the site, and three pieces of the work to look at",
      { full: true },
    );
    if (width === "desktop") {
      // The drawing answers the pointer: the gap in the connection closes.
      await page.locator(".error .broken").hover();
      await settle(page, 500);
      await snap(
        page,
        "not-found",
        "404-hover",
        width,
        "the 404 page with the pointer over the drawing: the broken connection joins up",
        { keepMouse: true },
      );
      await page.mouse.move(40, 700);
    }
    // An address one slip away from a real page.
    await visit(page, "/studoi");
    await expect(page.locator(".error .guess")).toBeVisible();
    await snap(
      page,
      "not-found",
      "404-near",
      width,
      'a mistyped address (/studoi): the 404 page asks "Did you mean /studio?" with a link, above the same buttons and three pieces',
    );
    await visit(page, "/blog/no-such-post");
    await snap(
      page,
      "not-found",
      "404-post",
      width,
      "an article that does not exist (404): the same page, leading with All posts and the newest posts, with three pieces of the work beside them",
      { full: true },
    );
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
  await snap(
    page,
    "blog-post",
    "top",
    "phone",
    "an article, top: the facts under the title, then a line saying the post is written in English",
    { fr: true },
  );
  await scrollTo(page, "nav.more");
  await snap(page, "blog-post", "end", "phone", "an article, the end: previous and next posts", {
    fr: true,
  });
  if (SIGNIN_BASE) {
    // The language cookie is set for the main server's address: the same host, so it applies.
    await visit(page, `${SIGNIN_BASE}/login?redirectTo=/private`);
    await snap(
      page,
      "sign-in",
      "login-return",
      "phone",
      "Sign-in page reached from the private page",
      { fr: true },
    );
  } else {
    await visit(page, "/login");
    await snap(page, "sign-in", "login-unavailable", "phone", "Sign-in page, sign-in not set up", {
      fr: true,
    });
  }
  await visit(page, "/this-page-does-not-exist");
  await snap(page, "not-found", "404", "phone", "a page that does not exist (404)", { fr: true });
  await visit(page, "/listplay");
  await snap(page, "listplay", "index", "phone", "Listplay, the playlists page", { fr: true });
});
