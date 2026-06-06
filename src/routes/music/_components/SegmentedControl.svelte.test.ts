import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import SegmentedControl from "./SegmentedControl.svelte";

describe("SegmentedControl", () => {
  test("renders options and marks the active one", () => {
    render(SegmentedControl, {
      options: [
        { value: "flashcards", label: "Flashcards" },
        { value: "sight", label: "Sight-reading" },
      ],
      value: "flashcards",
    });
    const active = document.querySelector('button[aria-pressed="true"]');
    expect(active?.textContent?.trim()).toBe("Flashcards");
    expect(document.body.textContent).toContain("Sight-reading");
  });

  test("invokes onChange when a segment is clicked", () => {
    let picked = "";
    render(SegmentedControl, {
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
      value: "a",
      onChange: (v: string) => (picked = v),
    });
    const buttons = [...document.querySelectorAll("button")];
    buttons.find((b) => b.textContent?.trim() === "B")?.click();
    expect(picked).toBe("b");
  });
});
