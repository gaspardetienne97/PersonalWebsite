import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { MusicRuntime } from "../_runtime.svelte";
import DrillFocusScope from "./DrillFocusScope.svelte";

afterEach(() => {
  document.body.replaceChildren();
});

describe("DrillFocusScope", () => {
  test("mirrors `active` into runtime.drillFocus and clears on unmount", async () => {
    const runtime = new MusicRuntime();

    const first = render(DrillFocusScope, { active: true, runtime });
    await vi.waitFor(() => expect(runtime.drillFocus).toBe(true));

    first.unmount();
    await vi.waitFor(() => expect(runtime.drillFocus).toBe(false));

    render(DrillFocusScope, { active: false, runtime });
    await vi.waitFor(() => expect(runtime.drillFocus).toBe(false));
    runtime.dispose();
  });
});
