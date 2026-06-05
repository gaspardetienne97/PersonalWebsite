import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import InstrumentBadge from "./InstrumentBadge.svelte";

describe("InstrumentBadge", () => {
  test("renders the instrument label", () => {
    render(InstrumentBadge, { instrument: "Piano" });
    expect(document.body.textContent).toContain("Piano");
  });
});
