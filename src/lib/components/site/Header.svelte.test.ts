import { afterEach, describe, expect, it } from "vite-plus/test";
import { render } from "vitest-browser-svelte";
import { page, userEvent } from "vite-plus/test/browser";
import "../../../app.css";
import Header from "./Header.svelte";

afterEach(async () => {
  await page.viewport(1280, 900);
});

describe("Header", () => {
  it("collapses site links into a keyboard-operable mobile menu", async () => {
    await page.viewport(375, 812);
    await render(Header);
    const trigger = page.getByRole("button", { name: "Site menu", exact: true });
    await expect.element(trigger).toBeVisible();
    expect(
      getComputedStyle(document.querySelector('nav[aria-label="Site navigation"]')!).display,
    ).toBe("none");
    await trigger.click();
    for (const label of ["Home", "About", "Studio", "Writing"])
      await expect.element(page.getByRole("menuitem", { name: label, exact: true })).toBeVisible();
    // The panel also holds what the phone header has no room for: language and theme.
    await expect
      .element(page.getByRole("menuitemradio", { name: "English", exact: true }))
      .toHaveAttribute("aria-checked", "true");
    await expect
      .element(page.getByRole("menuitem", { name: "Toggle theme", exact: true }))
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Toggle theme", exact: true }))
      .not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await expect.element(trigger).toHaveFocus();
    await expect.element(page.getByRole("menu")).not.toBeInTheDocument();
    await page.viewport(1280, 900);
    await expect.element(trigger).not.toBeInTheDocument();
    await expect
      .element(page.getByRole("navigation", { name: "Site navigation", exact: true }))
      .toBeVisible();
  });

  it("links to the site sections, leaving the big apps to Projects", async () => {
    await render(Header);

    for (const [label, href] of [
      ["About", "/about"],
      ["Studio", "/studio"],
      ["Writing", "/blog"],
    ])
      expect(document.querySelector<HTMLAnchorElement>(`a[href="${href}"]`)?.textContent).toContain(
        label,
      );
    expect(document.querySelector('a[href="/pdf"]')).toBeNull();
    expect(document.querySelector('a[href="/music"]')).toBeNull();
  });
});
