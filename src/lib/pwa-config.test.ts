import { describe, expect, it } from "vite-plus/test";

import { pwaOptions } from "../../pwa.config";

describe("PWA configuration", () => {
  it("installs the music route as a scoped offline app", () => {
    expect(pwaOptions).toBeDefined();
    expect(pwaOptions?.scope).toBe("/music");
    expect(pwaOptions?.manifest).toMatchObject({
      id: "/music",
      start_url: "/music",
      scope: "/music",
      display: "standalone",
    });
    expect(pwaOptions?.manifest?.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: "/pwa-192x192.png", sizes: "192x192" }),
        expect.objectContaining({ src: "/pwa-512x512.png", sizes: "512x512" }),
      ]),
    );
    expect(pwaOptions?.workbox?.navigateFallback).toBe("/music");
    expect(pwaOptions?.workbox?.globIgnores).toContain(
      "client/_app/immutable/assets/web back*.svg",
    );
  });
});
