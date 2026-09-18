import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";

import "../../../app.css";

import MusicNavigation from "./MusicNavigation.svelte";

describe("MusicNavigation", () => {
  test("renders the four hubs and the utility links", () => {
    render(MusicNavigation, { currentPath: "/music" });
    for (const label of [
      "Practice",
      "Library",
      "Create",
      "Record",
      "Progress",
      "Connect",
      "Tuner",
      "Settings",
      "Guide",
    ]) {
      expect(document.body.textContent).toContain(label);
    }
  });

  test("Record is a Create sub-destination and lights up its hub", async () => {
    await page.viewport(1280, 900); // the desktop rail is hidden below md
    render(MusicNavigation, { currentPath: "/music/record" });

    const record = document.querySelector<HTMLAnchorElement>('a[href="/music/record"]');
    expect(record?.textContent).toContain("Record");
    // Only the deepest entry is the current page; the hub above it is merely
    // "current", so a screen reader does not announce two current pages.
    expect(record?.getAttribute("aria-current")).toBe("page");
    expect(document.querySelector('a[href="/music/create"]')?.getAttribute("aria-current")).toBe(
      "true",
    );
    const activeHrefs = [...document.querySelectorAll('a[aria-current="page"]')].map((a) =>
      a.getAttribute("href"),
    );
    expect(activeHrefs).toEqual(["/music/record"]);
  });

  test("marks Practice as current on /music", () => {
    render(MusicNavigation, { currentPath: "/music" });
    const current = document.querySelector('a[aria-current="page"]');
    expect(current?.getAttribute("href")).toBe("/music");
  });

  test("a drill sub-route lights up the Practice hub, not other hubs", () => {
    render(MusicNavigation, { currentPath: "/music/play/scales" });
    const activeHrefs = [...document.querySelectorAll('a[aria-current="page"]')].map((a) =>
      a.getAttribute("href"),
    );
    expect(activeHrefs).toContain("/music");
    expect(activeHrefs).not.toContain("/music/library");
    expect(activeHrefs).not.toContain("/music/progress");
  });

  test("a song detail lights up the Library hub", () => {
    render(MusicNavigation, { currentPath: "/music/songs/song-1" });
    const activeHrefs = [...document.querySelectorAll('a[aria-current="page"]')].map((a) =>
      a.getAttribute("href"),
    );
    expect(activeHrefs).toContain("/music/library");
    expect(activeHrefs).not.toContain("/music");
  });

  test("a collapsed rail icon keeps its sr-only label and shows a focus tooltip, with no native title", async () => {
    try {
      await page.viewport(1280, 900); // the desktop rail is hidden below md
      localStorage.setItem("music.sidebar.collapsed", "1");
      render(MusicNavigation, { currentPath: "/music/connect" });

      const link = document.querySelector<HTMLAnchorElement>('a[href="/music/connect"]');
      // No native title: the bits-ui tooltip below replaced it, and both would
      // show the same text on one hover.
      expect(link?.hasAttribute("title")).toBe(false);
      expect(link?.querySelector(".sr-only")?.textContent).toBe("Connect");

      // The tooltip trigger's own open state flips on focus (keyboard users
      // get the same hint as a mouse hover); this is the wiring the kit
      // Tooltip owns, independent of the floating-layer's own animation timing.
      link?.focus();
      await expect.poll(() => link?.getAttribute("data-state")).not.toBe("closed");
    } finally {
      localStorage.removeItem("music.sidebar.collapsed");
    }
  });

  test("the expanded rail (default) wraps no link in a tooltip, so hovering shows no bubble", async () => {
    await page.viewport(1280, 900); // the desktop rail is hidden below md
    render(MusicNavigation, { currentPath: "/music/connect" });

    const link = document.querySelector<HTMLAnchorElement>('a[href="/music/connect"]');
    // The label is already visible text, so the link carries no tooltip wiring
    // at all (not just a tooltip that stays closed).
    expect(link?.hasAttribute("data-tooltip-trigger")).toBe(false);

    link?.focus();
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });
});
