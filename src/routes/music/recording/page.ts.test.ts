import { describe, expect, test } from "vite-plus/test";

import { load } from "./+page.server";

describe("/music/recording redirect", () => {
  test("redirects to the Create recorder mode", () => {
    try {
      load();
      throw new Error("Expected load to redirect.");
    } catch (error) {
      expect(error).toMatchObject({ status: 302, location: "/music/create?mode=recorder" });
    }
  });
});
