import type { SvelteKitPWAOptions } from "@vite-pwa/sveltekit";

export const pwaOptions = {
  scope: "/music",
  buildBase: "/",
  registerType: "autoUpdate",
  includeAssets: ["favicon.svg", "audio/music/piano/*.mp3"],
  kit: {
    includeVersionFile: true,
  },
  manifest: {
    id: "/music",
    name: "Musicianship OS",
    short_name: "Music Practice",
    description:
      "A cross-instrument practice app for ear training, reading, rhythm, theory, and technique.",
    start_url: "/music",
    scope: "/music",
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
  workbox: {
    navigateFallback: undefined,
    cleanupOutdatedCaches: true,
    globIgnores: [
      "client/_app/immutable/assets/web back*.svg",
      "client/audio/**/*",
      // AI cover art is served at runtime, not precached (mirrors the audio ignore).
      "client/images/music/covers/**/*",
    ],
    // The narrator's neural-TTS runtime (Kokoro/transformers, /pdf, opt-in) is a
    // single lazy ~2.2 MB chunk. It's consolidated via `advancedChunks` in
    // vite.config; raise the precache ceiling so the SW build doesn't fail on it.
    maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
  },
} satisfies Partial<SvelteKitPWAOptions>;
