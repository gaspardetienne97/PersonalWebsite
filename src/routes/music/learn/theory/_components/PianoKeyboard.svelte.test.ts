import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import PianoKeyboard from "./PianoKeyboard.svelte";

describe("theory PianoKeyboard", () => {
  test("marks the selected pitch classes across one octave", () => {
    render(PianoKeyboard, { notes: ["C", "E", "G", "B"] });

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
