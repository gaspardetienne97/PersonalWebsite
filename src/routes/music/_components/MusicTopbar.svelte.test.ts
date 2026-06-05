import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import MusicTopbar from "./MusicTopbar.svelte";
import { MusicRuntime } from "../_runtime.svelte";

describe("MusicTopbar", () => {
  test("renders route context, progress chips, and active input state", async () => {
    const runtime = new MusicRuntime();

    render(MusicTopbar, {
      currentPath: "/music/learn/rhythm",
      runtime,
    });

    expect(document.querySelector('[data-testid="music-topbar-title"]')?.textContent).toContain(
      "Rhythm Trainer",
    );
    expect(document.body.textContent).toContain("Tap pulse, read timing, and tighten groove.");
    expect(document.body.textContent).toContain("0 XP");
    expect(document.body.textContent).toContain("0 days streak");
    expect(document.body.textContent).toContain("On-screen");
    expect(document.body.textContent).toContain("80%");

    runtime.router.noteOn(60, "midi", "piano");

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("MIDI");
      expect(document.body.textContent).toContain("Piano");
      expect(document.body.textContent).toContain("100%");
    });

    runtime.dispose();
  });
});
