// Today: the weekly split picks today's instrument, the song block opens the path's shelf song
// in Song practice with the routine params, Settings holds the split and the A4, and the phone
// More sheet closes on Escape.
import { expect, test } from "@playwright/test";
import { choose, muteHmr } from "./fixtures";

test.describe("today", () => {
  test.beforeEach(async ({ page }) => muteHmr(page));

  test("the weekly split sets today's instrument, and the song block opens a shelf song", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/music");
    await page.getByRole("button", { name: "Adjust" }).click();
    await page.getByRole("button", { name: "30 min" }).click();
    await choose(page, page.getByLabel(/^Instrument on \w+s$/), "Guitar");
    await expect(page.getByText(/^This (morning|afternoon|evening), Guitar$/)).toBeVisible();

    const song = page.locator("ol li").filter({ has: page.getByText("Song", { exact: true }) });
    await song.getByRole("button", { expanded: false }).first().click();
    const start = song.getByRole("link", { name: /^Start/ });
    await expect(start).toHaveAttribute(
      "href",
      /^\/music\/songs\/shelf\/guitar\/[a-z0-9-]+\?.*routine=routine-/,
    );
    await expect(song).toContainText("A level 1 song on the Guitar path");

    // The strip stays on its instrument until a block opens; the block's link switches it.
    await start.click();
    await expect(page).toHaveURL(/\/music\/songs\/[^/?]+\?.*routine=routine-.*step=4/, {
      timeout: 20_000,
    });
    await expect(
      page.getByRole("group", { name: "Practice controls" }).getByLabel("Instrument"),
    ).toContainText("Guitar");

    await page.goto("/music/settings");
    const day = page
      .getByLabel(/^Instrument on \w+s$/)
      .filter({ has: page.getByText("Guitar", { exact: true }) });
    await expect(day).toHaveCount(1);
    // The A4 set here is the tuner's.
    await choose(page, page.getByLabel("Reference A4", { exact: true }), "442 Hz");
    await page.goto("/music/tuner");
    await expect(page.getByLabel("Reference A4", { exact: true })).toContainText("442 Hz");
  });

  test("the phone More sheet closes on Escape and returns focus to its button", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/music");
    const more = page
      .getByRole("navigation", { name: "Woodshed sections" })
      .getByRole("button", { name: "More" });
    await more.click();
    await expect(page.locator("#woodshed-more")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#woodshed-more")).toHaveCount(0);
    await expect(more).toBeFocused();
    await expect(more).toHaveAttribute("aria-expanded", "false");
  });
});
