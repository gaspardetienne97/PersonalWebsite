import type { withPwa } from "@vite-pwa/sveltekit";

export const pwaOptions = {
  scope: "/",
  buildBase: "/",
  registerType: "autoUpdate",
  kit: {
    includeVersionFile: true,
  },
  manifest: {
    id: "/",
    name: "Gaspard Etienne",
    short_name: "Gaspard Etienne",
    description: "Personal website and route apps.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f172a",
    icons: [
      {
        src: "/pwa-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/pwa-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  },
  // The narrator's neural-TTS runtime (Kokoro/transformers, /pdf, opt-in) is a
  // single lazy ~2.2 MB chunk, split out in vite.config; raise the precache
  // ceiling so the service worker build doesn't fail on it.
  maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
  generateSW: {
    navigateFallback: undefined,
    cleanupOutdatedCaches: true,
    globIgnores: ["client/_app/immutable/assets/web back*.svg"],
  },
} satisfies NonNullable<Parameters<typeof withPwa>[1]>;

// @vite-pwa/sveltekit 2 also loads this file on its own and reads its default export.
export default pwaOptions;
