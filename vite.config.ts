import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { SvelteKitPWA } from "@vite-pwa/sveltekit";
import { defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

import { pwaOptions } from "./pwa.config";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit(), SvelteKitPWA(pwaOptions)],
  build: {
    rollupOptions: {
      output: {
        // Keep the in-browser neural-TTS runtime (Kokoro + transformers.js +
        // onnxruntime) in one named, lazily-loaded chunk so it stays out of the
        // music PWA precache and only downloads when a reader opts into it.
        // Rolldown (vite-plus) groups chunks via `advancedChunks`, not rollup's
        // `manualChunks`.
        advancedChunks: {
          groups: [
            {
              name: "kokoro-tts",
              test: /[\\/]node_modules[\\/](@huggingface[\\/]transformers|kokoro-js|onnxruntime[^\\/]*|phonemizer)[\\/]/,
            },
          ],
        },
      },
    },
  },
  optimizeDeps: {
    include: [
      "lucide-svelte/icons/moon",
      "lucide-svelte/icons/sun",
      "lucide-svelte/icons/bookmark",
      "lucide-svelte/icons/bookmark-check",
      "lucide-svelte/icons/ear",
      "lucide-svelte/icons/play",
      "lucide-svelte/icons/search",
      // Narrator (/pdf) icons
      "lucide-svelte/icons/align-left",
      "lucide-svelte/icons/arrow-left",
      "lucide-svelte/icons/audio-waveform",
      "lucide-svelte/icons/book-open",
      "lucide-svelte/icons/check",
      "lucide-svelte/icons/chevron-down",
      "lucide-svelte/icons/clock",
      "lucide-svelte/icons/file-text",
      "lucide-svelte/icons/gauge",
      "lucide-svelte/icons/headphones",
      "lucide-svelte/icons/list",
      "lucide-svelte/icons/mic",
      "lucide-svelte/icons/pause",
      "lucide-svelte/icons/plus",
      "lucide-svelte/icons/quote",
      "lucide-svelte/icons/skip-back",
      "lucide-svelte/icons/skip-forward",
      "lucide-svelte/icons/sliders-horizontal",
      "lucide-svelte/icons/sparkles",
      "lucide-svelte/icons/trash-2",
      "lucide-svelte/icons/type",
      "lucide-svelte/icons/upload",
      "lucide-svelte/icons/x",
      "svguitar",
      "tone",
      "@repo/music-core > webmidi",
    ],
  },
  test: {
    include: ["src/**/*.{test,spec}.{ts,js}", "packages/**/*.{test,spec}.{ts,js}"],
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
  staged: {
    "*": "vp fmt --no-error-on-unmatched-pattern",
  },
  fmt: {
    ignorePatterns: [
      ".direnv/**",
      ".claude/**",
      ".codex/**",
      ".superpowers/**",
      ".svelte-kit/**",
      "apps/*/.svelte-kit/**",
      "packages/*/.svelte-kit/**",
      "build/**",
      "domain/**",
      "apps/*/build/**",
      "node_modules/**",
      "project.inlang/**",
      "src/lib/paraglide/**",
      "**/*.md",
    ],
  },
  lint: {
    ignorePatterns: [
      "**/node_modules/**",
      "**/.claude/**",
      "**/.codex/**",
      "**/.superpowers/**",
      "**/.svelte-kit/**",
      "domain/**",
      "apps/*/.svelte-kit/**",
      "packages/*/.svelte-kit/**",
      "**/src/lib/paraglide/**",
      "**/dist/**",
      "**/build/**",
      "apps/*/build/**",
    ],
    options: { typeAware: false, typeCheck: false },
  },
  run: {
    cache: true,
  },
});
