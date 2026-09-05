import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import SetupChecklist from "./SetupChecklist.svelte";

describe("SetupChecklist", () => {
  test("renders one row per item with its state word and action", async () => {
    const onclick = vi.fn();
    render(SetupChecklist, {
      items: [
        {
          id: "audio",
          title: "Audio",
          detail: "Enabled",
          state: "ok",
          action: { label: "Test sound", onclick },
        },
        {
          id: "midi",
          title: "MIDI",
          detail: "Not requested",
          state: "off",
          action: { label: "Enable MIDI", href: "/music/connect" },
        },
      ],
    });
    const rows = document.querySelectorAll('[data-testid="setup-checklist"] li');
    expect(rows.length).toBe(2);
    expect(rows[0]?.getAttribute("data-setup-state")).toBe("ok");
    expect(rows[0]?.textContent).toContain("Ready");
    expect(rows[1]?.textContent).toContain("Not set up");
    expect(document.querySelector('a[href="/music/connect"]')?.textContent?.trim()).toBe(
      "Enable MIDI",
    );
    document.querySelector<HTMLButtonElement>("button")?.click();
    expect(onclick).toHaveBeenCalled();
  });
});
