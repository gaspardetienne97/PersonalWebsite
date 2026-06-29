import { describe, expect, test } from "vite-plus/test";

import { load } from "./+page.server";

describe("/music/songs redirect", () => {
  test("redirects to the Library songs tab", () => {
    try {
      load();
      throw new Error("Expected load to redirect.");
    } catch (error) {
      expect(error).toMatchObject({ status: 302, location: "/music/library?tab=songs" });
    }
  });
});
