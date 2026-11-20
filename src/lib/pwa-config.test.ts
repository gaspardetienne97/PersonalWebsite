import { describe, expect, it } from "vite-plus/test";

import { pwaOptions } from "../../pwa.config";

describe("PWA configuration", () => {
  it("installs the site as a scoped app without overriding SSR navigation", () => {
    expect(pwaOptions).toBeDefined();
    expect(pwaOptions?.buildBase).toBe("/");
    expect(pwaOptions?.scope).toBe("/");
    expect(pwaOptions?.manifest).toMatchObject({
      id: "/",
      start_url: "/",
      scope: "/",
      display: "standalone",
    });
    expect(pwaOptions?.manifest?.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: "/pwa-192x192.png", sizes: "192x192" }),
        expect.objectContaining({ src: "/pwa-512x512.png", sizes: "512x512" }),
      ]),
    );
    expect(pwaOptions?.generateSW?.navigateFallback).toBeUndefined();
    expect(pwaOptions?.generateSW?.globIgnores).toContain(
      "client/_app/immutable/assets/web back*.svg",
    );
  });
});
