import { afterEach, describe, expect, test } from "vite-plus/test";

import { clearStoredDrillSearches, initialDrillSearch, syncRouteQuery } from "./route-state";
import { setTestUrl } from "./test-url";

afterEach(() => {
  setTestUrl("/");
});

describe("drill config persistence", () => {
  test("syncRouteQuery remembers the setup and a plain visit restores it", () => {
    setTestUrl("/music/play/licks");
    syncRouteQuery("/music/play/licks?category=minor-ii-V-i&lick=12");

    // Simulate a later plain visit to the same drill.
    setTestUrl("/music/play/licks", {});
    // setTestUrl("/") is the only clearing idiom; a drill URL must not clear.
    const restored = initialDrillSearch();
    expect(restored.get("category")).toBe("minor-ii-V-i");
    expect(restored.get("lick")).toBe("12");
  });

  test("explicit URL params win over the remembered setup", () => {
    setTestUrl("/music/play/licks");
    syncRouteQuery("/music/play/licks?category=minor-ii-V-i&lick=12");

    setTestUrl("/music/play/licks?lick=3");
    const search = initialDrillSearch();
    expect(search.get("lick")).toBe("3");
    expect(search.get("category")).toBeNull();
  });

  test("memory is per drill path", () => {
    setTestUrl("/music/play/licks");
    syncRouteQuery("/music/play/licks?lick=12");

    setTestUrl("/music/learn/rhythm");
    expect([...initialDrillSearch().keys()]).toEqual([]);
  });

  test("setTestUrl('/') clears remembered setups for test isolation", () => {
    setTestUrl("/music/play/licks");
    syncRouteQuery("/music/play/licks?lick=12");

    setTestUrl("/");
    setTestUrl("/music/play/licks");
    expect([...initialDrillSearch().keys()]).toEqual([]);
    clearStoredDrillSearches();
  });
});
