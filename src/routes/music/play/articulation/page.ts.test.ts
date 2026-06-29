import { describe, expect, test } from "vite-plus/test";

import { load } from "./+page.server";

describe("/music/play/articulation redirect", () => {
  test("redirects to the unified Aerophone articulation mode", () => {
    try {
      load();
      throw new Error("Expected load to redirect.");
    } catch (error) {
      expect(error).toMatchObject({
        status: 302,
        location: "/music/learn/aerophone?mode=articulation",
      });
    }
  });
});
