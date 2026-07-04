import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import StartShortcut from "./StartShortcut.svelte";

afterEach(() => {
  document.body.replaceChildren();
});

function space(init: KeyboardEventInit = {}): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, ...init }));
}

describe("StartShortcut", () => {
  test("Space fires onStart and shows the hint", () => {
    const onStart = vi.fn();
    render(StartShortcut, { onStart });

    space();

    expect(onStart).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-testid="start-shortcut-hint"]')?.textContent).toContain(
      "to start",
    );
  });

  test("ignores repeats, modifiers, disabled state, and focused controls", () => {
    const onStart = vi.fn();
    render(StartShortcut, { onStart, enabled: false });
    space();

    document.body.replaceChildren();
    render(StartShortcut, { onStart });
    space({ repeat: true });
    space({ metaKey: true });
    space({ ctrlKey: true });

    // A focused button already activates on Space — no double fire.
    const button = document.createElement("button");
    document.body.append(button);
    button.focus();
    button.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));

    expect(onStart).not.toHaveBeenCalled();
  });
});
