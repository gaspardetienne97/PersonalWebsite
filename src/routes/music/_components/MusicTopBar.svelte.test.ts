import { afterEach, describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";

import "../../../app.css";

import MusicTopBar from "./MusicTopBar.svelte";

afterEach(async () => {
  await page.viewport(1280, 900);
});

describe("MusicTopBar", () => {
  test("the phone More menu opens and lists the four utility hubs", async () => {
    await page.viewport(375, 812);
    render(MusicTopBar, { onSearch: () => {} });

    const trigger = page.getByRole("button", { name: "More Music sections" });
    await expect.element(trigger).toBeVisible();
    await trigger.click();

    for (const label of ["Connect", "Tuner", "Settings", "Guide"]) {
      await expect.element(page.getByRole("menuitem", { name: label, exact: true })).toBeVisible();
    }
  });

  test("the More trigger is hidden at desktop widths", async () => {
    await page.viewport(1280, 900);
    render(MusicTopBar, { onSearch: () => {} });

    expect(
      getComputedStyle(document.querySelector('[aria-label="More Music sections"]')!).display,
    ).toBe("none");
  });

  test("375px shows the trigger with no horizontal overflow", async () => {
    await page.viewport(375, 812);
    render(MusicTopBar, { onSearch: () => {} });

    expect(document.querySelector('[aria-label="More Music sections"]')).not.toBeNull();
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth,
    );
  });
});
