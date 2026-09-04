import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { SvelteKitPWA } from "@vite-pwa/sveltekit";
import type { RollupLog } from "rollup";
import { defineConfig, type UserConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

import { pwaOptions } from "./pwa.config";

function buildOptions(isSsrBuild?: boolean): UserConfig["build"] {
  const rolldownOptions = {
    checks: { pluginTimings: false },
    onLog(level: string, log: RollupLog, handler: (level: string, log: RollupLog) => void) {
      if (isIgnoredBuildLog(log)) return;
      handler(level, log);
    },
  };
  if (isSsrBuild) return { rolldownOptions };
  return {
    rolldownOptions,
    rollupOptions: {
      onLog(level, log, handler) {
        if (isIgnoredBuildLog(log)) return;
        handler(level, log);
      },
      output: {
        // Keep the in-browser neural-TTS runtime (Kokoro + transformers.js +
        // onnxruntime) in one named, lazily-loaded chunk that only downloads
        // when a reader opts into neural TTS. Rolldown (vite-plus) groups
        // chunks via `advancedChunks` — rollup's `manualChunks` is silently
        // ignored here, so don't swap this back.
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
  };
}

function isIgnoredBuildLog(log: RollupLog): boolean {
  const id = log.id ?? "";
  return (
    (log.code === "INVALID_ANNOTATION" && id.includes("@huggingface/transformers")) ||
    (log.code === "CIRCULAR_DEPENDENCY" && (id.includes("readable-stream") || id.includes("jszip")))
  );
}

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [tailwindcss(), sveltekit(), SvelteKitPWA(pwaOptions)],
  build: buildOptions(isSsrBuild),
  ssr: {
    // svelte-sonner ships raw .svelte files; Vite must compile them for SSR
    // instead of letting Node import the .svelte extension directly.
    noExternal: ["svelte-sonner"],
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
      "lucide-svelte/icons/arrow-right",
      "lucide-svelte/icons/audio-waveform",
      "lucide-svelte/icons/book-open",
      "lucide-svelte/icons/check",
      "lucide-svelte/icons/chevron-down",
      "lucide-svelte/icons/clock",
      "lucide-svelte/icons/cpu",
      "lucide-svelte/icons/download",
      "lucide-svelte/icons/file-text",
      "lucide-svelte/icons/gauge",
      "lucide-svelte/icons/headphones",
      "lucide-svelte/icons/list",
      "lucide-svelte/icons/mic",
      "lucide-svelte/icons/mic-off",
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
      "lucide-svelte/icons/zap",
      "svguitar",
      "tone",
      "opensheetmusicdisplay",
      "@spotify/basic-pitch",
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
}));
