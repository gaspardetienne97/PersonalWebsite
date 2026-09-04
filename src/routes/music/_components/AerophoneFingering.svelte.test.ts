import { afterEach, describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import AerophoneFingering from "./AerophoneFingering.svelte";

afterEach(() => {
  document.body.replaceChildren();
});

describe("AerophoneFingering", () => {
  test("lets the figure shrink below its nominal size instead of overflowing", async () => {
    // Component tests run without the app stylesheet, so the fluid sizing is an
    // inline style the test can read; e2e/music-aerophone.spec.ts checks the
    // resulting 375px layout against the real build.
    render(AerophoneFingering, { midi: 67, size: 84 });
    const svg = document.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("width")).toBe("84");
    expect(svg!.style.maxWidth).toBe("100%");
    expect(svg!.style.height).toBe("auto");
    expect(svg!.getAttribute("aria-label")).toBe("G4 Aerophone fingering");
  });
});
