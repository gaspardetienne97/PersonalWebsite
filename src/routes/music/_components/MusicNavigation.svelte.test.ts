import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import MusicNavigation from "./MusicNavigation.svelte";

describe("MusicNavigation", () => {
  test("renders grouped nav section labels", () => {
    render(MusicNavigation, { currentPath: "/music" });
    expect(document.body.textContent).toContain("Learn");
    expect(document.body.textContent).toContain("Track");
    expect(document.body.textContent).toContain("Progress");
  });

  test("marks home as the current page on /music", () => {
    render(MusicNavigation, { currentPath: "/music" });
    const current = document.querySelector('a[aria-current="page"]');
    expect(current?.getAttribute("href")).toBe("/music");
  });

  test("activates a learn sub-route without activating home", () => {
    render(MusicNavigation, { currentPath: "/music/learn/ear" });
    const current = Array.from(document.querySelectorAll('a[aria-current="page"]')).map((a) =>
      a.getAttribute("href"),
    );
    expect(current).toContain("/music/learn/ear");
    expect(current).not.toContain("/music");
  });
});
