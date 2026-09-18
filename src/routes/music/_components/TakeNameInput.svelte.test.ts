import { tick } from "svelte";
import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import TakeNameInput from "./TakeNameInput.svelte";

function field(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('[aria-label="Take name"]')!;
}

function change(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("TakeNameInput", () => {
  test("commits the typed name on change", () => {
    const onCommit = vi.fn();
    render(TakeNameInput, { value: "Take 1", label: "Take name", onCommit });

    change(field(), "Bridge idea");

    expect(onCommit).toHaveBeenCalledWith("Bridge idea");
  });

  test("snaps back to the stored name when a blank commit is rejected", async () => {
    // A caller that rejects the blank leaves `value` alone, as RecordingSession does.
    render(TakeNameInput, { value: "Take 1", label: "Take name", onCommit: () => {} });

    change(field(), "   ");
    await tick();

    expect(field().value).toBe("Take 1");
  });

  test("reverts the field on Escape without committing", async () => {
    const onCommit = vi.fn();
    render(TakeNameInput, { value: "Take 1", label: "Take name", onCommit });

    const input = field();
    input.focus();
    input.value = "half typed";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await tick();

    expect(input.value).toBe("Take 1");
    expect(onCommit).not.toHaveBeenCalled();
  });

  test("carries the 44 px target height", () => {
    // Tailwind's stylesheet is not loaded in the component runner, so assert the class.
    render(TakeNameInput, { value: "Take 1", label: "Take name" });

    expect(field().className).toContain("min-h-11");
  });
});
