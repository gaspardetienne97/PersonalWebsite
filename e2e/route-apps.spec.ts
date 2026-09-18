import { expect, test } from "@playwright/test";

test("narrow site menu supports keyboard and pointer navigation", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/music/track");
  const trigger = page.getByRole("button", { name: "Site menu", exact: true });
  await trigger.click();
  for (const [name, href] of [
    ["Home", "/"],
    ["About", "/about"],
    ["Gallery", "/gallery"],
    ["Blog", "/blog"],
    ["Music", "/music"],
    ["Narrator", "/pdf"],
  ]) {
    await expect(page.getByRole("menuitem", { name, exact: true })).toHaveAttribute("href", href);
  }
  await expect(page.getByRole("menuitem", { name: "Music", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Home", exact: true })).toBeFocused();
  for (const name of ["About", "Gallery", "Blog", "Music", "Narrator"]) {
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name, exact: true })).toBeFocused();
  }
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/pdf");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await trigger.click();
  await page.getByRole("menuitem", { name: "Music", exact: true }).click();
  await expect(page).toHaveURL("/music");
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 812 });
    if (width === 320) {
      await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
      await expect(page.locator("html")).toHaveClass(/dark/);
    }
    await trigger.click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);
    await expect(page.getByRole("menuitem", { name: "Narrator", exact: true })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`site-menu-${width}.png`),
      animations: "disabled",
    });
    for (const name of ["Home", "About", "Gallery", "Blog", "Music", "Narrator"]) {
      await expect
        .poll(() =>
          page.getByRole("menuitem", { name, exact: true }).evaluate((node) => {
            const rect = node.getBoundingClientRect();
            return node.contains(
              document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2),
            );
          }),
        )
        .toBe(true);
    }
    await page.keyboard.press("Escape");
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(trigger).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Site navigation", exact: true }),
  ).toBeVisible();
});

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

  const controls = page.locator("[data-practice-controls]");
  await expect(controls).toBeVisible();
  await expect(controls.locator("[data-practice-control]")).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Turn metronome on" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.getByRole("button", { name: "Turn metronome on" }).click();
  await expect(page.getByRole("button", { name: "Turn metronome off" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Turn metronome off" }).click();
  await expect(page.getByRole("button", { name: "Turn metronome on" })).toBeVisible();
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
  await expect(page.locator("[data-practice-controls]")).toBeVisible();
});

test("floating practice controls fit desktop and supported mobile widths", async ({ page }) => {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 375, height: 812 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/music");
    const result = await page.evaluate(() => {
      const root = document.documentElement;
      const capsule = document.querySelector("[data-practice-controls]")!.getBoundingClientRect();
      const controls = [...document.querySelectorAll("[data-practice-control]")].map((node) => {
        const rect = node.getBoundingClientRect();
        return { width: rect.width, height: rect.height, left: rect.left, right: rect.right };
      });
      return {
        overflow: root.scrollWidth - root.clientWidth,
        capsule: { left: capsule.left, right: capsule.right },
        controls,
      };
    });

    expect(result.overflow).toBe(0);
    expect(result.capsule.left).toBeGreaterThanOrEqual(0);
    expect(result.capsule.right).toBeLessThanOrEqual(viewport.width);
    expect(result.controls).toHaveLength(4);
    for (const control of result.controls) {
      expect(control.width).toBeGreaterThan(0);
      expect(control.height).toBeGreaterThan(0);
      expect(control.left).toBeGreaterThanOrEqual(0);
      expect(control.right).toBeLessThanOrEqual(viewport.width);
    }
  }
});

test("music footer follows short and long content", async ({ page }) => {
  // The tuner's readout stage made it about 780 px tall; a 1000 px viewport keeps it the short page.
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/music/tuner");
  expect(
    await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
      footerBottom: document.querySelector("footer")!.getBoundingClientRect().bottom,
    })),
  ).toEqual({ scrollHeight: 1000, clientHeight: 1000, footerBottom: 1000 });

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/music/guide");
  const longPage = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
    footerTop: document.querySelector("footer")!.getBoundingClientRect().top,
  }));
  expect(longPage.scrollHeight).toBeGreaterThan(longPage.clientHeight);
  expect(longPage.footerTop).toBeGreaterThanOrEqual(longPage.clientHeight);
});

test("mobile music footer clears the fixed navigation", async ({ page }) => {
  for (const viewport of [
    { width: 375, height: 720 },
    { width: 320, height: 568 },
  ]) {
    const viewportPage = await page.context().newPage();
    await viewportPage.setViewportSize(viewport);
    await viewportPage.goto("/music/tuner");
    await expect(viewportPage.locator("[data-practice-controls]")).toBeVisible();

    let previousScrollHeight = 0;
    let stableScrollHeightReads = 0;
    await expect
      .poll(async () => {
        const scrollHeight = await viewportPage.evaluate(
          () => document.documentElement.scrollHeight,
        );
        stableScrollHeightReads =
          scrollHeight === previousScrollHeight ? stableScrollHeightReads + 1 : 0;
        previousScrollHeight = scrollHeight;
        return stableScrollHeightReads;
      })
      .toBeGreaterThanOrEqual(2);

    const result = await viewportPage.evaluate(() => {
      const root = document.documentElement;
      window.scrollTo(0, root.scrollHeight);
      const footer = document.querySelector("footer")!;
      const copyright = footer.querySelector("p")!;
      const navigation = document.querySelector('[aria-label="Music sections mobile"]')!;
      const footerRect = footer.getBoundingClientRect();
      const copyrightRect = copyright.getBoundingClientRect();
      const navigationRect = navigation.getBoundingClientRect();
      const hit = document.elementFromPoint(
        copyrightRect.left + copyrightRect.width / 2,
        copyrightRect.top + copyrightRect.height / 2,
      );

      return {
        footerBottom: footerRect.bottom,
        navigationTop: navigationRect.top,
        navigationHeight: navigationRect.height,
        reservedAfterFooter: root.scrollHeight - (window.scrollY + footerRect.bottom),
        copyrightHit: hit !== null && footer.contains(hit),
      };
    });

    // Sub-pixel text metrics can leave the footer a fraction of a pixel past the nav edge.
    expect(result.footerBottom).toBeLessThanOrEqual(result.navigationTop + 1);
    expect(result.reservedAfterFooter).toBeCloseTo(result.navigationHeight, 0);
    expect(result.copyrightHit).toBe(true);
    await viewportPage.close();
  }
});

test("local playback stops on navigation", async ({ page }) => {
  await page.goto("/music/create?mode=piano-roll");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();

  await page.goto("/music");
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toHaveCount(0);

  await page.goto("/music/create?mode=piano-roll");
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
});

test("music top bar yields to the drill on phone-width drill routes", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/music");
  await expect(page.getByRole("button", { name: /Search/ })).toBeVisible();

  await page.goto("/music/play/scales");
  await expect(page.getByRole("heading", { name: "Scales & Technique" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Search/ })).toBeHidden();

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole("button", { name: /Search/ })).toBeVisible();
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
