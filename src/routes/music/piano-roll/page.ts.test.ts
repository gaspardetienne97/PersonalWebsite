import { describe, expect, test } from "vite-plus/test";

import { load } from "./+page.server";

describe("/music/piano-roll redirect", () => {
  test("redirects to the Create piano-roll mode", () => {
    try {
      load();
      throw new Error("Expected load to redirect.");
    } catch (error) {
      expect(error).toMatchObject({ status: 302, location: "/music/create?mode=piano-roll" });
    }
  });
});
