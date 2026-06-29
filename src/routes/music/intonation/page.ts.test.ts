import { describe, expect, test } from "vite-plus/test";

import { load } from "./+page.server";

describe("/music/intonation redirect", () => {
  test("redirects to the unified tuner tool", () => {
    try {
      load();
      throw new Error("Expected load to redirect.");
    } catch (error) {
      expect(error).toMatchObject({ status: 302, location: "/music/tuner" });
    }
  });
});
