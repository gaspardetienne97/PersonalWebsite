import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import SourceReadout from "./SourceReadout.svelte";

describe("SourceReadout", () => {
  test("shows source label and device name", () => {
    render(SourceReadout, { label: "Active input", device: "Roland FP-30X" });
    expect(document.body.textContent).toContain("Active input");
    expect(document.body.textContent).toContain("Roland FP-30X");
  });
});
