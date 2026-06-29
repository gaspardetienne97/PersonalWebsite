import { describe, expect, test } from "vite-plus/test";

import { load } from "./+page.server";

describe("/music/studio redirect", () => {
  test("redirects to the Create beat-grid mode", () => {
    try {
      load();
      throw new Error("Expected load to redirect.");
    } catch (error) {
      expect(error).toMatchObject({ status: 302, location: "/music/create?mode=beat" });
    }
  });
});
