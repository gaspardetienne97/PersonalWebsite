import { describe, expect, test } from "vite-plus/test";

import { load } from "./+page.server";

describe("/music/routine redirect", () => {
  test("redirects to the Practice Today tab", () => {
    try {
      load();
      throw new Error("Expected load to redirect.");
    } catch (error) {
      expect(error).toMatchObject({ status: 302, location: "/music" });
    }
  });
});
