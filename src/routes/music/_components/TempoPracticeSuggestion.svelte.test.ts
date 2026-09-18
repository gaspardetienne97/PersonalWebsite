import { afterEach, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";
import TempoPracticeSuggestion from "./TempoPracticeSuggestion.svelte";

afterEach(() => document.body.replaceChildren());

test.each([false, true])("offers a higher tempo only after a clean run: %s", async (clean) => {
  const onPractice = vi.fn();
  render(TempoPracticeSuggestion, {
    bpm: 80,
    clean,
    basis: "Based on notes and timing.",
    onPractice,
  });
  const button = (text: string) =>
    [...document.querySelectorAll("button")].find((entry) => entry.textContent?.trim() === text);
  expect(Boolean(button("Try 100 BPM"))).toBe(clean);
  button("Again")?.click();
  button("Slow down")?.click();
  if (clean) button("Try 100 BPM")?.click();
  expect(onPractice.mock.calls.map(([bpm]) => bpm)).toEqual(clean ? [80, 60, 100] : [80, 60]);
  onPractice.mockClear();
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "r" }));
  expect(onPractice).toHaveBeenCalledExactlyOnceWith(80);
});
