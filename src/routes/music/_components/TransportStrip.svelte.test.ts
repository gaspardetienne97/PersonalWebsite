import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import TransportStrip from "./TransportStrip.svelte";

describe("TransportStrip", () => {
  test("is a labelled toolbar", () => {
    render(TransportStrip, {
      label: "Beat transport",
      children: ((anchor: Element) => {
        anchor.before(Object.assign(document.createElement("button"), { textContent: "Play" }));
      }) as never,
    });
    const toolbar = document.querySelector('[role="toolbar"]');
    expect(toolbar?.getAttribute("aria-label")).toBe("Beat transport");
    expect(toolbar?.textContent).toContain("Play");
  });
});
