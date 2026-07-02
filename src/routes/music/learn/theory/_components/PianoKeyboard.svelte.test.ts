import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import PianoKeyboard from "./PianoKeyboard.svelte";

describe("theory PianoKeyboard", () => {
  test("renders a piano-chart preview and marks selected pitch classes", async () => {
    render(PianoKeyboard, { notes: ["C", "E", "G", "B"] });

    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Piano voicing"] svg')).not.toBeNull(),
    );
    const keys = [
      ...document.querySelectorAll('[role="group"][aria-label="Piano voicing"] button'),
    ];
    expect(keys).toHaveLength(12);
    expect(
      keys
        .filter((key) => key.getAttribute("aria-pressed") === "true")
        .map((key) => key.textContent),
    ).toEqual(["C", "E", "G", "B"]);
  });
});
